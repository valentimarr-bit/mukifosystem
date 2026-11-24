// App do cliente: o pedido só entra na fila DEPOIS de pago. A retirada é feita por QR de uso único, conferido no balcão.
import { json } from './api.js';
import { diaDoTurno, lerComanda, conferirQuitacao, id8, r2, erro } from './venda.js';
import { conferirEstoque } from './trava.js';
import { gerarPix } from './pagamentos/pix.js';
import { clienteLogado } from './clientes.js';

const VALIDADE_MIN = 15;          // pedido não pago some depois disso
const MAX_PENDENTES_CELULAR = 2;  // quantos pedidos não pagos o mesmo celular pode ter ao mesmo tempo
const MAX_PENDENTES_ORIGEM = 6;   // idem, para o mesmo aparelho/rede
const MAX_ITENS = 30, MAX_QTD = 20, MAX_TOTAL = 1500;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async (t) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
const segredo = () => hex(crypto.getRandomValues(new Uint8Array(16)));           // 128 bits
function iguais(a, b) {                                                           // comparação sem pistas de tempo
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function lerPix(db) {
  const { results } = await db.prepare("SELECT chave, valor FROM configuracao WHERE chave IN ('pix_chave','pix_nome','pix_cidade')").all();
  const c = Object.fromEntries(results.map((r) => [r.chave, r.valor]));
  return { chave: c.pix_chave ?? '', nome: c.pix_nome ?? 'MUKIFO', cidade: c.pix_cidade ?? 'PORTO ALEGRE' };
}
export async function salvarPix(db, corpo) {
  const chave = String(corpo?.chave ?? '').trim();
  if (chave.length > 77) return erro('Chave Pix muito longa.');
  const nome = String(corpo?.nome ?? '').trim() || 'MUKIFO', cidade = String(corpo?.cidade ?? '').trim() || 'PORTO ALEGRE';
  await db.batch([['pix_chave', chave], ['pix_nome', nome.slice(0, 25)], ['pix_cidade', cidade.slice(0, 15)]]
    .map(([k, v]) => db.prepare('INSERT INTO configuracao (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor').bind(k, v)));
  return json({ ok: true, ...(await lerPix(db)) });
}

/** Pedidos do app que não foram pagos a tempo são cancelados (e a cobrança também). */
export async function expirarPendentes(db) {
  await db.batch([
    db.prepare(`UPDATE cobranca SET status = 'cancelada' WHERE status = 'pendente' AND pedido_id IN
                (SELECT id FROM pedido WHERE origem = 'celular' AND status = 'aguardando_pagamento' AND expira_em < datetime('now'))`),
    db.prepare("UPDATE pedido SET status = 'cancelado' WHERE origem = 'celular' AND status = 'aguardando_pagamento' AND expira_em < datetime('now')"),
  ]);
}

export const celularValido = (s) => { const d = String(s ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); return /^\d{10,11}$/.test(d) ? d : null; };

async function criarPedido(db, request, corpo) {
  await expirarPendentes(db);
  const pix = await lerPix(db);
  if (!pix.chave) return erro('Os pedidos pelo celular ainda não foram liberados. Peça no balcão.', 503);
  const conta = await clienteLogado(request, { DB: db });   // quem tem conta não precisa digitar de novo e ganha pontos
  const nome = String(conta?.nome ?? corpo?.nome ?? '').trim().slice(0, 40);
  if (nome.length < 2) return erro('Digite seu nome.');
  const celular = celularValido(conta?.celular ?? corpo?.celular);
  if (!celular) return erro('Digite seu celular com DDD.');
  const linhas = Array.isArray(corpo?.itens) ? corpo.itens : [];
  if (!linhas.length || linhas.length > MAX_ITENS) return erro('Escolha pelo menos um item.');

  const agregado = new Map();
  for (const l of linhas) {
    const id = Number(l?.produto_id), q = Number(l?.quantidade);
    if (!Number.isInteger(id) || !Number.isInteger(q) || q < 1 || q > MAX_QTD) return erro('Quantidade inválida.');
    agregado.set(id, (agregado.get(id) ?? 0) + q);
  }
  const ids = [...agregado.keys()];
  const { results: achados } = await db.prepare(`SELECT id, nome, preco_venda FROM produto WHERE ativo = 1 AND id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  const porId = new Map(achados.map((p) => [p.id, p]));
  const itens = [];
  for (const [id, q] of agregado) {
    if (q > MAX_QTD) return erro('Quantidade inválida.');
    const p = porId.get(id);
    if (!p || p.preco_venda == null) return erro('Um dos itens não está mais disponível.', 409);
    itens.push({ ...p, q });   // o preço vem SEMPRE do servidor, nunca do aparelho do cliente
  }
  const falta = await conferirEstoque(db, new Map(itens.map((i) => [i.id, i.q])), { nomes: new Map(itens.map((i) => [i.id, i.nome])) });
  if (falta) return erro(falta.erro, 409);
  const total = r2(itens.reduce((s, i) => s + i.q * i.preco_venda, 0));
  if (total <= 0 || total > MAX_TOTAL) return erro('Valor do pedido fora do permitido.');

  const ip = request.headers.get('CF-Connecting-IP') ?? 'sem-ip';
  const origemHash = await sha256(`mukifo|${ip}`);
  const [pc, po] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM pedido WHERE origem = 'celular' AND status = 'aguardando_pagamento' AND celular = ?").bind(celular).first(),
    db.prepare("SELECT COUNT(*) AS n FROM pedido WHERE origem = 'celular' AND status = 'aguardando_pagamento' AND origem_hash = ?").bind(origemHash).first()]);
  if (pc.n >= MAX_PENDENTES_CELULAR || po.n >= MAX_PENDENTES_ORIGEM) return erro('Você já tem pedidos esperando pagamento. Pague ou aguarde alguns minutos.', 429);

  const chaveQr = segredo(), tokenHash = await sha256(chaveQr);
  for (let t = 0; t < 3; t++) {
    const dia = diaDoTurno();
    const r = await db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(numero, 2) AS INTEGER)), 0) AS n FROM pedido WHERE dia = ? AND origem = 'celular'").bind(dia).first();
    const numero = `C${r.n + 1}`, id = `app-${dia}-${numero}-${id8()}`, cid = `cob-${id8()}${id8()}`;
    try {
      await db.batch([
        db.prepare(`INSERT INTO pedido (id, numero, dia, origem, status, nome_cliente, celular, token_hash, origem_hash, expira_em, total, cliente_id)
                    VALUES (?, ?, ?, 'celular', 'aguardando_pagamento', ?, ?, ?, ?, datetime('now', '+${VALIDADE_MIN} minutes'), ?, ?)`).bind(id, numero, dia, nome, celular, tokenHash, origemHash, total, conta?.id ?? null),
        ...itens.map((i) => db.prepare('INSERT INTO item_pedido (pedido_id, produto_id, nome, quantidade, preco) VALUES (?, ?, ?, ?, ?)').bind(id, i.id, i.nome, i.q, i.preco_venda)),
        db.prepare("INSERT INTO cobranca (id, pedido_id, forma, valor, status, operador) VALUES (?, ?, 'pix', ?, 'pendente', 'app')").bind(cid, id, total),
      ]);
      const copiaECola = gerarPix({ ...pix, valor: total, txid: `MKF${dia.replaceAll('-', '')}${numero}` });
      return json({ id, numero, total, validade_min: VALIDADE_MIN, chave_qr: chaveQr, pix: copiaECola }, 201);
    } catch { /* número repetido por pedidos simultâneos: tenta de novo */ }
  }
  return erro('Não consegui registrar o pedido. Tente de novo.', 409);
}

async function verStatus(db, request, id) {
  await expirarPendentes(db);
  const chave = request.headers.get('X-Chave-Pedido') ?? '';
  const p = await db.prepare("SELECT id, token_hash FROM pedido WHERE id = ? AND origem = 'celular'").bind(id).first();
  // mesma resposta para "não existe" e "chave errada": ninguém consegue descobrir pedidos dos outros
  if (!p || !chave || !iguais(p.token_hash ?? '', await sha256(chave))) return erro('Pedido não encontrado.', 404);
  const c = await lerComanda(db, id);
  const pago = ['recebido', 'preparando', 'pronto', 'entregue'].includes(c.status);
  const pix = c.status === 'aguardando_pagamento' ? await lerPix(db) : null;
  return json({
    id: c.id, numero: c.numero, status: c.status, total: c.total, pago, nome: c.nome_cliente, retirado: c.status === 'entregue',
    itens: c.itens.map((i) => ({ nome: i.nome, quantidade: i.quantidade, preco: i.preco })),
    pix: pix ? gerarPix({ ...pix, valor: c.total, txid: `MKF${c.dia.replaceAll('-', '')}${c.numero}` }) : null,
  });
}

/** O aparelho do cliente pede para ser avisado sobre este pedido (precisa da chave do pedido, como no status). */
async function assinarPush(db, request, id) {
  const chave = request.headers.get('X-Chave-Pedido') ?? '';
  const p = await db.prepare("SELECT id, token_hash FROM pedido WHERE id = ? AND origem = 'celular'").bind(id).first();
  if (!p || !chave || !iguais(p.token_hash ?? '', await sha256(chave))) return erro('Pedido não encontrado.', 404);
  let c = {}; try { c = await request.json(); } catch { /* vazio */ }
  const e = String(c?.endpoint ?? ''), a = String(c?.keys?.p256dh ?? ''), t = String(c?.keys?.auth ?? '');
  if (!/^https:\/\//.test(e) || e.length > 600 || !a || !t || a.length > 200 || t.length > 100) return erro('Assinatura inválida.');
  const { n } = await db.prepare('SELECT COUNT(*) AS n FROM push_assinatura WHERE pedido_id = ?').bind(id).first();
  if (n >= 3) return erro('Aparelhos demais para esse pedido.', 429);
  await db.prepare('INSERT OR REPLACE INTO push_assinatura (pedido_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)').bind(id, e, a, t).run();
  return json({ ok: true });
}

/** Aviso automático de pagamento (banco/Navi): confere a assinatura antes de acreditar em qualquer coisa. */
async function webhook(db, env, request) {
  if (!env.PAGAMENTO_WEBHOOK_SECRET) return erro('Confirmação automática não configurada.', 503);
  const bruto = await request.text();
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.PAGAMENTO_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const esperado = hex(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(bruto)));
  if (!iguais(esperado, (request.headers.get('X-Assinatura') ?? '').toLowerCase())) return erro('Assinatura inválida.', 401);
  let b; try { b = JSON.parse(bruto); } catch { return erro('Corpo inválido.'); }
  const c = await db.prepare('SELECT id, pedido_id, valor, status FROM cobranca WHERE id = ?').bind(String(b?.cobranca_id ?? '')).first();
  if (!c) return erro('Cobrança não encontrada.', 404);
  if (c.status !== 'pendente') return json({ ok: true, ignorado: c.status });
  if (Math.abs(Number(b.valor) - c.valor) > 0.005) return erro('Valor diferente do cobrado.', 409);
  await db.prepare("UPDATE cobranca SET status = 'paga', paga_em = datetime('now'), operador = 'pagamento automático' WHERE id = ? AND status = 'pendente'").bind(c.id).run();
  await conferirQuitacao(db, c.pedido_id, 'pagamento automático');
  return json({ ok: true });
}

export async function rotearCliente(request, env, url) {
  const db = env.DB, m = request.method, p = url.pathname;
  let k;
  if (m === 'POST' && p === '/api/cliente/pedidos') { let c = {}; try { c = await request.json(); } catch { /* vazio */ } return criarPedido(db, request, c); }
  if (m === 'GET' && (k = p.match(/^\/api\/cliente\/pedidos\/([\w-]+)$/))) return verStatus(db, request, k[1]);
  if (m === 'GET' && p === '/api/cliente/push-chave') return json({ chave: env.VAPID_PUBLICA || null });
  if (m === 'POST' && (k = p.match(/^\/api\/cliente\/pedidos\/([\w-]+)\/push$/))) return assinarPush(db, request, k[1]);
  if (m === 'POST' && p === '/api/cliente/pagamento/webhook') return webhook(db, env, request);
  return null;
}

// ---- balcão: conferir o QR do cliente ----
export async function listarRetiradas(db) {
  await expirarPendentes(db);
  const { results } = await db.prepare(
    `SELECT id, numero, nome_cliente, status, total, pago_em FROM pedido
     WHERE origem = 'celular' AND status IN ('recebido', 'preparando', 'pronto') ORDER BY pago_em, id`).all();
  const { results: aguardando } = await db.prepare(
    `SELECT p.id, p.numero, p.nome_cliente, p.total, p.expira_em, c.id AS cobranca_id FROM pedido p JOIN cobranca c ON c.pedido_id = p.id AND c.status = 'pendente'
     WHERE p.origem = 'celular' AND p.status = 'aguardando_pagamento' ORDER BY p.criado_em`).all();
  return json({ pedidos: results, aguardando });
}

export async function validarRetirada(db, corpo, eu) {
  const partes = String(corpo?.codigo ?? '').trim().split('.');
  if (partes.length !== 3 || partes[0] !== 'MKF1') return erro('Esse QR não é do Mukifo.', 400);
  const [, id, chave] = partes;
  const p = await db.prepare("SELECT id, dia, status, token_hash, retirado_em FROM pedido WHERE id = ? AND origem = 'celular'").bind(id).first();
  if (!p || !iguais(p.token_hash ?? '', await sha256(chave))) return erro('QR inválido. NÃO entregue nada.', 400);
  if (p.status === 'entregue') return erro(`QR já usado${p.retirado_em ? ` em ${p.retirado_em} (UTC)` : ''}. NÃO entregue de novo.`, 409);
  if (p.status === 'aguardando_pagamento') return erro('Pedido ainda NÃO foi pago. Não entregue.', 402);
  if (p.status === 'cancelado') return erro('Pedido cancelado ou vencido. Não entregue.', 409);
  if (p.dia !== diaDoTurno()) return erro('Esse pedido é de outro dia. Chame o gerente.', 409);
  const c = await lerComanda(db, id);
  if (corpo?.confirmar !== true) return json({ ok: true, entregue: false, pedido: { numero: c.numero, nome: c.nome_cliente, total: c.total, itens: c.itens } });
  const r = await db.prepare("UPDATE pedido SET status = 'entregue', retirado_em = datetime('now'), entregue_em = datetime('now'), operador = ? WHERE id = ? AND retirado_em IS NULL AND status IN ('recebido', 'preparando', 'pronto')").bind(eu.nome, id).run();
  if (r?.meta?.changes === 0) return erro('QR já usado. NÃO entregue de novo.', 409);
  return json({ ok: true, entregue: true, pedido: { numero: c.numero, nome: c.nome_cliente, total: c.total, itens: c.itens } });
}
