// Combos de produtos. O combo é um produto vendável cujo estoque baixa pelos produtos que o compõem.
import { json } from './api.js';
import { usuarioLogado } from './auth.js';
import { normalizarNome } from './dominio/estoque.js';

const erro = (msg, status = 400) => json({ erro: msg }, status);

async function lerCombos(db, id = null) {
  const { results: cs } = await db.prepare(
    `SELECT p.id, p.nome, p.preco_venda, p.ativo FROM produto p WHERE p.id IN (SELECT combo_id FROM combo_item) ${id ? 'AND p.id = ?' : ''} ORDER BY p.nome`)
    .bind(...(id ? [id] : [])).all();
  const { results: its } = await db.prepare(
    'SELECT ci.combo_id, ci.produto_id, p.nome, ci.quantidade FROM combo_item ci JOIN produto p ON p.id = ci.produto_id ORDER BY p.nome').all();
  return cs.map((c) => ({ ...c, ativo: !!c.ativo, itens: its.filter((i) => i.combo_id === c.id).map(({ combo_id, ...i }) => i) }));
}

async function validar(db, corpo, idAtual) {
  const nome = String(corpo.nome ?? '').replace(/\s+/g, ' ').trim();
  if (nome.length < 2) return { erro: 'Digite o nome do combo.' };
  const preco = Number(corpo.preco_venda);
  if (!Number.isFinite(preco) || preco <= 0 || preco > 5000) return { erro: 'Digite o preço do combo.' };
  const mapa = new Map();
  for (const l of Array.isArray(corpo.itens) ? corpo.itens : []) {
    const id = Number(l?.produto_id), q = Number(l?.quantidade);
    if (!Number.isInteger(id) || !Number.isInteger(q) || q < 1 || q > 50) return { erro: 'Quantidade inválida num dos itens.' };
    mapa.set(id, (mapa.get(id) ?? 0) + q);
  }
  if (mapa.size < 1) return { erro: 'Escolha pelo menos um produto para o combo.' };
  for (const id of mapa.keys()) {
    if (id === idAtual) return { erro: 'Um combo não pode conter ele mesmo.' };
    const p = await db.prepare('SELECT id, (SELECT COUNT(*) FROM combo_item WHERE combo_id = produto.id) AS ehCombo FROM produto WHERE id = ? AND ativo = 1').bind(id).first();
    if (!p) return { erro: 'Um dos produtos escolhidos não existe ou está desativado.' };
    if (p.ehCombo) return { erro: 'Um combo não pode conter outro combo.' };
  }
  const norm = normalizarNome(nome);
  const dup = await db.prepare('SELECT id FROM produto WHERE nome_normalizado = ? AND id IS NOT ?').bind(norm, idAtual).first();
  if (dup) return { erro: 'Já existe um produto com esse nome.' };
  return { dados: { nome, norm, preco: Math.round(preco * 100) / 100, itens: [...mapa] } };
}

export async function rotearCombos(request, env, url) {
  const db = env.DB, m = request.method;
  if (!(await usuarioLogado(request, env))) return erro('Entre com seu nome e senha', 401);
  const k = url.pathname.match(/^\/api\/combos\/(\d+)$/), colecao = url.pathname === '/api/combos';
  if (colecao && m === 'GET') return json(await lerCombos(db));
  let corpo = {};
  if (m === 'POST' || m === 'PUT') { try { corpo = await request.json(); } catch { return erro('Corpo da requisição não é JSON'); } }

  if (colecao && m === 'POST') {
    const v = await validar(db, corpo, null); if (v.erro) return erro(v.erro);
    const d = v.dados;
    const novo = await db.prepare("INSERT INTO produto (nome, nome_normalizado, categoria, preco_venda, baixa_estoque, ativo) VALUES (?, ?, 'Promoções e kits', ?, 1, 1) RETURNING id").bind(d.nome, d.norm, d.preco).first();
    await db.batch(d.itens.map(([p, q]) => db.prepare('INSERT INTO combo_item (combo_id, produto_id, quantidade) VALUES (?, ?, ?)').bind(novo.id, p, q)));
    return json({ ok: true, combo: (await lerCombos(db, novo.id))[0] }, 201);
  }
  if (k && (m === 'PUT' || m === 'DELETE')) {
    const id = Number(k[1]);
    if (!(await db.prepare('SELECT 1 AS ok FROM combo_item WHERE combo_id = ? LIMIT 1').bind(id).first())) return erro('Combo não encontrado.', 404);
    if (m === 'DELETE') { await db.prepare('UPDATE produto SET ativo = 0 WHERE id = ?').bind(id).run(); return json({ ok: true }); }
    const v = await validar(db, corpo, id); if (v.erro) return erro(v.erro);
    const d = v.dados, ativo = corpo.ativo === false ? 0 : 1;
    await db.batch([
      db.prepare('UPDATE produto SET nome = ?, nome_normalizado = ?, preco_venda = ?, ativo = ? WHERE id = ?').bind(d.nome, d.norm, d.preco, ativo, id),
      db.prepare('DELETE FROM combo_item WHERE combo_id = ?').bind(id),
      ...d.itens.map(([p, q]) => db.prepare('INSERT INTO combo_item (combo_id, produto_id, quantidade) VALUES (?, ?, ?)').bind(id, p, q)),
    ]);
    return json({ ok: true, combo: (await lerCombos(db, id))[0] });
  }
  return null;
}
