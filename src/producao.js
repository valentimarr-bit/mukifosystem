// Tela de produção: pedidos do app já pagos, com o número e a receita de cada item.
// Saem da tela quando o cliente mostra o QR no balcão (status "entregue").
import { json } from './api.js';
import { usuarioLogado } from './auth.js';
import { diaDoTurno } from './venda.js';
import { avisarPedido, pushLigado } from './push.js';
import { textosPedido } from './textos.js';
import { avisarCanal } from './canais.js';
import { itensComPronta } from './cliente.js';

const erro = (m, s = 400) => json({ erro: m }, s);
const r3 = (x) => Math.round(x * 1000) / 1000;

export async function listarProducao(db) {
  // App: sai da tela quando o QR é lido (entregue). Balcão: a venda já nasce "entregue" (pagou, levou), então fica na produção
  // do dia até alguém marcar "pronto" — o status no banco não muda, só preparo_em/pronto_em.
  const { results: brutos } = await db.prepare(`SELECT id, numero, origem, nome_cliente, status, total, pago_em, preparo_em, pronto_em, remessa,
    CAST((julianday('now') - julianday(pago_em)) * 1440 AS INTEGER) AS minutos FROM pedido
    WHERE (origem = 'celular' AND status IN ('recebido', 'preparando', 'pronto'))
       OR (origem = 'balcao' AND status = 'entregue' AND pronto_em IS NULL AND dia = ?) ORDER BY pago_em, id`).bind(diaDoTurno()).all();
  const pedidos = brutos.map((p) => (p.origem === 'balcao' ? { ...p, status: p.preparo_em ? 'preparando' : 'recebido' } : p));
  // coluna ENTREGUE do kanban: os últimos 30 entregues do dia (app: QR lido; balcão: marcado pronto), sem receita
  const { results: ent } = await db.prepare(`SELECT id, numero, origem, nome_cliente, total, COALESCE(retirado_em, pronto_em, pago_em) AS entregue_em FROM pedido
    WHERE dia = ? AND ((origem = 'celular' AND status = 'entregue') OR (origem = 'balcao' AND status = 'entregue' AND pronto_em IS NOT NULL))
    ORDER BY COALESCE(retirado_em, pronto_em, pago_em) DESC, id DESC LIMIT 30`).bind(diaDoTurno()).all();
  let entregues = [];
  if (ent.length) {
    const { results: its } = await db.prepare(`SELECT pedido_id, nome, quantidade FROM item_pedido WHERE pedido_id IN (${ent.map(() => '?').join(',')}) ORDER BY id`).bind(...ent.map((e) => e.id)).all();
    entregues = ent.map((e) => ({ ...e, itens: its.filter((i) => i.pedido_id === e.id).map((i) => ({ nome: i.nome, quantidade: i.quantidade })) }));
  }
  if (!pedidos.length) return { pedidos: [], entregues };
  const marcas = pedidos.map(() => '?').join(',');
  const { results: itens } = await db.prepare(`SELECT ip.id, ip.pedido_id, ip.produto_id, ip.nome, ip.pronto_em, COALESCE(pr.pronta_entrega, 0) AS pronta, ip.quantidade - ip.entregue_qtd AS quantidade FROM item_pedido ip LEFT JOIN produto pr ON pr.id = ip.produto_id WHERE ip.pedido_id IN (${marcas}) AND ip.quantidade - ip.entregue_qtd > 0 ORDER BY ip.id`).bind(...pedidos.map((p) => p.id)).all();
  const prodIds = [...new Set(itens.map((i) => i.produto_id))];
  const pm = prodIds.map(() => '?').join(',');
  const [{ results: comps }, { results: fichas }] = await Promise.all([
    db.prepare(`SELECT ci.combo_id, ci.produto_id, ci.quantidade, p.nome FROM combo_item ci JOIN produto p ON p.id = ci.produto_id WHERE ci.combo_id IN (${pm})`).bind(...prodIds).all(),
    db.prepare(`SELECT ft.produto_id, i.nome AS insumo, i.unidade_ficha AS unidade, ft.quantidade, ft.observacao FROM ficha_tecnica ft JOIN insumo i ON i.id = ft.insumo_id
                WHERE ft.produto_id IN (SELECT id FROM produto WHERE id IN (${pm}) UNION SELECT produto_id FROM combo_item WHERE combo_id IN (${pm})) ORDER BY ft.id`).bind(...prodIds, ...prodIds).all()]);
  const ficha = new Map(); for (const f of fichas) { if (!ficha.has(f.produto_id)) ficha.set(f.produto_id, []); ficha.get(f.produto_id).push(f); }
  const receita = (pid, q) => (ficha.get(pid) ?? []).map((f) => ({ insumo: f.insumo, quantidade: r3(f.quantidade * q), unidade: f.unidade, observacao: f.observacao }));
  const doCombo = new Map(); for (const c of comps) { if (!doCombo.has(c.combo_id)) doCombo.set(c.combo_id, []); doCombo.get(c.combo_id).push(c); }
  return {
    entregues,
    pedidos: pedidos.map((p) => ({ ...p, itens: itens.filter((i) => i.pedido_id === p.id).map((i) => doCombo.has(i.produto_id)
      ? { id: i.id, pronto: !!i.pronto_em, pronta: !!i.pronta, nome: i.nome, quantidade: i.quantidade, combo: doCombo.get(i.produto_id).map((c) => ({ nome: c.nome, quantidade: c.quantidade * i.quantidade, receita: receita(c.produto_id, c.quantidade * i.quantidade) })) }
      : { id: i.id, pronto: !!i.pronto_em, pronta: !!i.pronta, nome: i.nome, quantidade: i.quantidade, receita: receita(i.produto_id, i.quantidade) }) })),
  };
}

const AVISOS = {
  preparando: { titulo: 'Seu pedido começou a ser preparado! 🍹', corpo: (n) => `Pedido ${n}: já estamos preparando.`, vibrar: [300, 120, 300, 120, 600] },
  pronto: { titulo: 'Seu pedido está pronto! 🎉', corpo: (n) => `Pedido ${n}: retire no balcão mostrando o QR.`, vibrar: [600, 150, 600, 150, 600, 150, 900] },
};

export async function rotearProducao(request, env, url) {
  if (!(await usuarioLogado(request, env))) return erro('Entre com seu nome e senha', 401);
  const db = env.DB, m = request.method, p = url.pathname;
  if (m === 'GET' && p === '/api/producao') return json({ ...(await listarProducao(db)), push: pushLigado(env) });
  const ki = p.match(/^\/api\/producao\/([\w-]+)\/item\/(\d+)\/pronto$/);
  if (m === 'POST' && ki) return itemPronto(env, db, ki[1], Number(ki[2]), request);
  const k = p.match(/^\/api\/producao\/([\w-]+)\/preparo$/);
  if (m === 'POST' && k) {
    let c = {}; try { c = await request.json(); } catch { /* vazio */ }
    const acao = c?.acao;
    if (!AVISOS[acao]) return erro('Escolha “preparando” ou “pronto”.');
    const orig = await db.prepare('SELECT origem FROM pedido WHERE id = ?').bind(k[1]).first();
    if (orig?.origem === 'balcao') {   // venda de balcão: só marca o andamento; não há cliente para avisar
      const sql = acao === 'preparando'
        ? "UPDATE pedido SET preparo_em = datetime('now') WHERE id = ? AND origem = 'balcao' AND status = 'entregue' AND preparo_em IS NULL AND pronto_em IS NULL"
        : "UPDATE pedido SET pronto_em = datetime('now'), preparo_em = COALESCE(preparo_em, datetime('now')) WHERE id = ? AND origem = 'balcao' AND status = 'entregue' AND pronto_em IS NULL";
      const r = await db.prepare(sql).bind(k[1]).run();
      if (!r?.meta?.changes) return erro('Esse pedido não está mais nessa etapa.', 409);
      if (acao === 'pronto') await db.prepare("UPDATE item_pedido SET pronto_em = COALESCE(pronto_em, datetime('now')) WHERE pedido_id = ?").bind(k[1]).run();
      return json({ ok: true, avisos_enviados: 0 });
    }
    const de = acao === 'preparando' ? "('recebido')" : "('recebido', 'preparando')";
    const col = acao === 'preparando' ? 'preparo_em' : 'pronto_em';
    const r = await db.prepare(`UPDATE pedido SET status = ?, ${col} = datetime('now') WHERE id = ? AND origem = 'celular' AND status IN ${de}`).bind(acao, k[1]).run();
    if (!r?.meta?.changes) return erro('Esse pedido não está mais nessa etapa (talvez já tenha sido retirado).', 409);
    if (acao === 'pronto') await db.prepare("UPDATE item_pedido SET pronto_em = COALESCE(pronto_em, datetime('now')) WHERE pedido_id = ?").bind(k[1]).run();
    await avisarCanal(db, env, k[1], acao);   // iFood/99Food: avisa a plataforma (não faz nada em pedido do app)
    const ped = await db.prepare('SELECT numero FROM pedido WHERE id = ?').bind(k[1]).first();
    const a = AVISOS[acao], tx = textosPedido(await itensComPronta(db, k[1]), ped.numero)[acao];
    const push = await avisarPedido(env, k[1], { titulo: tx.titulo, corpo: tx.corpo, vibrar: a.vibrar, numero: ped.numero, etapa: acao });
    return json({ ok: true, avisos_enviados: push.enviados ?? 0 });
  }
  return null;
}

/** Marca (ou desmarca) um item como pronto. Todos os itens de produção prontos → o pedido inteiro fica pronto (e o cliente é avisado). */
async function itemPronto(env, db, pedidoId, itemId, request) {
  let c = {}; try { c = await request.json(); } catch { /* vazio */ }
  const marcar = c?.pronto !== false;
  const ped = await db.prepare('SELECT id, numero, origem, status, preparo_em, pronto_em FROM pedido WHERE id = ?').bind(pedidoId).first();
  if (!ped) return erro('Pedido não encontrado.', 404);
  const aberto = ped.origem === 'celular' ? ['recebido', 'preparando'].includes(ped.status) : (ped.origem === 'balcao' && ped.status === 'entregue' && !ped.pronto_em);
  if (!aberto) return erro('Esse pedido não está mais em produção.', 409);
  const it = await db.prepare('SELECT i.id, i.nome, COALESCE(p.pronta_entrega, 0) AS pronta FROM item_pedido i LEFT JOIN produto p ON p.id = i.produto_id WHERE i.id = ? AND i.pedido_id = ?').bind(itemId, pedidoId).first();
  if (!it) return erro('Item não encontrado.', 404);
  await db.prepare(marcar ? "UPDATE item_pedido SET pronto_em = COALESCE(pronto_em, datetime('now')) WHERE id = ?" : 'UPDATE item_pedido SET pronto_em = NULL WHERE id = ?').bind(itemId).run();
  if (marcar) {   // mexer em um item já conta como começo do preparo
    if (ped.origem === 'celular') await db.prepare("UPDATE pedido SET status = 'preparando', preparo_em = COALESCE(preparo_em, datetime('now')) WHERE id = ? AND status = 'recebido'").bind(pedidoId).run();
    else await db.prepare("UPDATE pedido SET preparo_em = COALESCE(preparo_em, datetime('now')) WHERE id = ?").bind(pedidoId).run();
  }
  const falta = await db.prepare('SELECT COUNT(*) AS n FROM item_pedido i LEFT JOIN produto p ON p.id = i.produto_id WHERE i.pedido_id = ? AND i.quantidade - i.entregue_qtd > 0 AND COALESCE(p.pronta_entrega, 0) = 0 AND i.pronto_em IS NULL').bind(pedidoId).first();
  let todos = false, avisos = 0;
  if (marcar && falta.n === 0) {
    todos = true;
    const col = ped.origem === 'celular' ? "UPDATE pedido SET status = 'pronto', pronto_em = datetime('now') WHERE id = ? AND origem = 'celular' AND status IN ('recebido', 'preparando')" : "UPDATE pedido SET pronto_em = datetime('now') WHERE id = ? AND origem = 'balcao' AND status = 'entregue' AND pronto_em IS NULL";
    const r = await db.prepare(col).bind(pedidoId).run();
    if (r?.meta?.changes) await avisarCanal(db, env, pedidoId, 'pronto');
    if (r?.meta?.changes && ped.origem === 'celular') {
      const a = AVISOS.pronto, tx = textosPedido(await itensComPronta(db, pedidoId), ped.numero).pronto;
      avisos = (await avisarPedido(env, pedidoId, { titulo: tx.titulo, corpo: tx.corpo, vibrar: a.vibrar, numero: ped.numero, etapa: 'pronto' })).enviados ?? 0;
    }
  } else if (marcar && ped.origem === 'celular' && !it.pronta) {   // ainda faltam itens: avisa só o que já ficou pronto
    avisos = (await avisarPedido(env, pedidoId, { titulo: `Seu ${it.nome} está pronto! 🎉`, corpo: `Pedido ${ped.numero}: pode buscar no balcão mostrando o QR. Os outros itens já vêm.`, vibrar: AVISOS.pronto.vibrar, numero: ped.numero, etapa: 'item' })).enviados ?? 0;
  }
  return json({ ok: true, pedido_pronto: todos, avisos_enviados: avisos });
}
