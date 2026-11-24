// Cadastro de fornecedores (qualquer usuário logado vê; criar/editar/apagar exige login).
import { json } from './api.js';
import { usuarioLogado } from './auth.js';

const erro = (m, s = 400) => json({ erro: m }, s);
const txt = (v, n = 200) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n); return t || null; };

function ler(c) {
  const nome = txt(c.nome, 80); if (!nome) return { erro: 'Falta o nome do fornecedor.' };
  const prazo = c.prazo_dias === '' || c.prazo_dias == null ? null : Number(c.prazo_dias);
  if (prazo !== null && (!Number.isInteger(prazo) || prazo < 0 || prazo > 365)) return { erro: 'Prazo de pagamento: número de dias de 0 a 365.' };
  const min = c.pedido_minimo === '' || c.pedido_minimo == null ? null : Number(c.pedido_minimo);
  if (min !== null && !(min >= 0 && min < 1e7)) return { erro: 'Pedido mínimo inválido.' };
  return { d: { nome, como_recebe: txt(c.como_recebe, 60), contato: txt(c.contato, 120), cnpj: txt(c.cnpj, 20), endereco: txt(c.endereco, 200), prazo_dias: prazo, pedido_minimo: min, observacao: txt(c.observacao, 300), ativo: c.ativo === false || c.ativo === 0 ? 0 : 1 } };
}

export async function rotearFornecedores(request, env, url) {
  if (!(await usuarioLogado(request, env))) return erro('Entre com seu nome e senha', 401);
  const db = env.DB, m = request.method, p = url.pathname;
  if (m === 'GET' && p === '/api/fornecedores') {
    const { results } = await db.prepare(`SELECT f.*, (SELECT COUNT(*) FROM insumo i WHERE i.fornecedor_id = f.id AND i.ativo = 1) AS itens,
      (SELECT MAX(c.data) FROM compra c WHERE c.fornecedor_id = f.id) AS ultima_compra FROM fornecedor f ORDER BY f.ativo DESC, f.nome COLLATE NOCASE`).all();
    return json({ fornecedores: results });
  }
  let c = {}; if (m === 'POST' || m === 'PUT') { try { c = await request.json(); } catch { return erro('Corpo da requisição não é JSON'); } }
  if (m === 'POST' && p === '/api/fornecedores') {
    const r = ler(c); if (r.erro) return erro(r.erro); const d = r.d;
    if (await db.prepare('SELECT 1 AS x FROM fornecedor WHERE nome = ? COLLATE NOCASE').bind(d.nome).first()) return erro('Já existe um fornecedor com esse nome.', 409);
    const x = await db.prepare('INSERT INTO fornecedor (nome, como_recebe, contato, cnpj, endereco, prazo_dias, pedido_minimo, observacao, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(d.nome, d.como_recebe, d.contato, d.cnpj, d.endereco, d.prazo_dias, d.pedido_minimo, d.observacao, d.ativo).first();
    return json({ ok: true, id: x.id }, 201);
  }
  const k = p.match(/^\/api\/fornecedores\/(\d+)$/); if (!k) return null;
  const id = Number(k[1]);
  if (!(await db.prepare('SELECT 1 AS x FROM fornecedor WHERE id = ?').bind(id).first())) return erro('Fornecedor não encontrado.', 404);
  if (m === 'PUT') {
    const r = ler(c); if (r.erro) return erro(r.erro); const d = r.d;
    if (await db.prepare('SELECT 1 AS x FROM fornecedor WHERE nome = ? COLLATE NOCASE AND id <> ?').bind(d.nome, id).first()) return erro('Já existe um fornecedor com esse nome.', 409);
    await db.prepare('UPDATE fornecedor SET nome = ?, como_recebe = ?, contato = ?, cnpj = ?, endereco = ?, prazo_dias = ?, pedido_minimo = ?, observacao = ?, ativo = ? WHERE id = ?')
      .bind(d.nome, d.como_recebe, d.contato, d.cnpj, d.endereco, d.prazo_dias, d.pedido_minimo, d.observacao, d.ativo, id).run();
    return json({ ok: true });
  }
  if (m === 'DELETE') {
    const uso = await db.prepare('SELECT (SELECT COUNT(*) FROM insumo WHERE fornecedor_id = ?1) AS i, (SELECT COUNT(*) FROM compra WHERE fornecedor_id = ?1) AS c').bind(id).first();
    if (uso.i || uso.c) return erro('Esse fornecedor já tem itens ou compras. Desative em vez de apagar.', 409);
    await db.prepare('DELETE FROM fornecedor WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  return null;
}
