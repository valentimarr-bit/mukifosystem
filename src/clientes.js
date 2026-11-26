// Contas de cliente: cadastro, login (celular/e-mail + senha, ou Google), pontos e níveis; e a área de clientes da gestão.
import { registrarConsentimento, configurado as whatsLigado, numeroWhats, enviarTexto } from './whatsapp.js';
import { json } from './api.js';
import { hashSenha, hashToken, aleatorio, igual, usuarioLogado } from './auth.js';
import { celularValido } from './cliente.js';
import { modoTeste } from './trava.js';
import { NIVEIS, nivelDe } from './dominio/niveis.js';
import { ajustarSaldo } from './carteira.js';

const erro = (m, s = 400) => json({ erro: m }, s);
const DIAS = 90, MAX_FALHAS = 5, BLOQUEIO_MIN = 10;
const emailOk = (e) => (/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e) ? e : null);

/** O CLIENTE só vê o nível: nunca pontos, quanto falta, progresso ou valores (decisão do dono: ele não deve saber quanto está gastando). */
const nivelPublico = (n) => ({ nivel: n.nivel, nome: n.nome, emoji: n.emoji, frase: n.frase, proximo: n.proximo ? { nome: n.proximo.nome, emoji: n.proximo.emoji } : null });
const paraCliente = (c) => ({ id: c.id, nome: c.nome, celular: c.celular, email: c.email, nivel: nivelPublico(nivelDe(c.pontos_total)), saldo: c.saldo ?? 0, tem_senha: !!c.senha_hash, whats: !!c.whats_aceite_em && !c.whats_recusou });
const publico = (c) => ({ id: c.id, nome: c.nome, celular: c.celular, email: c.email, pontos: c.pontos, pontos_total: c.pontos_total, nivel: nivelDe(c.pontos_total), tem_senha: !!c.senha_hash });

async function abrirSessao(db, clienteId) {
  const token = aleatorio(32);
  await db.prepare(`INSERT INTO cliente_sessao (token_hash, cliente_id, expira_em) VALUES (?, ?, datetime('now', '+${DIAS} days'))`).bind(await hashToken(token), clienteId).run();
  return token;
}
export async function clienteLogado(request, env) {
  const t = request.headers.get('X-Sessao-Cliente'); if (!t) return null;
  return env.DB.prepare(`SELECT c.* FROM cliente_sessao s JOIN cliente c ON c.id = s.cliente_id WHERE s.token_hash = ? AND s.expira_em > datetime('now') AND c.ativo = 1`).bind(await hashToken(t)).first();
}

/** 1 ponto por real pago, uma única vez por pedido. Só conta depois que o pedido está pago. */
export async function creditarPontos(db, pedidoId) {
  const p = await db.prepare("SELECT cliente_id, total, status FROM pedido WHERE id = ?").bind(pedidoId).first();
  if (!p?.cliente_id || !['recebido', 'preparando', 'pronto', 'entregue'].includes(p.status)) return 0;
  const pts = Math.floor(p.total); if (pts < 1) return 0;
  const r = await db.prepare("INSERT OR IGNORE INTO ponto_mov (cliente_id, pedido_id, pontos, motivo) VALUES (?, ?, ?, 'compra')").bind(p.cliente_id, pedidoId, pts).run();
  if (!r?.meta?.changes) return 0;
  await db.prepare('UPDATE cliente SET pontos = pontos + ?1, pontos_total = pontos_total + ?1 WHERE id = ?2').bind(pts, p.cliente_id).run();
  return pts;
}

// ---- Google: confere a assinatura do token com as chaves públicas do Google ----
export async function verificarGoogle(credential, clientId, jwks, agora = Date.now()) {
  const [h, p, s] = String(credential ?? '').split('.'); if (!s) return null;
  const dec = (x) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(x.length / 4) * 4, '=')), (c) => c.charCodeAt(0))));
  let cab, dados; try { cab = dec(h); dados = dec(p); } catch { return null; }
  const jwk = jwks?.keys?.find((k) => k.kid === cab.kid); if (!jwk || cab.alg !== 'RS256') return null;
  const chave = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const sig = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', chave, sig, new TextEncoder().encode(`${h}.${p}`)))) return null;
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(dados.iss) || dados.aud !== clientId || !(dados.exp * 1000 > agora) || !dados.sub) return null;
  return { sub: String(dados.sub), email: dados.email_verified ? String(dados.email ?? '').toLowerCase() || null : null, nome: String(dados.name ?? '').slice(0, 40) };
}

async function cadastro(db, c) {
  const nome = String(c?.nome ?? '').replace(/\s+/g, ' ').trim().slice(0, 40); if (nome.length < 2) return erro('Digite seu nome.');
  const celular = celularValido(c?.celular); if (!celular) return erro('Digite seu celular com DDD.');
  const email = c?.email ? emailOk(String(c.email).trim().toLowerCase()) : null; if (c?.email && !email) return erro('E-mail inválido.');
  const senha = String(c?.senha ?? ''); if (senha.length < 6 || senha.length > 100) return erro('A senha precisa ter de 6 a 100 caracteres.');
  if (c?.aceite !== true) return erro('Para criar a conta, aceite os termos e a política de privacidade.');
  if (await db.prepare('SELECT 1 AS x FROM cliente WHERE celular = ? OR (email IS NOT NULL AND email = ?)').bind(celular, email).first()) return erro('Já existe uma conta com esse celular ou e-mail. Toque em “Entrar”.', 409);
  const id = 'cli-' + aleatorio(8), sal = aleatorio(16);
  await db.prepare("INSERT INTO cliente (id, nome, celular, email, senha_hash, sal, aceite_em) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))").bind(id, nome, celular, email, await hashSenha(senha, sal), sal).run();
  if (c?.whats === true) await registrarConsentimento(db, { id, celular }, true, 'cadastro');   // opcional: só marca quem marcou a caixa
  const cli = await db.prepare('SELECT * FROM cliente WHERE id = ?').bind(id).first();
  return json({ ok: true, token: await abrirSessao(db, id), cliente: paraCliente(cli) }, 201);
}

async function entrar(db, c) {
  const login = String(c?.login ?? '').trim().toLowerCase(), cel = celularValido(login);
  const cli = await db.prepare('SELECT * FROM cliente WHERE ativo = 1 AND ((? IS NOT NULL AND celular = ?) OR email = ?)').bind(cel, cel, login).first();
  const falha = erro('Celular, e-mail ou senha não conferem.', 401);
  if (!cli || !cli.senha_hash) return falha;
  if (!(await modoTeste(db)) && cli.bloqueado_ate && cli.bloqueado_ate > new Date().toISOString().replace('T', ' ').slice(0, 19)) return erro('Muitas tentativas. Espere alguns minutos e tente de novo.', 429);
  if (!igual(await hashSenha(String(c?.senha ?? ''), cli.sal), cli.senha_hash)) {
    await db.prepare(`UPDATE cliente SET falhas = falhas + 1, bloqueado_ate = CASE WHEN falhas + 1 >= ${MAX_FALHAS} THEN datetime('now', '+${BLOQUEIO_MIN} minutes') END, falhas = CASE WHEN falhas + 1 >= ${MAX_FALHAS} THEN 0 ELSE falhas + 1 END WHERE id = ?`).bind(cli.id).run();
    return falha;
  }
  await db.prepare('UPDATE cliente SET falhas = 0, bloqueado_ate = NULL WHERE id = ?').bind(cli.id).run();
  return json({ ok: true, token: await abrirSessao(db, cli.id), cliente: paraCliente(cli) });
}

// ---- esqueci minha senha ----
const RESET_MIN = 15, RESET_TENTATIVAS = 5;
const codigoSeis = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
const hashCodigo = (codigo, id) => hashToken(`reset|${id}|${codigo}`);
async function gravarCodigo(db, id) {
  const codigo = codigoSeis();
  await db.prepare(`UPDATE cliente SET reset_hash = ?, reset_ate = datetime('now', '+${RESET_MIN} minutes'), reset_falhas = 0 WHERE id = ?`).bind(await hashCodigo(codigo, id), id).run();
  return codigo;
}
/** Envio por e-mail (Resend) só se RESEND_API_KEY e EMAIL_REMETENTE estiverem configurados; senão o código sai pelo balcão. */
async function enviarEmail(env, para, assunto, texto) {
  if (!env.RESEND_API_KEY || !env.EMAIL_REMETENTE) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: env.EMAIL_REMETENTE, to: [para], subject: assunto, text: texto }) });
    return r.ok;
  } catch { return false; }
}
async function acharConta(db, login) {
  const l = String(login ?? '').trim().toLowerCase(), cel = celularValido(l);
  return db.prepare('SELECT * FROM cliente WHERE ativo = 1 AND ((? IS NOT NULL AND celular = ?) OR email = ?)').bind(cel, cel, l).first();
}
/** Esqueci a senha: manda o código de 6 dígitos pelo WhatsApp do bar (izapia) e/ou por e-mail (Resend), o que estiver configurado.
 * É mensagem que a própria pessoa pediu (não é propaganda), então não depende do aceite de convites. */
async function esqueci(db, env, c) {
  const cli = await acharConta(db, c?.login);
  const porWhats = whatsLigado(env), porEmail = !!(env.RESEND_API_KEY && env.EMAIL_REMETENTE);
  const meios = [porWhats && 'WhatsApp', porEmail && 'e-mail'].filter(Boolean).join(' ou ');
  const mensagem = meios ? `Se existir uma conta com esses dados, mandamos um código por ${meios}. Se não chegar em 2 minutos, peça um código no balcão do bar.` : 'Peça o código no balcão do bar.';
  const resposta = { ok: true, email: porEmail, whats: porWhats, mensagem };
  if (!cli) return json(resposta);   // mesma resposta para quem não existe: ninguém descobre quem tem conta
  const para = porWhats ? numeroWhats(cli.celular) : null, mail = porEmail ? cli.email : null;
  if (!para && !mail) return json(resposta);
  const recente = await db.prepare("SELECT 1 AS x FROM cliente WHERE id = ? AND reset_ate > datetime('now', '+14 minutes')").bind(cli.id).first();
  if (recente) return json(resposta);   // no máximo 1 envio por minuto
  const codigo = await gravarCodigo(db, cli.id);
  const texto = `Mukifo: seu código para criar uma nova senha é ${codigo}. Vale ${RESET_MIN} minutos. Se não foi você, ignore.`;
  await Promise.all([para && enviarTexto(env, para, texto), mail && enviarEmail(env, mail, 'Seu código do Mukifo', texto)]);
  return json(resposta);
}
async function redefinir(db, c) {
  const cli = await acharConta(db, c?.login); const falha = erro('Código inválido ou vencido. Peça um novo no balcão.', 400);
  const senha = String(c?.senha ?? ''); if (senha.length < 6 || senha.length > 100) return erro('A nova senha precisa ter de 6 a 100 caracteres.');
  if (!cli || !cli.reset_hash || !(cli.reset_ate > new Date().toISOString().replace('T', ' ').slice(0, 19)) || cli.reset_falhas >= RESET_TENTATIVAS) return falha;
  if (!igual(await hashCodigo(String(c?.codigo ?? '').replace(/\D/g, ''), cli.id), cli.reset_hash)) {
    await db.prepare('UPDATE cliente SET reset_falhas = reset_falhas + 1 WHERE id = ?').bind(cli.id).run();
    return falha;
  }
  const sal = aleatorio(16);
  await db.batch([
    db.prepare('UPDATE cliente SET senha_hash = ?, sal = ?, reset_hash = NULL, reset_ate = NULL, reset_falhas = 0, falhas = 0, bloqueado_ate = NULL WHERE id = ?').bind(await hashSenha(senha, sal), sal, cli.id),
    db.prepare('DELETE FROM cliente_sessao WHERE cliente_id = ?').bind(cli.id)]);   // quem estava logado com a senha antiga cai
  const novo = await db.prepare('SELECT * FROM cliente WHERE id = ?').bind(cli.id).first();
  return json({ ok: true, token: await abrirSessao(db, cli.id), cliente: paraCliente(novo) });
}

async function google(db, env, c) {
  if (!env.GOOGLE_CLIENT_ID) return erro('O login com Google ainda não foi ligado.', 503);
  const jwks = await (await fetch('https://www.googleapis.com/oauth2/v3/certs')).json().catch(() => null);
  const g = await verificarGoogle(c?.credential, env.GOOGLE_CLIENT_ID, jwks); if (!g) return erro('Não consegui confirmar sua conta Google.', 401);
  let cli = await db.prepare('SELECT * FROM cliente WHERE google_sub = ? OR (? IS NOT NULL AND email = ?)').bind(g.sub, g.email, g.email).first();
  if (cli) { if (!cli.ativo) return erro('Conta desativada.', 403); if (!cli.google_sub) await db.prepare('UPDATE cliente SET google_sub = ? WHERE id = ?').bind(g.sub, cli.id).run(); }
  else {
    if (c?.aceite !== true) return erro('Aceite os termos para criar a conta.', 400);
    const id = 'cli-' + aleatorio(8);
    await db.prepare("INSERT INTO cliente (id, nome, email, google_sub, aceite_em) VALUES (?, ?, ?, ?, datetime('now'))").bind(id, g.nome || 'Cliente', g.email, g.sub).run();
    cli = await db.prepare('SELECT * FROM cliente WHERE id = ?').bind(id).first();
  }
  return json({ ok: true, token: await abrirSessao(db, cli.id), cliente: paraCliente(cli) });
}

export async function rotearConta(request, env, url) {
  const db = env.DB, m = request.method, p = url.pathname;
  if (m === 'GET' && p === '/api/conta/niveis') return json({ niveis: NIVEIS.map((n) => ({ nivel: n.nivel, nome: n.nome, emoji: n.emoji, frase: n.frase })), google_client_id: env.GOOGLE_CLIENT_ID || null });
  let c = {}; if (m === 'POST' || m === 'PUT') { try { c = await request.json(); } catch { /* vazio */ } }
  if (m === 'POST' && p === '/api/conta/cadastro') return cadastro(db, c);
  if (m === 'POST' && p === '/api/conta/entrar') return entrar(db, c);
  if (m === 'POST' && p === '/api/conta/google') return google(db, env, c);
  if (m === 'POST' && p === '/api/conta/esqueci') return esqueci(db, env, c);
  if (m === 'POST' && p === '/api/conta/redefinir') return redefinir(db, c);
  const cli = await clienteLogado(request, env); if (!cli) return erro('Entre na sua conta.', 401);
  if (m === 'GET' && p === '/api/conta/eu') {
    const { results: peds } = await db.prepare("SELECT p.id, p.numero, p.dia, p.status FROM pedido p WHERE p.cliente_id = ? AND p.status <> 'cancelado' ORDER BY p.criado_em DESC, p.id DESC LIMIT 20").bind(cli.id).all();
    const { results: its } = peds.length ? await db.prepare(`SELECT pedido_id, nome, quantidade FROM item_pedido WHERE pedido_id IN (${peds.map(() => '?').join(',')}) ORDER BY id`).bind(...peds.map((x) => x.id)).all() : { results: [] };
    // o cliente vê o que pediu, nunca preço nem total
    const results = peds.map((x) => ({ numero: x.numero, dia: x.dia, status: x.status, itens: its.filter((i) => i.pedido_id === x.id).map((i) => ({ nome: i.nome, quantidade: i.quantidade })) }));
    return json({ cliente: paraCliente(cli), pedidos: results });
  }
  if (m === 'POST' && p === '/api/conta/sair') { await db.prepare('DELETE FROM cliente_sessao WHERE token_hash = ?').bind(await hashToken(request.headers.get('X-Sessao-Cliente'))).run(); return json({ ok: true }); }
  if (m === 'PUT' && p === '/api/conta/whats') {   // o cliente liga ou desliga os convites por WhatsApp
    if (typeof c?.aceita !== 'boolean') return erro('Diga se quer receber.');
    if (c.aceita && !cli.celular) return erro('Cadastre um celular na sua conta para receber por WhatsApp.');
    await registrarConsentimento(db, cli, c.aceita, 'conta'); return json({ ok: true, whats: c.aceita });
  }
  if (m === 'PUT' && p === '/api/conta/eu') {
    const nome = String(c?.nome ?? '').replace(/\s+/g, ' ').trim().slice(0, 40); if (nome.length < 2) return erro('Digite seu nome.');
    await db.prepare('UPDATE cliente SET nome = ? WHERE id = ?').bind(nome, cli.id).run(); return json({ ok: true });
  }
  return null;
}

// ---- gestão: área de cadastro de clientes ----
export async function rotearClientes(request, env, url) {
  const eu = await usuarioLogado(request, env); if (!eu) return erro('Entre com seu nome e senha', 401);
  const db = env.DB, m = request.method, p = url.pathname;
  const atendente = eu?.papel === 'atendente' || eu?.cargo === 'Atendente';   // atendente não mexe em saldo nem senha do cliente
  if (m === 'GET' && p === '/api/clientes') {
    const q = `%${(url.searchParams.get('q') ?? '').trim().toLowerCase().replace(/[%_]/g, '')}%`;
    const { results } = await db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM pedido p WHERE p.cliente_id = c.id AND p.status IN ('recebido','preparando','pronto','entregue')) AS pedidos,
      (SELECT MAX(p.dia) FROM pedido p WHERE p.cliente_id = c.id) AS ultima_visita FROM cliente c
      WHERE LOWER(c.nome) LIKE ?1 OR c.celular LIKE ?1 OR LOWER(COALESCE(c.email, '')) LIKE ?1 ORDER BY c.pontos_total DESC, c.criado_em DESC LIMIT 300`).bind(q).all();
    const porNivel = {}; for (const x of results) { const n = nivelDe(x.pontos_total).nome; porNivel[n] = (porNivel[n] ?? 0) + 1; }
    return json({ total: results.length, por_nivel: porNivel, clientes: results.map((x) => ({ id: x.id, nome: x.nome, celular: x.celular, email: x.email, pontos: x.pontos, pontos_total: x.pontos_total, nivel: nivelDe(x.pontos_total).nome, emoji: nivelDe(x.pontos_total).emoji, pedidos: x.pedidos, ultima_visita: x.ultima_visita, ativo: !!x.ativo, criado_em: x.criado_em })) });
  }
  const k = p.match(/^\/api\/clientes\/([\w-]+)(\/pontos|\/codigo-senha|\/saldo)?$/); if (!k) return null;
  if (m === 'POST' && (k[2] === '/saldo' || k[2] === '/codigo-senha') && atendente) return erro('Só gerente ou dono pode fazer isso.', 403);
  const cli = await db.prepare('SELECT * FROM cliente WHERE id = ?').bind(k[1]).first(); if (!cli) return erro('Cliente não encontrado.', 404);
  if (m === 'GET' && !k[2]) {
    const [{ results: pedidos }, { results: pontos }] = await Promise.all([
      db.prepare("SELECT numero, dia, total, status FROM pedido WHERE cliente_id = ? ORDER BY criado_em DESC LIMIT 30").bind(cli.id).all(),
      db.prepare('SELECT pontos, motivo, criado_em FROM ponto_mov WHERE cliente_id = ? ORDER BY id DESC LIMIT 30').bind(cli.id).all()]);
    return json({ cliente: { ...publico(cli), saldo: cli.saldo }, ativo: !!cli.ativo, aceite_em: cli.aceite_em, pedidos, pontos });
  }
  if (m === 'POST' && k[2] === '/saldo') { let b = {}; try { b = await request.json(); } catch { /* vazio */ } return ajustarSaldo(db, cli.id, b, eu.nome); }
  if (m === 'POST' && k[2] === '/codigo-senha') {   // cliente esqueceu a senha e está no balcão: a equipe gera um código de uso único
    if (!cli.senha_hash && !cli.google_sub) return erro('Essa conta não tem senha para trocar.', 409);
    return json({ ok: true, codigo: await gravarCodigo(db, cli.id), valido_min: RESET_MIN, celular: cli.celular });
  }
  let c = {}; try { c = await request.json(); } catch { /* vazio */ }
  if (m === 'PUT' && !k[2]) {
    const nome = String(c.nome ?? cli.nome).replace(/\s+/g, ' ').trim().slice(0, 40); if (nome.length < 2) return erro('Nome inválido.');
    await db.prepare('UPDATE cliente SET nome = ?, ativo = ? WHERE id = ?').bind(nome, c.ativo === false ? 0 : 1, cli.id).run(); return json({ ok: true });
  }
  if (m === 'POST' && k[2] === '/pontos') {
    if (eu.papel !== 'superadmin') return erro('Só o superadmin ajusta pontos.', 403);
    const pts = Number(c.pontos), motivo = String(c.motivo ?? '').trim().slice(0, 60);
    if (!Number.isInteger(pts) || pts === 0 || Math.abs(pts) > 100000) return erro('Digite os pontos (número inteiro, pode ser negativo).');
    if (!motivo) return erro('Diga o motivo do ajuste.');
    if (cli.pontos + pts < 0) return erro('O cliente não tem pontos suficientes.', 409);
    await db.batch([db.prepare("INSERT INTO ponto_mov (cliente_id, pontos, motivo) VALUES (?, ?, ?)").bind(cli.id, pts, 'ajuste: ' + motivo),
      db.prepare('UPDATE cliente SET pontos = pontos + ?1, pontos_total = pontos_total + MAX(?1, 0) WHERE id = ?2').bind(pts, cli.id)]);
    return json({ ok: true });
  }
  return null;
}
