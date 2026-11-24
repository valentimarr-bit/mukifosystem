// Fila da sinuca. Regras anti-sabotagem: só entra quem tem cadastro e está NO bar (localização), uma vaga por pessoa,
// quem não aparece ou avisa "terminou" falso perde pontos de conduta, e conduta ruim bloqueia por um tempo.
import { json } from './api.js';
import { erro, id8 } from './venda.js';
import { usuarioLogado } from './auth.js';
import { clienteLogado } from './clientes.js';
import { avisarPedido } from './push.js';
import { modoTeste } from './trava.js';

const TEXTO = (v, n) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, n);
const corpoDe = async (request) => { try { return (await request.json()) ?? {}; } catch { return {}; } };
export const PENA = { naoApareceu: -15, desistiuChamado: -10, relatoFalso: -25, foraDoRaio: -10 };
export const PREMIO = { jogoConcluido: 2, relatoCerto: 3 };
const LIMITE_BLOQUEIO = 60, PONTOS_APOS_BLOQUEIO = 70, MAX_FILA = 30;

export function distanciaM(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = (g) => g * Math.PI / 180, dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export const nivelDeConduta = (pontos, bloqueado) => (bloqueado ? 'Bloqueado' : pontos >= 85 ? 'Ótima' : pontos >= 70 ? 'Boa' : 'Atenção');

async function config(db) {
  const { results } = await db.prepare("SELECT chave, valor FROM configuracao WHERE chave IN ('bar_lat', 'bar_lng', 'sinuca_raio_m', 'sinuca_chegada_min', 'sinuca_liberar_seg', 'sinuca_ativa')").all();
  const c = Object.fromEntries(results.map((r) => [r.chave, r.valor])), n = (v, d) => (Number.isFinite(Number(v)) && v !== undefined ? Number(v) : d);
  return { lat: c.bar_lat !== undefined ? Number(c.bar_lat) : null, lng: c.bar_lng !== undefined ? Number(c.bar_lng) : null, raio: n(c.sinuca_raio_m, 120),
    chegada: n(c.sinuca_chegada_min, 5), liberar: n(c.sinuca_liberar_seg, 60), ativa: c.sinuca_ativa !== 'nao' };
}

const log = (db, cid, tipo, delta = 0, obs = null, mesa = null) => db.prepare('INSERT INTO sinuca_evento (cliente_id, tipo, delta, obs, mesa_id) VALUES (?, ?, ?, ?, ?)').bind(cid, tipo, delta, obs, mesa).run();

async function condutaDe(db, cid) {
  await db.prepare('INSERT OR IGNORE INTO sinuca_conduta (cliente_id) VALUES (?)').bind(cid).run();
  const c = await db.prepare("SELECT pontos, bloqueios, bloqueado_ate, (bloqueado_ate IS NOT NULL AND bloqueado_ate > datetime('now')) AS bloqueado FROM sinuca_conduta WHERE cliente_id = ?").bind(cid).first();
  return { ...c, bloqueado: !!c.bloqueado };
}

/** Mexe nos pontos (0–100). Ao cair a 60 ou menos: bloqueia 24 h (7 dias a partir do 3º bloqueio) e volta para 70 pontos. */
export async function ajustarConduta(db, cid, delta, tipo, obs = null, mesa = null) {
  await condutaDe(db, cid);
  await db.prepare('UPDATE sinuca_conduta SET pontos = MAX(0, MIN(100, pontos + ?)) WHERE cliente_id = ?').bind(delta, cid).run();
  await log(db, cid, tipo, delta, obs, mesa);
  if (delta < 0) {
    const c = await condutaDe(db, cid);
    if (c.pontos <= LIMITE_BLOQUEIO) {
      const horas = c.bloqueios + 1 >= 3 ? 24 * 7 : 24;
      await db.prepare(`UPDATE sinuca_conduta SET bloqueios = bloqueios + 1, pontos = ?, bloqueado_ate = datetime('now', '+${horas} hours') WHERE cliente_id = ?`).bind(PONTOS_APOS_BLOQUEIO, cid).run();
      await log(db, cid, 'bloqueio', 0, `${horas} horas`, mesa);
    }
  }
}

function verificarLocal(cfg, corpo, teste) {
  if (cfg.lat == null || cfg.lng == null) return teste ? { ok: true, dist: null } : { erro: 'A equipe ainda não marcou a localização do bar. Fale com o balcão.', status: 503 };
  const lat = Number(corpo?.lat), lng = Number(corpo?.lng), prec = Number(corpo?.precisao);
  if (![lat, lng].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { erro: 'Ative a localização do celular para usar a fila.', status: 400, semLocal: true };
  if (!(prec >= 0) || prec > 150) return { erro: 'Sinal de GPS fraco. Vá para perto de uma janela ou porta e tente de novo.', status: 400, semLocal: true };
  const dist = distanciaM(lat, lng, cfg.lat, cfg.lng);
  if (dist > cfg.raio) return { erro: 'Você precisa estar no Mukifo para usar a fila da sinuca.', status: 403, fora: true, dist };
  return { ok: true, dist };
}

/** Fora do raio: registra; repetiu 3 vezes na mesma hora → perde pontos (quem tenta de longe está sabotando). */
async function registrarFora(db, cid) {
  await log(db, cid, 'fora_do_raio');
  const n = (await db.prepare("SELECT COUNT(*) AS n FROM sinuca_evento WHERE cliente_id = ? AND tipo = 'fora_do_raio' AND criado_em > datetime('now', '-1 hour')").bind(cid).first()).n;
  if (n === 3) await ajustarConduta(db, cid, PENA.foraDoRaio, 'penalidade', 'tentativas de longe do bar');
}

// ---------- andamento da fila ----------
async function chamarProximo(db, env, mesaId) {
  const mesa = await db.prepare('SELECT * FROM mesa_sinuca WHERE id = ? AND ativa = 1').bind(mesaId).first();
  if (!mesa || mesa.status !== 'livre') return;
  const prox = await db.prepare(`SELECT f.id, f.nome FROM fila_sinuca f LEFT JOIN sinuca_conduta c ON c.cliente_id = f.cliente_id
    WHERE f.status = 'esperando' AND (c.bloqueado_ate IS NULL OR c.bloqueado_ate <= datetime('now')) ORDER BY f.entrada_em LIMIT 1`).first();
  if (!prox) return;
  const u = await db.prepare("UPDATE mesa_sinuca SET status = 'chamando', fila_id = ?, desde = datetime('now'), liberando_em = NULL, liberando_por = NULL WHERE id = ? AND status = 'livre'").bind(prox.id, mesaId).run();
  if (!u?.meta?.changes) return;
  await db.prepare("UPDATE fila_sinuca SET status = 'chamado', mesa_id = ?, chamado_em = datetime('now') WHERE id = ? AND status = 'esperando'").bind(mesaId, prox.id).run();
  const cfg = await config(db);
  try { await avisarPedido(env, `fila-${prox.id}`, { titulo: '🎱 É a sua vez na sinuca!', corpo: `${mesa.nome} liberada. Você tem ${cfg.chegada} min para chegar.`, vibrar: [400, 150, 400, 150, 400] }); } catch { /* o app também confere sozinho */ }
}

async function liberarMesa(db, env, mesa, motivo) {
  const u = await db.prepare("UPDATE mesa_sinuca SET status = 'livre', fila_id = NULL, liberando_em = NULL, liberando_por = NULL, desde = datetime('now') WHERE id = ? AND status IN ('ocupada', 'liberando')").bind(mesa.id).run();
  if (!u?.meta?.changes) return;
  if (mesa.fila_id) {
    const f = await db.prepare("SELECT cliente_id FROM fila_sinuca WHERE id = ? AND status = 'jogando'").bind(mesa.fila_id).first();
    if (f) { await db.prepare("UPDATE fila_sinuca SET status = 'finalizado', fim_em = datetime('now') WHERE id = ?").bind(mesa.fila_id).run(); await ajustarConduta(db, f.cliente_id, PREMIO.jogoConcluido, 'jogo_concluido', motivo, mesa.id); }
  }
  if (mesa.liberando_por && motivo === 'relato') await ajustarConduta(db, mesa.liberando_por, PREMIO.relatoCerto, 'relato_confirmado', null, mesa.id);
  await chamarProximo(db, env, mesa.id);
}

/** Resolve o que venceu por tempo (sem precisar de relógio externo: roda a cada consulta/ação). */
export async function avancar(db, env) {
  const cfg = await config(db);
  const { results: demora } = await db.prepare(`SELECT m.id, m.fila_id, f.cliente_id FROM mesa_sinuca m LEFT JOIN fila_sinuca f ON f.id = m.fila_id
    WHERE m.status = 'chamando' AND m.desde <= datetime('now', '-${Math.max(1, Math.floor(cfg.chegada))} minutes')`).all();
  for (const m of demora) {   // chamado e não apareceu
    const u = await db.prepare("UPDATE mesa_sinuca SET status = 'livre', fila_id = NULL WHERE id = ? AND status = 'chamando'").bind(m.id).run();
    if (!u?.meta?.changes) continue;
    if (m.fila_id) await db.prepare("UPDATE fila_sinuca SET status = 'expirou', fim_em = datetime('now') WHERE id = ?").bind(m.fila_id).run();
    if (m.cliente_id) await ajustarConduta(db, m.cliente_id, PENA.naoApareceu, 'penalidade', 'chamado e não apareceu', m.id);
  }
  const { results: avisos } = await db.prepare(`SELECT * FROM mesa_sinuca WHERE status = 'liberando' AND liberando_em <= datetime('now', '-${Math.max(1, Math.floor(cfg.liberar))} seconds')`).all();
  for (const m of avisos) await liberarMesa(db, env, m, 'relato');   // ninguém contestou: vale
  const { results: livres } = await db.prepare("SELECT id FROM mesa_sinuca WHERE ativa = 1 AND status = 'livre' ORDER BY nome").all();
  for (const m of livres) await chamarProximo(db, env, m.id);
}

// ---------- leitura ----------
const curto = (n) => { const p = String(n).split(' '); return p.length > 1 ? `${p[0]} ${p.at(-1)[0]}.` : p[0]; };

async function estado(db, cli) {
  const cfg = await config(db);
  const { results: mesas } = await db.prepare('SELECT m.*, f.nome AS jogador FROM mesa_sinuca m LEFT JOIN fila_sinuca f ON f.id = m.fila_id WHERE m.ativa = 1 ORDER BY m.nome').all();
  const { results: fila } = await db.prepare("SELECT id, nome, status, cliente_id, mesa_id, chamado_em, entrada_em FROM fila_sinuca WHERE status IN ('esperando', 'chamado', 'jogando') ORDER BY entrada_em").all();
  const espera = fila.filter((f) => f.status === 'esperando');
  const dur = await db.prepare("SELECT AVG((julianday(fim_em) - julianday(inicio_em)) * 1440) AS m FROM (SELECT inicio_em, fim_em FROM fila_sinuca WHERE status = 'finalizado' AND inicio_em IS NOT NULL ORDER BY fim_em DESC LIMIT 20)").first();
  const media = Math.min(90, Math.max(5, Math.round(dur?.m ?? 20))), nMesas = Math.max(1, mesas.length);
  const minha = cli ? fila.find((f) => f.cliente_id === cli.id) : null;
  let conduta = null;
  if (cli) { const c = await condutaDe(db, cli.id); conduta = { nivel: nivelDeConduta(c.pontos, c.bloqueado), bloqueado_ate: c.bloqueado ? c.bloqueado_ate : null }; }
  const pos = minha?.status === 'esperando' ? espera.findIndex((f) => f.id === minha.id) + 1 : null;
  const mesaMinha = minha?.mesa_id ? mesas.find((m) => m.id === minha.mesa_id) : null;
  return {
    ativa: cfg.ativa, configurado: cfg.lat != null, raio_m: cfg.raio, chegada_min: cfg.chegada, media_min: media,
    mesas: mesas.map((m) => ({ id: m.id, nome: m.nome, status: m.status, jogador: m.status === 'livre' ? null : curto(m.jogador ?? ''), liberando: m.status === 'liberando', meu: minha?.mesa_id === m.id })),
    fila: espera.map((f, i) => ({ pos: i + 1, nome: curto(f.nome), eu: f.id === minha?.id })),
    minha: minha ? { id: minha.id, status: minha.status, pos, espera_min: pos ? Math.ceil(pos / nMesas) * media : 0, mesa: mesaMinha ? { id: mesaMinha.id, nome: mesaMinha.nome, status: mesaMinha.status } : null,
      expira_em: minha.status === 'chamado' && minha.chamado_em ? new Date(new Date(minha.chamado_em.replace(' ', 'T') + 'Z').getTime() + cfg.chegada * 60000).toISOString() : null } : null,
    conduta,
  };
}

// ---------- ações do cliente ----------
async function entrar(db, env, cli, corpo) {
  const cfg = await config(db), teste = await modoTeste(db);
  if (!cfg.ativa) return erro('A fila da sinuca está desligada agora.', 409);
  const c = await condutaDe(db, cli.id);
  if (c.bloqueado) return erro('Você está sem acesso à fila por um tempo devido a faltas anteriores. Fale com o balcão.', 403);
  const nome = TEXTO(corpo?.nome, 30) || cli.nome.split(' ').slice(0, 2).join(' ');
  const loc = verificarLocal(cfg, corpo, teste);
  if (loc.erro) { if (loc.fora) await registrarFora(db, cli.id); return erro(loc.erro, loc.status); }
  if ((await db.prepare("SELECT COUNT(*) AS n FROM sinuca_evento WHERE cliente_id = ? AND tipo = 'entrou' AND criado_em > datetime('now', '-1 hour')").bind(cli.id).first()).n >= 5) return erro('Você entrou e saiu da fila muitas vezes. Espere um pouco.', 429);
  if ((await db.prepare("SELECT COUNT(*) AS n FROM fila_sinuca WHERE status = 'esperando'").first()).n >= MAX_FILA) return erro('A fila está cheia agora. Tente daqui a pouco.', 409);
  const id = `fil-${id8()}${id8()}`;
  try { await db.prepare('INSERT INTO fila_sinuca (id, cliente_id, nome, dist_m) VALUES (?, ?, ?, ?)').bind(id, cli.id, nome, loc.dist).run(); }
  catch { return erro('Você já está na fila.', 409); }
  await log(db, cli.id, 'entrou');
  await avancar(db, env);
  return json(await estado(db, cli), 201);
}

async function sair(db, env, cli) {
  const f = await db.prepare("SELECT * FROM fila_sinuca WHERE cliente_id = ? AND status IN ('esperando', 'chamado', 'jogando')").bind(cli.id).first();
  if (!f) return json(await estado(db, cli));
  if (f.status === 'jogando') { const m = await db.prepare('SELECT * FROM mesa_sinuca WHERE id = ?').bind(f.mesa_id).first(); if (m) await liberarMesa(db, env, m, 'jogador'); }
  else {
    await db.prepare("UPDATE fila_sinuca SET status = 'cancelado', fim_em = datetime('now') WHERE id = ? AND status IN ('esperando', 'chamado')").bind(f.id).run();
    if (f.status === 'chamado') {
      await db.prepare("UPDATE mesa_sinuca SET status = 'livre', fila_id = NULL WHERE id = ? AND status = 'chamando'").bind(f.mesa_id).run();
      await ajustarConduta(db, cli.id, PENA.desistiuChamado, 'penalidade', 'desistiu depois de chamado', f.mesa_id);
    }
  }
  await avancar(db, env);
  return json(await estado(db, cli));
}

async function cheguei(db, env, cli, corpo) {
  const f = await db.prepare("SELECT * FROM fila_sinuca WHERE cliente_id = ? AND status = 'chamado'").bind(cli.id).first();
  if (!f) return erro('Você não está sendo chamado agora.', 409);
  const loc = verificarLocal(await config(db), corpo, await modoTeste(db));
  if (loc.erro) return erro(loc.erro, loc.status);
  const u = await db.prepare("UPDATE mesa_sinuca SET status = 'ocupada', desde = datetime('now') WHERE id = ? AND status = 'chamando' AND fila_id = ?").bind(f.mesa_id, f.id).run();
  if (!u?.meta?.changes) return erro('A sua vez passou.', 409);
  await db.prepare("UPDATE fila_sinuca SET status = 'jogando', inicio_em = datetime('now') WHERE id = ?").bind(f.id).run();
  return json(await estado(db, cli));
}

/** "Terminou": o próprio jogador libera na hora; outro cliente (no bar) abre uma janela em que o jogador pode contestar; dois clientes diferentes confirmam na hora. */
async function terminou(db, env, cli, mesaId, corpo) {
  const m = await db.prepare('SELECT * FROM mesa_sinuca WHERE id = ? AND ativa = 1').bind(mesaId).first();
  if (!m || !['ocupada', 'liberando'].includes(m.status)) return erro('Essa mesa não está em jogo.', 409);
  const meu = await db.prepare("SELECT id FROM fila_sinuca WHERE cliente_id = ? AND id = ?").bind(cli.id, m.fila_id ?? '').first();
  if (meu) { await liberarMesa(db, env, m, 'jogador'); return json(await estado(db, cli)); }
  const c = await condutaDe(db, cli.id);
  if (c.bloqueado) return erro('Você está sem acesso à fila por um tempo.', 403);
  const loc = verificarLocal(await config(db), corpo, await modoTeste(db));
  if (loc.erro) { if (loc.fora) await registrarFora(db, cli.id); return erro(loc.erro, loc.status); }
  const falsos = (await db.prepare("SELECT COUNT(*) AS n FROM sinuca_evento WHERE cliente_id = ? AND tipo = 'penalidade' AND obs = 'relato falso' AND criado_em > datetime('now', '-1 day')").bind(cli.id).first()).n;
  if (falsos >= 1 && c.pontos < 80) return erro('Seus últimos avisos de “terminou” foram contestados. Por ora, só o jogador libera a mesa.', 403);
  if (m.status === 'ocupada') {
    await db.prepare("UPDATE mesa_sinuca SET status = 'liberando', liberando_em = datetime('now'), liberando_por = ? WHERE id = ? AND status = 'ocupada'").bind(cli.id, m.id).run();
    await log(db, cli.id, 'relato', 0, null, m.id);
  } else if (m.liberando_por !== cli.id) {   // um segundo cliente confirma
    await log(db, cli.id, 'relato_confirmacao', 0, null, m.id);
    await liberarMesa(db, env, m, 'relato');
    await ajustarConduta(db, cli.id, PREMIO.relatoCerto, 'relato_confirmado', 'confirmou o aviso', m.id);
  }
  return json(await estado(db, cli));
}

async function aindaJogando(db, env, cli, mesaId) {
  const m = await db.prepare('SELECT * FROM mesa_sinuca WHERE id = ?').bind(mesaId).first();
  if (!m || m.status !== 'liberando') return erro('Ninguém avisou que terminou.', 409);
  const meu = await db.prepare('SELECT id FROM fila_sinuca WHERE cliente_id = ? AND id = ?').bind(cli.id, m.fila_id ?? '').first();
  if (!meu) return erro('Só quem está jogando pode dizer que ainda está jogando.', 403);
  const por = m.liberando_por;
  const u = await db.prepare("UPDATE mesa_sinuca SET status = 'ocupada', liberando_em = NULL, liberando_por = NULL WHERE id = ? AND status = 'liberando'").bind(m.id).run();
  if (u?.meta?.changes && por) await ajustarConduta(db, por, PENA.relatoFalso, 'penalidade', 'relato falso', m.id);
  return json(await estado(db, cli));
}

async function assinarPush(db, cli, corpo) {
  const f = await db.prepare("SELECT id FROM fila_sinuca WHERE cliente_id = ? AND status IN ('esperando', 'chamado', 'jogando')").bind(cli.id).first();
  if (!f) return erro('Entre na fila primeiro.', 409);
  const e = String(corpo?.endpoint ?? ''), p = corpo?.keys?.p256dh, a = corpo?.keys?.auth;
  if (!e.startsWith('https://') || !p || !a) return erro('Assinatura inválida.');
  await db.prepare('INSERT OR REPLACE INTO push_assinatura (pedido_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)').bind(`fila-${f.id}`, e, p, a).run();
  return json({ ok: true });
}

// ---------- equipe ----------
async function gestao(db, env, request, url, eu) {
  const p = url.pathname, m = request.method; let r;
  if (m === 'GET' && p === '/api/sinuca/gestao') {
    const cfg = await config(db), base = await estado(db, null);
    const { results: fila } = await db.prepare(`SELECT f.id, f.nome, f.status, f.entrada_em, f.mesa_id, f.dist_m, c.pontos, c.bloqueado_ate, f.cliente_id FROM fila_sinuca f LEFT JOIN sinuca_conduta c ON c.cliente_id = f.cliente_id
      WHERE f.status IN ('esperando', 'chamado', 'jogando') ORDER BY f.entrada_em`).all();
    const { results: ruins } = await db.prepare(`SELECT c.cliente_id, cl.nome, c.pontos, c.bloqueios, c.bloqueado_ate FROM sinuca_conduta c JOIN cliente cl ON cl.id = c.cliente_id
      WHERE c.pontos < 100 OR c.bloqueado_ate > datetime('now') ORDER BY c.pontos LIMIT 30`).all();
    const { results: mesasTodas } = await db.prepare('SELECT id, nome, ativa, status FROM mesa_sinuca ORDER BY nome').all();
    return json({ config: { lat: cfg.lat, lng: cfg.lng, raio_m: cfg.raio, chegada_min: cfg.chegada, liberar_seg: cfg.liberar, ativa: cfg.ativa }, mesas: mesasTodas, estado: base, fila, conduta: ruins });
  }
  if (m === 'POST' && p === '/api/sinuca/gestao/mesas') {
    const c = await corpoDe(request), n = TEXTO(c.nome, 30); if (!n) return erro('Dê um nome à mesa.');
    const id = `mesa-${id8()}`; await db.prepare('INSERT INTO mesa_sinuca (id, nome) VALUES (?, ?)').bind(id, n).run(); await avancar(db, env); return json({ id }, 201);
  }
  if (m === 'PUT' && (r = p.match(/^\/api\/sinuca\/gestao\/mesas\/([\w-]+)$/))) {
    const c = await corpoDe(request);
    if (c.nome !== undefined) await db.prepare('UPDATE mesa_sinuca SET nome = ? WHERE id = ?').bind(TEXTO(c.nome, 30) || 'Mesa', r[1]).run();
    if (c.ativa !== undefined) await db.prepare("UPDATE mesa_sinuca SET ativa = ?, status = CASE WHEN ? = 0 AND status = 'livre' THEN 'livre' ELSE status END WHERE id = ?").bind(c.ativa ? 1 : 0, c.ativa ? 1 : 0, r[1]).run();
    await avancar(db, env); return json({ ok: true });
  }
  if (m === 'POST' && (r = p.match(/^\/api\/sinuca\/gestao\/mesas\/([\w-]+)\/liberar$/))) {
    const mesa = await db.prepare('SELECT * FROM mesa_sinuca WHERE id = ?').bind(r[1]).first(); if (!mesa) return erro('Mesa não encontrada.', 404);
    if (mesa.status === 'chamando' && mesa.fila_id) await db.prepare("UPDATE fila_sinuca SET status = 'cancelado', fim_em = datetime('now') WHERE id = ?").bind(mesa.fila_id).run();
    if (mesa.status === 'chamando') await db.prepare("UPDATE mesa_sinuca SET status = 'livre', fila_id = NULL WHERE id = ?").bind(mesa.id).run();
    else await liberarMesa(db, env, mesa, 'equipe');
    await avancar(db, env); return json({ ok: true });
  }
  if (m === 'POST' && (r = p.match(/^\/api\/sinuca\/gestao\/fila\/([\w-]+)\/remover$/))) {
    const f = await db.prepare("SELECT * FROM fila_sinuca WHERE id = ? AND status IN ('esperando', 'chamado')").bind(r[1]).first(); if (!f) return erro('Essa pessoa não está esperando.', 404);
    await db.prepare("UPDATE fila_sinuca SET status = 'cancelado', fim_em = datetime('now') WHERE id = ?").bind(f.id).run();
    if (f.status === 'chamado') await db.prepare("UPDATE mesa_sinuca SET status = 'livre', fila_id = NULL WHERE id = ? AND status = 'chamando'").bind(f.mesa_id).run();
    await avancar(db, env); return json({ ok: true });
  }
  if (m === 'POST' && p === '/api/sinuca/gestao/local') {
    const c = await corpoDe(request), lat = Number(c.lat), lng = Number(c.lng), raio = c.raio_m === undefined ? null : Number(c.raio_m);
    if (![lat, lng].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return erro('Localização inválida.');
    if (raio !== null && !(raio >= 30 && raio <= 1000)) return erro('Raio de 30 a 1000 metros.');
    const set = (k, v) => db.prepare('INSERT INTO configuracao (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor').bind(k, String(v));
    const ops = [set('bar_lat', lat), set('bar_lng', lng)]; if (raio !== null) ops.push(set('sinuca_raio_m', raio));
    if (c.chegada_min !== undefined && Number(c.chegada_min) >= 1 && Number(c.chegada_min) <= 30) ops.push(set('sinuca_chegada_min', Math.floor(Number(c.chegada_min))));
    if (c.ativa !== undefined) ops.push(set('sinuca_ativa', c.ativa ? 'sim' : 'nao'));
    await db.batch(ops); return json({ ok: true });
  }
  if (m === 'POST' && (r = p.match(/^\/api\/sinuca\/gestao\/clientes\/([\w-]+)\/(penalizar|perdoar)$/))) {
    const c = await corpoDe(request), cli = await db.prepare('SELECT id FROM cliente WHERE id = ?').bind(r[1]).first(); if (!cli) return erro('Cliente não encontrado.', 404);
    if (r[2] === 'perdoar') { await condutaDe(db, cli.id); await db.prepare('UPDATE sinuca_conduta SET pontos = 100, bloqueado_ate = NULL WHERE cliente_id = ?').bind(cli.id).run(); await log(db, cli.id, 'perdao', 0, `${eu.nome}: ${TEXTO(c.motivo, 60)}`); }
    else { const d = Math.floor(Number(c.pontos)); if (!(d >= 1 && d <= 100)) return erro('Informe de 1 a 100 pontos.'); await ajustarConduta(db, cli.id, -d, 'penalidade', `${eu.nome}: ${TEXTO(c.motivo, 60) || 'equipe'}`); }
    return json({ ok: true });
  }
  return null;
}

export async function rotearSinuca(request, env, url) {
  const p = url.pathname, m = request.method, db = env.DB;
  if (p.startsWith('/api/sinuca/gestao')) {
    const eu = await usuarioLogado(request, env);
    if (!eu) return erro('Entre com seu nome e senha.', 401);
    if (!eu.modulos.includes('campeonato')) return erro('Seu login não tem acesso à sinuca. Peça ao superadmin.', 403);
    await avancar(db, env);
    return gestao(db, env, request, url, eu);
  }
  const cli = await clienteLogado(request, env);
  await avancar(db, env);
  if (m === 'GET' && p === '/api/sinuca') return json(await estado(db, cli));
  if (!cli) return erro('Entre na sua conta para usar a fila da sinuca.', 401);
  let r;
  if (m === 'POST' && p === '/api/sinuca/entrar') return entrar(db, env, cli, await corpoDe(request));
  if (m === 'POST' && p === '/api/sinuca/sair') return sair(db, env, cli);
  if (m === 'POST' && p === '/api/sinuca/cheguei') return cheguei(db, env, cli, await corpoDe(request));
  if (m === 'POST' && p === '/api/sinuca/push') return assinarPush(db, cli, await corpoDe(request));
  if (m === 'POST' && (r = p.match(/^\/api\/sinuca\/mesas\/([\w-]+)\/terminou$/))) return terminou(db, env, cli, r[1], await corpoDe(request));
  if (m === 'POST' && (r = p.match(/^\/api\/sinuca\/mesas\/([\w-]+)\/ainda-jogando$/))) return aindaJogando(db, env, cli, r[1]);
  return null;
}
