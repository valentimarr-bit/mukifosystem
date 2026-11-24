// Carteira do cliente: recarga por Pix (confirmada pelo balcão ou pelo webhook do gateway), compra com saldo e extrato.
import { json } from './api.js';
import { r2, erro, id8 } from './venda.js';
import { gerarPix } from './pagamentos/pix.js';
import { cobrarPix, pixDaRef } from './pagamentos/gateways.js';
import { lerPix } from './cliente.js';
import { modoTeste } from './trava.js';
import { clienteLogado } from './clientes.js';

const MIN_RECARGA = 5, MAX_RECARGA = 500, VALIDADE_MIN = 30, MAX_SALDO = 1000;

/** Credita a recarga uma única vez (índice único em recarga_id impede crédito duplo, mesmo com webhook repetido). */
export async function confirmarRecarga(db, id, operador) {
  const r = await db.prepare('SELECT id, cliente_id, valor, status FROM recarga WHERE id = ?').bind(id).first();
  if (!r) return { erro: 'Recarga não encontrada.', status: 404 };
  if (r.status === 'paga') return { ok: true, ja: true };
  if (r.status !== 'pendente') return { erro: 'Essa recarga foi cancelada ou venceu.', status: 409 };
  const u = await db.prepare("UPDATE recarga SET status = 'paga', paga_em = datetime('now'), operador = ? WHERE id = ? AND status = 'pendente'").bind(operador, id).run();
  if (!u?.meta?.changes) return { ok: true, ja: true };
  await db.batch([
    db.prepare("INSERT INTO carteira_mov (cliente_id, valor, motivo, recarga_id, operador) VALUES (?, ?, 'recarga', ?, ?)").bind(r.cliente_id, r.valor, id, operador),
    db.prepare('UPDATE cliente SET saldo = ROUND(saldo + ?, 2) WHERE id = ?').bind(r.valor, r.cliente_id)]);
  return { ok: true, valor: r.valor };
}

/** Débito atômico: só passa se houver saldo. Devolve true/false. */
export async function debitarSaldo(db, clienteId, valor, pedidoId) {
  const u = await db.prepare('UPDATE cliente SET saldo = ROUND(saldo - ?, 2) WHERE id = ? AND saldo >= ?').bind(valor, clienteId, valor).run();
  if (!u?.meta?.changes) return false;
  try { await db.prepare("INSERT INTO carteira_mov (cliente_id, valor, motivo, pedido_id) VALUES (?, ?, 'compra', ?)").bind(clienteId, -valor, pedidoId).run(); }
  catch { await db.prepare('UPDATE cliente SET saldo = ROUND(saldo + ?, 2) WHERE id = ?').bind(valor, clienteId).run(); return false; }
  return true;
}

export async function devolverSaldo(db, clienteId, valor, pedidoId) {
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO carteira_mov (cliente_id, valor, motivo, pedido_id, obs) VALUES (?, ?, 'estorno', ?, 'pedido não concluído')").bind(clienteId, valor, pedidoId),
    db.prepare('UPDATE cliente SET saldo = ROUND(saldo + ?, 2) WHERE id = ?').bind(valor, clienteId)]);
}

export async function extrato(db, clienteId) {
  const [s, m, rp] = await Promise.all([
    db.prepare('SELECT saldo FROM cliente WHERE id = ?').bind(clienteId).first(),
    db.prepare('SELECT valor, motivo, criado_em FROM carteira_mov WHERE cliente_id = ? ORDER BY id DESC LIMIT 20').bind(clienteId).all(),
    db.prepare("SELECT id, valor, expira_em FROM recarga WHERE cliente_id = ? AND status = 'pendente' AND expira_em > datetime('now') ORDER BY criada_em DESC LIMIT 1").bind(clienteId).first()]);
  const pix = rp ? await lerPix(db) : null;
  return { saldo: s?.saldo ?? 0, movimentos: m.results, pendente: rp ? { id: rp.id, valor: rp.valor, pix: (await pixDaRef(db, rp.id)) ?? (pix?.chave ? gerarPix({ ...pix, valor: rp.valor, txid: `MKR${rp.id.replace(/\W/g, '').slice(-20)}` }) : null) } : null };
}

/** Rotas do cliente logado. */
export async function rotearCarteira(request, env, url) {
  const p = url.pathname, m = request.method;
  if (!p.startsWith('/api/conta/carteira')) return null;
  const db = env.DB, cli = await clienteLogado(request, env);
  if (!cli) return erro('Entre na sua conta.', 401);
  if (m === 'GET' && p === '/api/conta/carteira') return json(await extrato(db, cli.id));
  if (m === 'POST' && p === '/api/conta/carteira/recarga') {
    let c = {}; try { c = await request.json(); } catch { /* vazio */ }
    const valor = r2(Number(c?.valor));
    if (!Number.isFinite(valor) || valor < MIN_RECARGA || valor > MAX_RECARGA) return erro(`Recarga de R$ ${MIN_RECARGA} a R$ ${MAX_RECARGA}.`);
    if (r2(cli.saldo + valor) > MAX_SALDO) return erro(`O saldo da carteira não pode passar de R$ ${MAX_SALDO}.`);
    const teste = await modoTeste(db), pix = await lerPix(db);
    if (teste && !pix.chave) pix.chave = 'teste@mukifo.app';
    if (!pix.chave) return erro('Recargas ainda não foram liberadas. Fale com o balcão.', 503);
    await db.prepare("UPDATE recarga SET status = 'cancelada' WHERE cliente_id = ? AND status = 'pendente'").bind(cli.id).run();   // uma recarga aberta por vez
    const id = `rec-${id8()}${id8()}`;
    await db.prepare(`INSERT INTO recarga (id, cliente_id, valor, expira_em) VALUES (?, ?, ?, datetime('now', '+${VALIDADE_MIN} minutes'))`).bind(id, cli.id, valor).run();
    if (teste) await confirmarRecarga(db, id, 'teste');
    else await cobrarPix(db, env, request, { ref: id, valor, descricao: 'Recarga da carteira Mukifo', expiraMin: VALIDADE_MIN });   // gateway ativo, se houver
    return json(await extrato(db, cli.id), 201);
  }
  return null;
}

/** Balcão: recargas esperando o Pix, confirmar, e ajuste manual (dinheiro no balcão, estorno). */
export async function recargasPendentes(db) {
  const { results } = await db.prepare("SELECT r.id, r.valor, r.criada_em, c.nome FROM recarga r JOIN cliente c ON c.id = r.cliente_id WHERE r.status = 'pendente' AND r.expira_em > datetime('now') ORDER BY r.criada_em").all();
  return results;
}

export async function ajustarSaldo(db, clienteId, corpo, operador) {
  const valor = r2(Number(corpo?.valor)), obs = String(corpo?.obs ?? '').trim().slice(0, 80);
  if (!Number.isFinite(valor) || valor === 0 || Math.abs(valor) > MAX_RECARGA) return erro('Valor inválido.');
  if (!obs) return erro('Escreva o motivo (ex.: recarga em dinheiro, estorno).');
  const cli = await db.prepare('SELECT id, saldo FROM cliente WHERE id = ?').bind(clienteId).first();
  if (!cli) return erro('Cliente não encontrado.', 404);
  if (valor < 0) {
    const u = await db.prepare('UPDATE cliente SET saldo = ROUND(saldo + ?, 2) WHERE id = ? AND saldo + ? >= 0').bind(valor, clienteId, valor).run();
    if (!u?.meta?.changes) return erro('Saldo insuficiente para esse débito.', 409);
  } else await db.prepare('UPDATE cliente SET saldo = ROUND(saldo + ?, 2) WHERE id = ?').bind(valor, clienteId).run();
  await db.prepare("INSERT INTO carteira_mov (cliente_id, valor, motivo, operador, obs) VALUES (?, ?, 'ajuste', ?, ?)").bind(clienteId, valor, operador, obs).run();
  return json({ ok: true, saldo: (await db.prepare('SELECT saldo FROM cliente WHERE id = ?').bind(clienteId).first()).saldo });
}
