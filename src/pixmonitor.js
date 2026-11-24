// Monitor de Pix direto na chave (sem gateway). O banco não avisa o sistema, então o aviso chega por um "encaminhador":
// o celular que recebe a notificação do banco (ou a API Pix do banco) manda o valor para cá com um segredo.
// O sistema procura qual cobrança está esperando exatamente esse valor e aprova. Havendo dúvida, quem decide é a equipe.
import { json } from './api.js';
import { erro } from './venda.js';
import { confirmarPorRef } from './pagamentos/aviso.js';

const r2 = (x) => Math.round(x * 100) / 100;

/** Lê o texto de uma notificação de banco: "Você recebeu um Pix de MARIA no valor de R$ 25,00". Só aceita Pix RECEBIDO. */
export function lerNotificacao(texto) {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (!/pix/i.test(t) || !/receb/i.test(t) || /enviou|enviado|pagamento realizado|transferiu|devol|estorn/i.test(t)) return null;
  const v = t.match(/R\$\s*([\d.]+,\d{2})/); if (!v) return null;
  const valor = r2(Number(v[1].replace(/\./g, '').replace(',', '.')));
  const p = t.match(/\bde\s+([A-Za-zÀ-ÿ'][A-Za-zÀ-ÿ' .]{2,60}?)(?=\s+(?:no valor|R\$|via|às|as|em)\b|[.,]|$)/);
  return valor > 0 ? { valor, pagador: p ? p[1].trim() : null } : null;
}

async function impressao(texto, valor, pagador) {   // sem id do banco, usa valor+pagador+minuto: o mesmo aviso repetido não duplica
  const base = `${valor}|${pagador ?? ''}|${new Date().toISOString().slice(0, 16)}|${String(texto ?? '').slice(0, 80)}`;
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base)));
  return 'h-' + [...h.slice(0, 10)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Tudo que está esperando um Pix: pedidos do app/balcão, recargas de saldo e inscrições do campeonato. */
export async function pendentesPix(db) {
  const [cob, rec, ins] = await Promise.all([
    db.prepare(`SELECT c.id AS ref, c.valor, c.criada_em, p.numero, p.nome_cliente FROM cobranca c JOIN pedido p ON p.id = c.pedido_id WHERE c.status = 'pendente' AND c.forma = 'pix' AND p.status = 'aguardando_pagamento' AND (p.expira_em IS NULL OR p.expira_em > datetime('now')) ORDER BY c.criada_em`).all(),
    db.prepare("SELECT r.id AS ref, r.valor, r.criada_em, c.nome FROM recarga r JOIN cliente c ON c.id = r.cliente_id WHERE r.status = 'pendente' AND r.expira_em > datetime('now') ORDER BY r.criada_em").all(),
    db.prepare("SELECT i.id AS ref, i.valor, i.criada_em, i.nome, m.nome AS modalidade FROM inscricao i JOIN modalidade m ON m.id = i.modalidade_id WHERE i.status = 'pendente' AND i.valor > 0 AND (i.expira_em IS NULL OR i.expira_em > datetime('now')) ORDER BY i.criada_em").all()]);
  return [...cob.results.map((x) => ({ ref: x.ref, tipo: 'pedido', valor: x.valor, criada_em: x.criada_em, descricao: `Pedido ${x.numero}${x.nome_cliente ? ' · ' + x.nome_cliente : ''}` })),
    ...rec.results.map((x) => ({ ref: x.ref, tipo: 'recarga', valor: x.valor, criada_em: x.criada_em, descricao: `Recarga de saldo · ${x.nome}` })),
    ...ins.results.map((x) => ({ ref: x.ref, tipo: 'inscricao', valor: x.valor, criada_em: x.criada_em, descricao: `Inscrição ${x.modalidade} · ${x.nome}` }))];
}
const candidatos = (pend, valor) => pend.filter((p) => Math.abs(p.valor - valor) < 0.005);

async function cfg(db) {
  const { results } = await db.prepare("SELECT chave, valor FROM configuracao WHERE chave IN ('pix_monitor_auto', 'pix_monitor_auto_max')").all();
  const c = Object.fromEntries(results.map((r) => [r.chave, r.valor])); return { auto: c.pix_monitor_auto === 'sim', max: Number(c.pix_monitor_auto_max) || 200 };
}

async function conciliar(db, pixId, ref, quem) {
  const u = await db.prepare("UPDATE pix_recebido SET status = 'conciliado', ref = ?, conciliado_por = ?, conciliado_em = datetime('now') WHERE id = ? AND status = 'novo'").bind(ref, quem, pixId).run();
  if (!u?.meta?.changes) return { erro: 'Esse Pix já foi tratado.', status: 409 };
  const r = await confirmarPorRef(db, ref, 'pix-monitor');
  if (r.ignorado) { await db.prepare("UPDATE pix_recebido SET status = 'novo', ref = NULL, conciliado_por = NULL, conciliado_em = NULL WHERE id = ?").bind(pixId).run(); return { erro: `Não deu para aprovar: ${r.ignorado}.`, status: 409 }; }
  return { ok: true };
}

/** Entrada de um Pix recebido. Devolve o que aconteceu (aprovado sozinho, esperando a equipe, repetido). */
export async function registrarPix(db, { valor, pagador = null, texto = null, id = null, origem = 'webhook' }) {
  valor = r2(Number(valor));
  if (!(valor > 0) || valor > 1_000_000) return { erro: 'Valor inválido.', status: 400 };
  const ext = id ? 'e-' + String(id).slice(0, 60) : await impressao(texto, valor, pagador);
  try { await db.prepare('INSERT INTO pix_recebido (id_externo, valor, pagador, texto, origem) VALUES (?, ?, ?, ?, ?)').bind(ext, valor, pagador ? String(pagador).slice(0, 80) : null, texto ? String(texto).slice(0, 300) : null, origem).run(); }
  catch { return { ok: true, repetido: true }; }
  const pixId = (await db.prepare('SELECT id FROM pix_recebido WHERE id_externo = ?').bind(ext).first()).id;
  const c = await cfg(db), cand = candidatos(await pendentesPix(db), valor);
  if (c.auto && cand.length === 1 && valor <= c.max) { const r = await conciliar(db, pixId, cand[0].ref, 'automático'); if (r.ok) return { ok: true, aprovado: cand[0].ref, id: pixId }; }
  return { ok: true, id: pixId, candidatos: cand.length };
}

const iguais = (a, b) => { if (!a || !b || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

/** POST público protegido por segredo (header X-Pix-Segredo). Aceita {valor, pagador, id} ou só {texto} da notificação. */
export async function entradaPix(request, env) {
  if (!env.PIX_MONITOR_SECRET) return erro('O monitor de Pix não está ligado (falta PIX_MONITOR_SECRET).', 503);
  if (!iguais(request.headers.get('x-pix-segredo') ?? '', env.PIX_MONITOR_SECRET)) return erro('Segredo inválido.', 401);
  let c = {}; try { c = await request.json(); } catch { return erro('Corpo não é JSON.'); }
  let { valor, pagador, id, texto } = c;
  if (valor == null) { const l = lerNotificacao(texto); if (!l) return json({ ok: true, ignorado: 'não é um Pix recebido' }); ({ valor, pagador } = l); }
  else if (typeof valor === 'string') valor = Number(valor.replace(/\./g, '').replace(',', '.'));
  const r = await registrarPix(db0(env), { valor, pagador, texto, id });
  return r.erro ? erro(r.erro, r.status) : json(r);
}
const db0 = (env) => env.DB;

/** Rotas da equipe (módulo financeiro). */
export async function monitorPix(request, env, url, eu) {
  const db = env.DB, p = url.pathname, m = request.method; let r;
  const corpo = async () => { try { return (await request.json()) ?? {}; } catch { return {}; } };
  if (m === 'GET' && p === '/api/pagamentos/monitor') {
    const [pend, { results: rec }, c] = await Promise.all([pendentesPix(db), db.prepare("SELECT * FROM pix_recebido ORDER BY (status = 'novo') DESC, id DESC LIMIT 80").all(), cfg(db)]);
    const recebidos = rec.map((x) => ({ ...x, candidatos: x.status === 'novo' ? candidatos(pend, x.valor) : [] }));
    return json({ ligado: !!env.PIX_MONITOR_SECRET, auto: c.auto, auto_max: c.max, url_entrada: `${env.URL_PUBLICA || url.origin}/api/pagamentos/aviso/pix-monitor`, pendentes: pend, recebidos });
  }
  if (m === 'PUT' && p === '/api/pagamentos/monitor/config') {
    const c = await corpo(), ops = [], set = (k, v) => db.prepare('INSERT INTO configuracao (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor').bind(k, String(v));
    if (c.auto !== undefined) { if (eu.papel !== 'superadmin') return erro('Só o superadmin liga a aprovação automática.', 403); ops.push(set('pix_monitor_auto', c.auto ? 'sim' : 'nao')); }
    if (c.auto_max !== undefined) { const n = Number(c.auto_max); if (!(n >= 1 && n <= 5000)) return erro('Limite de R$ 1 a R$ 5.000.'); ops.push(set('pix_monitor_auto_max', n)); }
    if (ops.length) await db.batch(ops); return json({ ok: true });
  }
  if (m === 'POST' && p === '/api/pagamentos/monitor/manual') {   // Pix visto no app do banco, lançado à mão
    const c = await corpo(); const res = await registrarPix(db, { valor: c.valor, pagador: c.pagador, origem: 'manual', id: `m-${crypto.randomUUID()}` });
    return res.erro ? erro(res.erro, res.status) : json(res);
  }
  if (m === 'POST' && (r = p.match(/^\/api\/pagamentos\/monitor\/(\d+)\/(conciliar|ignorar)$/))) {
    const id = Number(r[1]), x = await db.prepare('SELECT * FROM pix_recebido WHERE id = ?').bind(id).first(); if (!x) return erro('Pix não encontrado.', 404);
    if (r[2] === 'ignorar') { await db.prepare("UPDATE pix_recebido SET status = 'ignorado', conciliado_por = ?, conciliado_em = datetime('now') WHERE id = ? AND status = 'novo'").bind(eu.nome, id).run(); return json({ ok: true }); }
    const ref = String((await corpo()).ref ?? ''), alvo = (await pendentesPix(db)).find((q) => q.ref === ref);
    if (!alvo) return erro('Essa cobrança não está mais esperando pagamento.', 409);
    if (Math.abs(alvo.valor - x.valor) > 0.005) return erro(`O Pix foi de R$ ${x.valor.toFixed(2)} e a cobrança é de R$ ${alvo.valor.toFixed(2)}. Só aprovo valores iguais: devolva ou ajuste o pedido.`, 409);
    const res = await conciliar(db, id, ref, eu.nome); return res.erro ? erro(res.erro, res.status) : json({ ok: true });
  }
  return null;
}
