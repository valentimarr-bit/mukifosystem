// WhatsApp automático pela izapia (API SaaS que conecta o número do bar por QR Code).
// Segredos só no Cloudflare: IZAPIA_API_KEY, IZAPIA_SID (e IZAPIA_BASE_URL se mudar).
// ATENÇÃO: a izapia usa o protocolo do WhatsApp Web, não a API oficial da Meta: mande pouco, devagar e só a quem tem cadastro,
// senão o número pode ser bloqueado. Por isso há fila, ritmo por minuto, teto por dia, uma mensagem por cliente e por modalidade, e recusa.
const BASE = 'https://api.izapia.com';

export const configurado = (env) => !!(env.IZAPIA_API_KEY && env.IZAPIA_SID);

/** Só dígitos, com 55. Devolve null se não parecer celular brasileiro (DDD + 8 ou 9 dígitos). */
export function numeroWhats(celular) {
  let d = String(celular ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? `55${d}` : null;
}

/** Um envio. Devolve { ok } ou { erro, definitivo } (definitivo = não adianta tentar de novo). */
export async function enviarTexto(env, para, texto) {
  try {
    const r = await fetch(`${(env.IZAPIA_BASE_URL || BASE).replace(/\/+$/, '')}/api/v1/sessions/${encodeURIComponent(env.IZAPIA_SID)}/messages/text`, {
      method: 'POST', headers: { authorization: `Bearer ${env.IZAPIA_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ to: para, text: texto }),
    });
    if (r.ok) return { ok: true };
    const corpo = (await r.text().catch(() => '')).slice(0, 160);
    return { erro: `izapia ${r.status}${corpo ? ': ' + corpo : ''}`, definitivo: r.status >= 400 && r.status < 500 && r.status !== 429, credencial: r.status === 401 || r.status === 403 };
  } catch (e) { return { erro: `sem conexão com a izapia (${e.message})`, definitivo: false }; }
}

async function ajustes(db) {
  const { results } = await db.prepare("SELECT chave, valor FROM configuracao WHERE chave LIKE 'whats_%'").all();
  return Object.fromEntries(results.map((x) => [x.chave, x.valor]));
}
const set = (db, k, v) => db.prepare('INSERT INTO configuracao (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor').bind(k, String(v));

export const TEXTO_CONSENTIMENTO = 'Quero receber convites de campeonato e novidades do Mukifo por WhatsApp. Posso desativar quando quiser.';
/** Registra aceite ou revogação (com prova). Aceitar limpa a recusa do balcão: quem aceitou de novo quer receber. */
export async function registrarConsentimento(db, cliente, aceitou, origem) {
  await db.batch([
    db.prepare(aceitou ? "UPDATE cliente SET whats_aceite_em = datetime('now'), whats_recusou = 0 WHERE id = ?" : 'UPDATE cliente SET whats_aceite_em = NULL WHERE id = ?').bind(cliente.id),
    db.prepare('INSERT INTO consentimento_whats (cliente_id, acao, origem, celular, texto) VALUES (?, ?, ?, ?, ?)').bind(cliente.id, aceitou ? 'aceitou' : 'revogou', origem, cliente.celular ?? null, TEXTO_CONSENTIMENTO),
  ]);
}

const primeiroNome = (n) => String(n ?? '').trim().split(/\s+/)[0] || '';
export function montarConvite({ cliente, campeonato, modalidade, taxa, link }) {
  const quem = primeiroNome(cliente);
  return `${quem ? `Oi, ${quem}! ` : 'Oi! '}🎱 Estão abertas as inscrições do ${campeonato} (${modalidade}) no Mukifo. ${taxa > 0 ? `Inscrição R$ ${Number(taxa).toFixed(2).replace('.', ',')}.` : 'Inscrição grátis.'} Garanta sua vaga: ${link}\nPara não receber mais, desative em Minha conta no app ou avise no balcão.`;
}

/** Põe na fila o convite de todos os clientes elegíveis que ainda não receberam esta modalidade. Devolve quantos entraram. */
export async function enfileirar(db, modalidadeId, link) {
  const mod = await db.prepare("SELECT m.id, m.nome, m.taxa, m.status, c.nome AS campeonato FROM modalidade m JOIN campeonato c ON c.id = m.campeonato_id WHERE m.id = ?").bind(modalidadeId).first();
  if (!mod) return { erro: 'Modalidade não encontrada.', status: 404 };
  if (mod.status !== 'inscricoes') return { erro: 'As inscrições desta modalidade estão encerradas.', status: 409 };
  const { results } = await db.prepare("SELECT id, nome, celular FROM cliente WHERE ativo = 1 AND whats_aceite_em IS NOT NULL AND whats_recusou = 0 AND celular IS NOT NULL AND id NOT IN (SELECT cliente_id FROM convite_whats WHERE modalidade_id = ?)").bind(modalidadeId).all();
  const ops = [];
  for (const c of results) {
    const num = numeroWhats(c.celular); if (!num) continue;
    ops.push(db.prepare('INSERT OR IGNORE INTO convite_whats (modalidade_id, cliente_id, celular, texto) VALUES (?, ?, ?, ?)')
      .bind(modalidadeId, c.id, num, montarConvite({ cliente: c.nome, campeonato: mod.campeonato, modalidade: mod.nome, taxa: mod.taxa, link })));
  }
  for (let i = 0; i < ops.length; i += 50) await db.batch(ops.slice(i, i + 50));
  return { na_fila: ops.length };
}

/** Roda todo minuto (cron): manda alguns convites da fila, respeitando ritmo e teto diário. */
export async function processarFila(db, env) {
  const cfg = await ajustes(db);
  if (cfg.whats_ativo !== 'sim' || !configurado(env)) return { enviados: 0, parado: 'desligado' };
  const porMin = Math.max(1, Math.min(20, Number(cfg.whats_por_minuto) || 4)), maxDia = Math.max(1, Number(cfg.whats_max_dia) || 80);
  const hoje = (await db.prepare("SELECT COUNT(*) AS n FROM convite_whats WHERE status = 'enviado' AND date(enviado_em, '-3 hours') = date('now', '-3 hours')").first()).n;
  const vez = Math.min(porMin, maxDia - hoje); if (vez <= 0) return { enviados: 0, parado: 'teto do dia' };
  const { results } = await db.prepare("SELECT q.*, m.status AS mstatus, m.vagas, m.id AS mid FROM convite_whats q JOIN modalidade m ON m.id = q.modalidade_id WHERE q.status = 'fila' ORDER BY q.id LIMIT ?").bind(vez + 30).all();   // folga: convites cancelados não gastam a vez do minuto
  let enviados = 0, tentados = 0;
  for (const q of results) {
    if (tentados >= vez) break;
    if (q.mstatus !== 'inscricoes') { await db.prepare("UPDATE convite_whats SET status = 'cancelado', erro = 'inscrições encerradas' WHERE id = ?").bind(q.id).run(); continue; }
    const rec = await db.prepare('SELECT whats_recusou, whats_aceite_em FROM cliente WHERE id = ?').bind(q.cliente_id).first();
    if (!rec || rec.whats_recusou || !rec.whats_aceite_em) { await db.prepare("UPDATE convite_whats SET status = 'cancelado', erro = 'cliente não quer receber' WHERE id = ?").bind(q.id).run(); continue; }
    tentados++;
    const r = await enviarTexto(env, q.celular, q.texto);
    if (r.ok) { enviados++; await db.prepare("UPDATE convite_whats SET status = 'enviado', enviado_em = datetime('now'), erro = NULL WHERE id = ?").bind(q.id).run(); continue; }
    if (r.credencial) { await set(db, 'whats_ultimo_erro', r.erro).run(); return { enviados, parado: 'credencial recusada pela izapia' }; }   // não insiste: não queima o número
    const t = q.tentativas + 1;
    await db.prepare('UPDATE convite_whats SET status = ?, tentativas = ?, erro = ? WHERE id = ?').bind(r.definitivo || t >= 3 ? 'erro' : 'fila', t, r.erro, q.id).run();
    await set(db, 'whats_ultimo_erro', r.erro).run();
  }
  return { enviados };
}

export async function estadoWhats(db, env) {
  const cfg = await ajustes(db);
  const cont = Object.fromEntries((await db.prepare('SELECT status, COUNT(*) AS n FROM convite_whats GROUP BY status').all()).results.map((x) => [x.status, x.n]));
  const aud = (await db.prepare("SELECT COUNT(*) AS n FROM cliente WHERE ativo = 1 AND whats_aceite_em IS NOT NULL AND whats_recusou = 0 AND celular IS NOT NULL").first()).n;
  const sem = (await db.prepare("SELECT COUNT(*) AS n FROM cliente WHERE ativo = 1 AND whats_aceite_em IS NULL AND celular IS NOT NULL").first()).n;
  const hoje = (await db.prepare("SELECT COUNT(*) AS n FROM convite_whats WHERE status = 'enviado' AND date(enviado_em, '-3 hours') = date('now', '-3 hours')").first()).n;
  return { configurado: configurado(env), ativo: cfg.whats_ativo === 'sim', auto: cfg.whats_auto_convite !== 'nao', por_minuto: Number(cfg.whats_por_minuto), max_dia: Number(cfg.whats_max_dia),
    audiencia: aud, sem_consentimento: sem, fila: cont.fila ?? 0, enviados: cont.enviado ?? 0, erros: cont.erro ?? 0, enviados_hoje: hoje, ultimo_erro: cfg.whats_ultimo_erro || null };
}

export async function salvarConfigWhats(db, env, c) {
  const ops = [];
  if (c.ativo !== undefined) { if (c.ativo && !configurado(env)) return { erro: 'Faltam IZAPIA_API_KEY e IZAPIA_SID no Cloudflare.', status: 409 }; ops.push(set(db, 'whats_ativo', c.ativo ? 'sim' : 'nao')); }
  if (c.auto !== undefined) ops.push(set(db, 'whats_auto_convite', c.auto ? 'sim' : 'nao'));
  if (c.por_minuto !== undefined) { const n = Math.floor(Number(c.por_minuto)); if (!(n >= 1 && n <= 20)) return { erro: 'Ritmo de 1 a 20 por minuto.', status: 400 }; ops.push(set(db, 'whats_por_minuto', n)); }
  if (c.max_dia !== undefined) { const n = Math.floor(Number(c.max_dia)); if (!(n >= 1 && n <= 1000)) return { erro: 'Teto de 1 a 1000 por dia.', status: 400 }; ops.push(set(db, 'whats_max_dia', n)); }
  if (ops.length) await db.batch(ops);
  return { ok: true };
}
