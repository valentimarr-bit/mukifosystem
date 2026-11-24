// Cadastro de produtos: criar, editar (nome, preço, ficha técnica) e desativar. Exige login.
import { json } from './api.js';
import { usuarioLogado } from './auth.js';
import { normalizarNome } from './dominio/estoque.js';

const erro = (msg, status = 400) => json({ erro: msg }, status);

async function lerProduto(db, id) {
  const p = await db.prepare('SELECT id, nome, categoria, preco_venda, baixa_estoque, ativo, tempo_preparo_min, pronta_entrega FROM produto WHERE id = ?').bind(id).first();
  if (!p) return null;
  const { results } = await db.prepare(
    `SELECT ft.insumo_id, i.nome AS insumo, i.unidade_ficha, ft.quantidade, ft.observacao
     FROM ficha_tecnica ft JOIN insumo i ON i.id = ft.insumo_id WHERE ft.produto_id = ? ORDER BY ft.id`).bind(id).all();
  return { ...p, baixa_estoque: !!p.baixa_estoque, ativo: !!p.ativo, ficha: results };
}

/** Confere o corpo e devolve { dados } ou { erro }. */
async function validar(db, corpo, idAtual) {
  const nome = String(corpo.nome ?? '').replace(/\s+/g, ' ').trim();
  if (nome.length < 2) return { erro: 'Digite o nome do produto.' };
  let preco = null;
  if (corpo.preco_venda !== null && corpo.preco_venda !== undefined && corpo.preco_venda !== '') {
    preco = Number(corpo.preco_venda);
    if (!Number.isFinite(preco) || preco < 0) return { erro: 'Preço inválido.' };
  }
  let tempo = null;
  if (corpo.tempo_preparo_min !== null && corpo.tempo_preparo_min !== undefined && corpo.tempo_preparo_min !== '') {
    tempo = Number(corpo.tempo_preparo_min);
    if (!Number.isFinite(tempo) || tempo <= 0 || tempo > 180) return { erro: 'Tempo de preparo inválido (use de 1 a 180 minutos, ou deixe vazio para o padrão).' };
  }
  const pronta = corpo.pronta_entrega ? 1 : 0;
  const ficha = Array.isArray(corpo.ficha) ? corpo.ficha : [];
  const vistos = new Set();
  for (const l of ficha) {
    const insumo = Number(l.insumo_id), q = Number(l.quantidade);
    if (!Number.isInteger(insumo)) return { erro: 'Escolha o ingrediente em todas as linhas da ficha.' };
    if (!Number.isFinite(q) || q <= 0) return { erro: 'A quantidade de cada ingrediente precisa ser maior que zero.' };
    if (vistos.has(insumo)) return { erro: 'Um ingrediente aparece duas vezes na ficha.' };
    vistos.add(insumo);
    if (!(await db.prepare('SELECT 1 AS ok FROM insumo WHERE id = ?').bind(insumo).first())) return { erro: 'Ingrediente não encontrado.' };
  }
  const norm = normalizarNome(nome);
  const dup = await db.prepare('SELECT id FROM produto WHERE nome_normalizado = ? AND id <> ?').bind(norm, idAtual ?? -1).first();
  if (dup) return { erro: 'Já existe um produto com esse nome.' };
  return { dados: { nome, norm, preco, tempo, pronta, categoria: corpo.categoria ? String(corpo.categoria).trim() || null : null,
    baixa: corpo.baixa_estoque === false || corpo.baixa_estoque === 0 ? 0 : 1, ativo: corpo.ativo === false || corpo.ativo === 0 ? 0 : 1,
    ficha: ficha.map((l) => ({ insumo: Number(l.insumo_id), q: Number(l.quantidade), obs: l.observacao ? String(l.observacao).trim() || null : null })) } };
}

export async function rotearProdutos(request, env, url) {
  const db = env.DB;
  const m = request.method;
  const k = url.pathname.match(/^\/api\/produtos\/(\d+)$/);
  const colecao = url.pathname === '/api/produtos';
  if (!k && !(colecao && m === 'POST')) return null;

  const eu = await usuarioLogado(request, env);
  if (!eu) return erro('Entre com seu nome e senha', 401);
  const id = k ? Number(k[1]) : null;

  if (m === 'GET' && k) {
    const p = await lerProduto(db, id);
    return p ? json(p) : erro('Produto não encontrado.', 404);
  }

  let corpo;
  try { corpo = await request.json(); } catch { return erro('Corpo da requisição não é JSON'); }

  if (m === 'POST' && colecao) {
    const v = await validar(db, corpo, null);
    if (v.erro) return erro(v.erro);
    const d = v.dados;
    const novo = await db.prepare('INSERT INTO produto (nome, nome_normalizado, categoria, preco_venda, baixa_estoque, ativo, tempo_preparo_min, pronta_entrega) VALUES (?, ?, ?, ?, ?, 1, ?, ?) RETURNING id')
      .bind(d.nome, d.norm, d.categoria, d.preco, d.baixa, d.tempo, d.pronta).first();
    if (d.ficha.length) await db.batch(d.ficha.map((l) => db.prepare('INSERT INTO ficha_tecnica (produto_id, insumo_id, quantidade, observacao) VALUES (?, ?, ?, ?)').bind(novo.id, l.insumo, l.q, l.obs)));
    return json({ ok: true, produto: await lerProduto(db, novo.id) }, 201);
  }

  if (m === 'PUT' && k) {
    const atual = await db.prepare('SELECT id FROM produto WHERE id = ?').bind(id).first();
    if (!atual) return erro('Produto não encontrado.', 404);
    const v = await validar(db, corpo, id);
    if (v.erro) return erro(v.erro);
    const d = v.dados;
    await db.batch([
      db.prepare('UPDATE produto SET nome = ?, nome_normalizado = ?, categoria = ?, preco_venda = ?, baixa_estoque = ?, ativo = ?, tempo_preparo_min = ?, pronta_entrega = ? WHERE id = ?')
        .bind(d.nome, d.norm, d.categoria, d.preco, d.baixa, d.ativo, d.tempo, d.pronta, id),
      db.prepare('UPDATE item_pedido SET nome = ? WHERE produto_id = ?').bind(d.nome, id), // o histórico continua casando com o produto
      db.prepare('DELETE FROM ficha_tecnica WHERE produto_id = ?').bind(id),
      ...d.ficha.map((l) => db.prepare('INSERT INTO ficha_tecnica (produto_id, insumo_id, quantidade, observacao) VALUES (?, ?, ?, ?)').bind(id, l.insumo, l.q, l.obs)),
    ]);
    return json({ ok: true, produto: await lerProduto(db, id) });
  }
  return null;
}
