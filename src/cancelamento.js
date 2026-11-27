// Cancelar pedido (gerente ou superadmin com o módulo "Cancelar pedidos") e o histórico de cancelados.
// Tudo fica registrado em `cancelamento` (quem, quando, por quê, quanto tinha entrado e o que foi devolvido) e nunca se apaga.
import { json } from './api.js';
import { usuarioLogado } from './auth.js';
import { r2, erro } from './venda.js';

const ESTORNOS = ['nenhum', 'saldo', 'por_fora'];

async function cancelar(db, id, corpo, eu) {
  const p = await db.prepare('SELECT id, numero, origem, dia, status, total, nome_cliente, cliente_id FROM pedido WHERE id = ?').bind(id).first();
  if (!p) return erro('Pedido não encontrado.', 404);
  if (p.status === 'cancelado') return erro('Esse pedido já está cancelado.', 409);
  const motivo = String(corpo?.motivo ?? '').trim().slice(0, 200);
  if (motivo.length < 3) return erro('Escreva o motivo do cancelamento.');

  const [{ results: itens }, { results: cobs }, baixa, pts] = await Promise.all([
    db.prepare('SELECT nome, quantidade FROM item_pedido WHERE pedido_id = ? ORDER BY id').bind(id).all(),
    db.prepare("SELECT forma, valor, operador FROM cobranca WHERE pedido_id = ? AND status = 'paga'").bind(id).all(),
    db.prepare("SELECT COUNT(*) AS n FROM movimento_estoque WHERE tipo = 'venda' AND referencia = ?").bind(id).first(),
    db.prepare("SELECT cliente_id, pontos FROM ponto_mov WHERE pedido_id = ? AND motivo = 'compra'").bind(id).first(),
  ]);
  const pago = r2(cobs.reduce((s, c) => s + c.valor, 0));
  const pagoComSaldo = cobs.some((c) => c.operador === 'saldo');

  // Dinheiro: se já entrou, a pessoa escolhe como devolve. Pago com saldo volta para o saldo.
  let estorno = String(corpo?.estorno ?? '');
  if (pago <= 0) estorno = 'nenhum';
  else if (!estorno) estorno = pagoComSaldo ? 'saldo' : '';
  if (!ESTORNOS.includes(estorno)) return erro('Esse pedido já foi pago. Escolha como o dinheiro volta: no saldo do cliente, devolvido no balcão, ou sem devolução.');
  if (estorno === 'saldo' && !p.cliente_id) return erro('Esse pedido não tem conta de cliente. Escolha "devolvido no balcão".');
  // Estoque: volta por padrão se ainda não começou o preparo; depois disso, a pessoa decide (o que foi feito e jogado fora não volta).
  const devolver = baixa.n > 0 && (corpo?.devolver_estoque ?? ['aguardando_pagamento', 'aberta', 'recebido'].includes(p.status)) === true;

  // Primeiro troca o status, só se ninguém mexeu no pedido nesse meio-tempo; o resto vem depois, uma vez só.
  const u = await db.prepare("UPDATE pedido SET status = 'cancelado' WHERE id = ? AND status = ?").bind(id, p.status).run();
  if (!u?.meta?.changes) return erro('O pedido mudou agora há pouco. Atualize a tela e tente de novo.', 409);
  const lote = [
    db.prepare(`INSERT INTO cancelamento (pedido_id, numero, origem, dia, cliente, itens, total, pago, status_antes, motivo, estorno, valor_estorno, estoque_devolvido, operador)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, p.numero, p.origem, p.dia, p.nome_cliente, itens.map((i) => `${i.quantidade}× ${i.nome}`).join(', '), p.total ?? 0, pago, p.status, motivo, estorno, estorno === 'nenhum' ? 0 : pago, devolver ? 1 : 0, eu.nome),
    db.prepare("UPDATE cobranca SET status = 'cancelada' WHERE pedido_id = ? AND status = 'pendente'").bind(id),
  ];
  if (estorno === 'saldo') lote.push(
    db.prepare('UPDATE cliente SET saldo = ROUND(saldo + ?, 2) WHERE id = ?').bind(pago, p.cliente_id),
    db.prepare("INSERT INTO carteira_mov (cliente_id, valor, motivo, pedido_id, operador, obs) VALUES (?, ?, 'estorno', ?, ?, ?)").bind(p.cliente_id, pago, id, eu.nome, `Pedido ${p.numero} cancelado: ${motivo}`.slice(0, 80)));
  if (devolver) lote.push(db.prepare(`INSERT INTO movimento_estoque (insumo_id, tipo, quantidade, motivo, referencia)
      SELECT insumo_id, 'ajuste', -SUM(quantidade), 'pedido cancelado', referencia FROM movimento_estoque WHERE tipo = 'venda' AND referencia = ? GROUP BY insumo_id`).bind(id));
  if (pts?.pontos) lote.push(
    db.prepare("INSERT OR IGNORE INTO ponto_mov (cliente_id, pedido_id, pontos, motivo) VALUES (?, ?, ?, 'estorno')").bind(pts.cliente_id, id, -pts.pontos),
    db.prepare('UPDATE cliente SET pontos = MAX(0, pontos - ?1), pontos_total = MAX(0, pontos_total - ?1) WHERE id = ?2').bind(pts.pontos, pts.cliente_id));
  await db.batch(lote);
  return json({ ok: true, numero: p.numero, pago, estorno, valor_estorno: estorno === 'nenhum' ? 0 : pago, estoque_devolvido: devolver });
}

async function historico(db, url) {
  const dias = Math.min(Math.max(Number(url.searchParams.get('dias')) || 30, 1), 365);
  const { results } = await db.prepare(`SELECT pedido_id, numero, origem, dia, cliente, itens, total, pago, status_antes, motivo, estorno, valor_estorno, estoque_devolvido, operador, criado_em
    FROM cancelamento WHERE criado_em >= datetime('now', ?) ORDER BY criado_em DESC LIMIT 300`).bind(`-${dias} days`).all();
  return json({ dias, cancelamentos: results, total: r2(results.reduce((s, c) => s + (c.total ?? 0), 0)), devolvido: r2(results.reduce((s, c) => s + c.valor_estorno, 0)) });
}

export async function rotearCancelamento(request, env, url) {
  const eu = await usuarioLogado(request, env);
  if (!eu) return erro('Entre com seu nome e senha', 401);
  const db = env.DB, m = request.method, p = url.pathname;
  if (m === 'GET' && p === '/api/cancelamentos') return historico(db, url);
  const k = p.match(/^\/api\/pedidos\/([\w-]+)\/cancelar$/);
  if (m === 'POST' && k) { let c = {}; try { c = await request.json(); } catch { /* vazio */ } return cancelar(db, k[1], c, eu); }
  return erro('Rota não encontrada', 404);
}
