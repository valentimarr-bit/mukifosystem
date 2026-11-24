// Canais de venda (iFood, 99Food): puxa os pedidos, cria o pedido local (entra na Produção como os do app), dá baixa no estoque,
// aceita na plataforma e devolve o andamento (preparando, pronto, saiu).
import { json } from './api.js';
import { erro, diaDoTurno, darBaixa } from './venda.js';
import { usuarioLogado } from './auth.js';
import { normalizarNome } from './dominio/estoque.js';
import { CANAIS } from './canais/adaptadores.js';

const PREFIXO = { ifood: 'I', '99food': 'N' };
const corpoDe = async (r) => { try { return (await r.json()) ?? {}; } catch { return {}; } };

async function ajustes(db) {
  const { results } = await db.prepare("SELECT chave, valor FROM configuracao WHERE chave LIKE 'canal_%'").all();
  return Object.fromEntries(results.map((r) => [r.chave, r.valor]));
}
const ativo = (cfg, id) => cfg[`canal_${id}_ativo`] === 'sim';

/** Acha o produto do cardápio: pelo código que você cadastrou na plataforma (= nº do produto no Mukifo) ou pelo nome igual. */
async function produtoDoItem(db, it) {
  if (it.codigo && /^\d+$/.test(String(it.codigo))) { const p = await db.prepare('SELECT id FROM produto WHERE id = ?').bind(Number(it.codigo)).first(); if (p) return p.id; }
  const p = await db.prepare('SELECT id FROM produto WHERE nome_normalizado = ?').bind(normalizarNome(it.nome)).first();
  return p?.id ?? null;
}

/** Cria o pedido local. O id é fixo (ext-canal-ref): chegar duas vezes não duplica nem baixa o estoque duas vezes. */
export async function importarPedido(db, canalId, ped) {
  const id = `ext-${canalId}-${ped.ref}`.slice(0, 80);
  if (await db.prepare('SELECT 1 AS ok FROM pedido WHERE id = ?').bind(id).first()) return { id, repetido: true };
  const dia = diaDoTurno(), pref = PREFIXO[canalId] ?? 'X';
  const itens = []; let semVinculo = 0;
  for (const it of ped.itens) { const pid = await produtoDoItem(db, it); if (!pid) semVinculo++; itens.push({ ...it, pid }); }
  const nomeCli = `${canalId === 'ifood' ? 'iFood' : '99Food'} · ${ped.cliente}`;
  let numero = `${pref}${ped.numero}`;
  if (await db.prepare('SELECT 1 AS ok FROM pedido WHERE dia = ? AND numero = ?').bind(dia, numero).first()) numero = `${numero}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
  try {
    await db.batch([
      db.prepare("INSERT INTO pedido (id, numero, dia, origem, nome_cliente, status, pagamento, total, pago_em) VALUES (?, ?, ?, 'celular', ?, 'recebido', ?, ?, datetime('now'))").bind(id, numero, dia, nomeCli, canalId, ped.subtotal),
      ...itens.map((i) => db.prepare('INSERT INTO item_pedido (pedido_id, produto_id, nome, quantidade, preco) VALUES (?, ?, ?, ?, ?)').bind(id, i.pid, i.nome + (i.obs ? ` (${String(i.obs).slice(0, 60)})` : ''), i.quantidade, i.preco)),
      db.prepare('INSERT INTO pedido_externo (id, canal, ref_externa, numero_canal, tipo, cliente, total_canal, taxa_entrega, itens_sem_vinculo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, canalId, ped.ref, ped.numero, ped.tipo, ped.cliente, ped.total, ped.taxa_entrega, semVinculo)]);
  } catch { return { id, repetido: true }; }
  await darBaixa(db, id);
  return { id, novo: true, semVinculo };
}

async function estornarBaixa(db, pedidoId) {
  const { results } = await db.prepare("SELECT insumo_id, quantidade FROM movimento_estoque WHERE tipo = 'venda' AND referencia = ?").bind(pedidoId).all();
  if (!results.length || await db.prepare("SELECT 1 AS ok FROM movimento_estoque WHERE tipo = 'ajuste' AND referencia = ? AND motivo = 'pedido cancelado no canal'").bind(pedidoId).first()) return;
  await db.batch(results.map((r) => db.prepare("INSERT INTO movimento_estoque (insumo_id, tipo, quantidade, motivo, referencia) VALUES (?, 'ajuste', ?, 'pedido cancelado no canal', ?)").bind(r.insumo_id, -r.quantidade, pedidoId)));
}

async function cancelarLocal(db, canalId, ref) {
  const id = `ext-${canalId}-${ref}`.slice(0, 80), p = await db.prepare('SELECT status FROM pedido WHERE id = ?').bind(id).first();
  if (!p || p.status === 'cancelado') return;
  await db.batch([db.prepare("UPDATE pedido SET status = 'cancelado' WHERE id = ? AND status <> 'entregue'").bind(id), db.prepare('UPDATE pedido_externo SET cancelado_externo = 1 WHERE id = ?').bind(id)]);
  if (p.status !== 'entregue') await estornarBaixa(db, id);
}

/** Uma rodada: lê os eventos de cada canal ligado, importa/cancela, aceita na plataforma e reconhece. Erros de um canal não param o outro. */
export async function sincronizar(db, env) {
  const cfg = await ajustes(db), resumo = {};
  for (const [cid, ad] of Object.entries(CANAIS)) {
    if (!ativo(cfg, cid) || !ad.configurado(env)) continue;
    const r = resumo[cid] = { novos: 0, cancelados: 0, erros: [] }, ok = [];
    try {
      for (const ev of await ad.eventos(env)) {
        try {
          if (ev.codigo === 'novo' && ev.ref) { const x = await importarPedido(db, cid, await ad.pedido(env, ev.ref)); if (x.novo) r.novos++; }
          else if (ev.codigo === 'cancelado' && ev.ref) { await cancelarLocal(db, cid, ev.ref); r.cancelados++; }
          ok.push(ev.id);
        } catch (e) { r.erros.push(e.message); }   // sem reconhecer: a plataforma entrega de novo na próxima rodada
      }
      await ad.reconhecer(env, ok);
    } catch (e) { r.erros.push(e.message); }
    if (cfg.canal_auto_aceitar !== 'nao') {   // aceitar também tenta de novo os que falharam antes
      const { results } = await db.prepare("SELECT id, ref_externa FROM pedido_externo WHERE canal = ? AND confirmado_em IS NULL AND cancelado_externo = 0 AND criado_em > datetime('now', '-2 hours')").bind(cid).all();
      for (const p of results) {
        try { await ad.confirmar(env, p.ref_externa); await db.prepare("UPDATE pedido_externo SET confirmado_em = datetime('now'), erro = NULL WHERE id = ?").bind(p.id).run(); }
        catch (e) { r.erros.push(e.message); await db.prepare('UPDATE pedido_externo SET erro = ? WHERE id = ?').bind(e.message.slice(0, 200), p.id).run(); }
      }
    }
  }
  return resumo;
}

const ETAPAS = { preparando: 'iniciarPreparo', pronto: 'pronto', saiu: 'despachar' };
/** Avisa a plataforma do andamento. Não derruba a Produção se a plataforma estiver fora: guarda o erro. */
export async function avisarCanal(db, env, pedidoId, etapa) {
  const x = await db.prepare('SELECT * FROM pedido_externo WHERE id = ?').bind(pedidoId).first();
  const ad = x && CANAIS[x.canal], metodo = ETAPAS[etapa];
  if (!ad || !metodo || !ad.configurado(env) || x.cancelado_externo || x.etapa_enviada === etapa) return { ignorado: true };
  if (etapa === 'saiu' && x.tipo !== 'delivery') return { ignorado: true };
  try { await ad[metodo](env, x.ref_externa); await db.prepare('UPDATE pedido_externo SET etapa_enviada = ?, erro = NULL WHERE id = ?').bind(etapa, pedidoId).run(); return { ok: true }; }
  catch (e) { await db.prepare('UPDATE pedido_externo SET erro = ? WHERE id = ?').bind(e.message.slice(0, 200), pedidoId).run(); return { erro: e.message }; }
}

export async function rotearCanais(request, env, url) {
  const eu = await usuarioLogado(request, env);
  if (!eu) return erro('Entre com seu nome e senha.', 401);
  const db = env.DB, p = url.pathname, m = request.method; let r;
  if (m === 'POST' && p === '/api/canais/sincronizar') return json({ ok: true, canais: await sincronizar(db, env) });
  if (m === 'GET' && p === '/api/canais') {
    const cfg = await ajustes(db);
    const { results: pedidos } = await db.prepare(`SELECT x.*, p.numero, p.status, p.total FROM pedido_externo x JOIN pedido p ON p.id = x.id ORDER BY x.criado_em DESC LIMIT 40`).all();
    return json({ auto_aceitar: cfg.canal_auto_aceitar !== 'nao', pedidos,
      canais: Object.values(CANAIS).map((c) => ({ id: c.id, nome: c.nome, ativo: ativo(cfg, c.id), configurado: c.configurado(env), comissao: Number(cfg[`canal_${c.id}_comissao`]) || 0 })) });
  }
  if (m === 'PUT' && p === '/api/canais/config') {
    if (eu.papel !== 'superadmin') return erro('Só o superadmin mexe nos canais.', 403);
    const c = await corpoDe(request), ops = [], set = (k, v) => db.prepare('INSERT INTO configuracao (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor').bind(k, String(v));
    for (const id of Object.keys(CANAIS)) {
      const a = c[id]; if (!a) continue;
      if (a.ativo !== undefined) { if (a.ativo && !CANAIS[id].configurado(env)) return erro(`Faltam as credenciais de ${CANAIS[id].nome} no Cloudflare.`, 409); ops.push(set(`canal_${id}_ativo`, a.ativo ? 'sim' : 'nao')); }
      if (a.comissao !== undefined) { const n = Number(a.comissao); if (!(n >= 0 && n <= 60)) return erro('Comissão de 0 a 60%.'); ops.push(set(`canal_${id}_comissao`, n)); }
    }
    if (c.auto_aceitar !== undefined) ops.push(set('canal_auto_aceitar', c.auto_aceitar ? 'sim' : 'nao'));
    if (ops.length) await db.batch(ops); return json({ ok: true });
  }
  if (m === 'POST' && (r = p.match(/^\/api\/canais\/pedidos\/([\w.-]+)\/saiu$/))) {   // entregador levou / cliente retirou
    const x = await db.prepare('SELECT 1 AS ok FROM pedido_externo WHERE id = ?').bind(r[1]).first(); if (!x) return erro('Pedido de canal não encontrado.', 404);
    const u = await db.prepare("UPDATE pedido SET status = 'entregue', retirado_em = datetime('now') WHERE id = ? AND status IN ('pronto', 'preparando', 'recebido')").bind(r[1]).run();
    if (!u?.meta?.changes) return erro('Esse pedido já foi finalizado ou cancelado.', 409);
    return json({ ok: true, plataforma: await avisarCanal(db, env, r[1], 'saiu') });
  }
  return null;
}
