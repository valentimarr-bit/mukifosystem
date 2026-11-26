// Login do Mukifo: primeiro acesso cria o superadmin; ele pode trocar a senha e passar o cargo.
import { json } from './api.js';
import { modulosDe, MODULOS, IDS, PADRAO_GERENTE } from './dominio/modulos.js';

const erro = (msg, status = 400) => json({ erro: msg }, status);
const DIAS_SESSAO = 30;
// Login de demonstração: um botão que entra sem senha, só para ver as telas, e só de leitura.
// Vem desligado; para ligar, crie LOGIN_DEMO = sim na Cloudflare.
export const NOME_DEMO = 'Demonstração';
const MODULOS_DEMO = ['venda', 'producao', 'estoque', 'recomendado', 'produtos', 'combos', 'niveis', 'fotos', 'desempenho', 'campeonato'];
const demoLigado = (env) => String(env.LOGIN_DEMO ?? '').toLowerCase() === 'sim';
const enc = new TextEncoder();

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const aleatorio = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

export async function hashSenha(senha, sal) {
  const chave = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(sal), iterations: 100000 }, chave, 256);
  return hex(bits);
}
export const hashToken = async (t) => hex(await crypto.subtle.digest('SHA-256', enc.encode(t)));

export function igual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function novaSessao(db, usuarioId, dias = DIAS_SESSAO) {
  const token = aleatorio(32);
  await db.prepare(`INSERT INTO sessao (token_hash, usuario_id, expira_em) VALUES (?, ?, datetime('now', ?))`)
    .bind(await hashToken(token), usuarioId, `+${dias} days`).run();
  return token;
}

/** Quem está logado? Aceita o token de sessão ou, como chave de emergência, o ADMIN_TOKEN. */
export async function usuarioLogado(request, env) {
  const h = request.headers.get('authorization') ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) return null;
  if (env.ADMIN_TOKEN && igual(token, env.ADMIN_TOKEN)) return { id: null, nome: 'chave-de-emergência', papel: 'superadmin', modulos: modulosDe({ papel: 'superadmin' }) };
  if (!env.DB) return null;
  const u = await env.DB.prepare(
    `SELECT u.id, u.nome, u.papel, u.modulos FROM sessao s JOIN usuario u ON u.id = s.usuario_id
     WHERE s.token_hash = ? AND s.expira_em > datetime('now') AND u.ativo = 1`).bind(await hashToken(token)).first();
  if (!u) return null;
  // Se o login de demonstração for desligado, as sessões dele param de valer na hora.
  if (u.nome === NOME_DEMO) {
    if (!demoLigado(env)) return null;
    // A demonstração só olha: qualquer pedido que escreve (exceto sair) é recusado.
    const metodo = request.method;
    const caminho = new URL(request.url).pathname;
    if (metodo !== 'GET' && metodo !== 'HEAD' && caminho !== '/api/auth/sair') return null;
    return { id: u.id, nome: u.nome, papel: u.papel, modulos: MODULOS_DEMO, demo: true };
  }
  return { id: u.id, nome: u.nome, papel: u.papel, modulos: modulosDe(u) };
}

const validarNovaSenha = (s) => (typeof s === 'string' && s.length >= 6 ? null : 'A senha precisa ter pelo menos 6 caracteres.');

export async function rotearAuth(request, env, url) {
  const db = env.DB;
  const m = request.method;
  const p = url.pathname;
  let corpo = {};
  if (m === 'POST' || m === 'PUT') { try { corpo = await request.json(); } catch { corpo = {}; } }

  if (m === 'GET' && p === '/api/auth/estado') {
    const r = await db.prepare('SELECT COUNT(*) AS n FROM usuario').first();
    return json({ primeiroAcesso: r.n === 0, pedeCodigo: r.n === 0, faltaCodigo: r.n === 0 && !env.CODIGO_PRIMEIRO_ACESSO, demo: r.n > 0 && demoLigado(env) });
  }

  // Entrar como demonstração: sem senha, sessão de 7 dias.
  if (m === 'POST' && p === '/api/auth/demo') {
    if (!demoLigado(env)) return erro('A demonstração está desligada.', 403);
    if (!(await db.prepare('SELECT 1 AS x FROM usuario WHERE papel = ? LIMIT 1').bind('superadmin').first())) return erro('Faça o primeiro acesso antes.', 409);
    await db.prepare(`INSERT OR IGNORE INTO usuario (nome, senha_hash, senha_sal, papel) VALUES (?, ?, ?, 'gerente')`)
      .bind(NOME_DEMO, aleatorio(32), aleatorio(16)).run(); // senha aleatória que ninguém conhece: só entra por este botão
    await db.prepare('UPDATE usuario SET ativo = 1 WHERE nome = ?').bind(NOME_DEMO).run(); // a coluna ativo existe em 0003_usuarios.sql
    const u = await db.prepare('SELECT id FROM usuario WHERE nome = ? AND papel = ?').bind(NOME_DEMO, 'gerente').first();
    if (!u) return erro('Não foi possível criar a demonstração.', 500);
    await db.prepare(`DELETE FROM sessao WHERE usuario_id = ? AND expira_em <= datetime('now')`).bind(u.id).run();
    return json({ ok: true, token: await novaSessao(db, u.id, 7), usuario: { id: u.id, nome: NOME_DEMO, papel: 'gerente', demo: true } });
  }

  if (m === 'POST' && p === '/api/auth/primeiro-acesso') {
    const nome = String(corpo.nome ?? '').trim();
    if (nome.length < 2) return erro('Digite seu nome.');
    const e = validarNovaSenha(corpo.senha); if (e) return erro(e);
    // Sem o código, qualquer um que achasse o site primeiro viraria superadmin.
    if (!env.CODIGO_PRIMEIRO_ACESSO) return erro('Falta criar o código de primeiro acesso na Cloudflare (Settings → Variables and Secrets → CODIGO_PRIMEIRO_ACESSO).', 503);
    if (!igual(String(corpo.codigo ?? ''), env.CODIGO_PRIMEIRO_ACESSO)) return erro('Código de primeiro acesso inválido.', 403);
    const sal = aleatorio(16);
    // Atômico: só insere se ainda não existe ninguém. Quem chegar primeiro vira superadmin.
    const r = await db.prepare(
      `INSERT INTO usuario (nome, senha_hash, senha_sal, papel)
       SELECT ?, ?, ?, 'superadmin' WHERE NOT EXISTS (SELECT 1 FROM usuario) RETURNING id`)
      .bind(nome, await hashSenha(corpo.senha, sal), sal).first();
    if (!r) return erro('O sistema já tem um superadmin. Entre com seu nome e senha.', 409);
    return json({ ok: true, token: await novaSessao(db, r.id), usuario: { id: r.id, nome, papel: 'superadmin' } });
  }

  if (m === 'POST' && p === '/api/auth/entrar') {
    const u = await db.prepare('SELECT * FROM usuario WHERE nome = ? AND ativo = 1').bind(String(corpo.nome ?? '').trim()).first();
    const hash = await hashSenha(String(corpo.senha ?? ''), u?.senha_sal ?? 'x'); // gasta o mesmo tempo mesmo se o nome não existir
    if (!u || !igual(hash, u.senha_hash)) return erro('Nome ou senha incorretos.', 401);
    return json({ ok: true, token: await novaSessao(db, u.id), usuario: { id: u.id, nome: u.nome, papel: u.papel } });
  }

  // Daqui para baixo precisa estar logado.
  const eu = await usuarioLogado(request, env);
  if (!eu) return erro('Entre com seu nome e senha.', 401);
  const token = (request.headers.get('authorization') ?? '').slice(7).trim();

  if (m === 'GET' && p === '/api/auth/eu') return json({ usuario: eu });

  if (m === 'POST' && p === '/api/auth/sair') {
    await db.prepare('DELETE FROM sessao WHERE token_hash = ?').bind(await hashToken(token)).run();
    return json({ ok: true });
  }

  if (m === 'POST' && p === '/api/auth/trocar-senha') {
    if (!eu.id || eu.demo) return erro('Este login não tem senha para trocar.');
    const e = validarNovaSenha(corpo.senhaNova); if (e) return erro(e);
    const u = await db.prepare('SELECT * FROM usuario WHERE id = ?').bind(eu.id).first();
    if (!igual(await hashSenha(String(corpo.senhaAtual ?? ''), u.senha_sal), u.senha_hash)) return erro('Senha atual incorreta.', 403);
    const sal = aleatorio(16);
    await db.batch([
      db.prepare('UPDATE usuario SET senha_hash = ?, senha_sal = ? WHERE id = ?').bind(await hashSenha(corpo.senhaNova, sal), sal, eu.id),
      db.prepare('DELETE FROM sessao WHERE usuario_id = ? AND token_hash <> ?').bind(eu.id, await hashToken(token)), // derruba os outros aparelhos
    ]);
    return json({ ok: true });
  }

  // ---- painel de permissões (só o superadmin) ----
  let km;
  if (p === '/api/modulos' && m === 'GET') {
    if (eu.papel !== 'superadmin') return erro('Só o superadmin pode fazer isso.', 403);
    return json({ modulos: MODULOS, padrao_gerente: PADRAO_GERENTE });
  }
  if (m === 'PUT' && (km = p.match(/^\/api\/usuarios\/(\d+)\/modulos$/))) {
    if (eu.papel !== 'superadmin') return erro('Só o superadmin pode fazer isso.', 403);
    const alvo = await db.prepare('SELECT id, papel FROM usuario WHERE id = ? AND nome <> ?').bind(Number(km[1]), NOME_DEMO).first();
    if (!alvo) return erro('Pessoa não encontrada.', 404);
    if (alvo.papel === 'superadmin') return erro('O superadmin sempre enxerga tudo.', 409);
    if (corpo.padrao === true) { await db.prepare('UPDATE usuario SET modulos = NULL WHERE id = ?').bind(alvo.id).run(); return json({ ok: true, modulos: PADRAO_GERENTE }); }
    const lista = Array.isArray(corpo.modulos) ? [...new Set(corpo.modulos.map(String))] : null;
    if (!lista || lista.some((x) => !IDS.includes(x))) return erro('Lista de módulos inválida.');
    await db.prepare('UPDATE usuario SET modulos = ? WHERE id = ?').bind(JSON.stringify(lista), alvo.id).run();
    return json({ ok: true, modulos: lista });
  }

  // ---- só o superadmin ----
  if (p === '/api/usuarios' || p === '/api/auth/passar-cargo') {
    if (eu.papel !== 'superadmin') return erro('Só o superadmin pode fazer isso.', 403);

    if (m === 'GET' && p === '/api/usuarios') {
      const { results } = await db.prepare('SELECT id, nome, papel, ativo, criado_em, modulos FROM usuario WHERE nome <> ? ORDER BY id').bind(NOME_DEMO).all();
      return json(results.map((u) => ({ id: u.id, nome: u.nome, papel: u.papel, ativo: u.ativo, criado_em: u.criado_em, modulos: modulosDe(u), personalizado: u.modulos != null })));
    }
    if (m === 'POST' && p === '/api/usuarios') {
      const nome = String(corpo.nome ?? '').trim();
      if (nome.length < 2) return erro('Digite o nome.');
      if (nome.toLowerCase() === NOME_DEMO.toLowerCase()) return erro('Esse nome é reservado para o login de demonstração.');
      const e = validarNovaSenha(corpo.senha); if (e) return erro(e);
      const sal = aleatorio(16);
      try {
        await db.prepare(`INSERT INTO usuario (nome, senha_hash, senha_sal, papel) VALUES (?, ?, ?, 'gerente')`)
          .bind(nome, await hashSenha(corpo.senha, sal), sal).run();
      } catch { return erro('Já existe alguém com esse nome.', 409); }
      return json({ ok: true });
    }
    // Passa o cargo de superadmin para outro usuário; quem passa vira gerente.
    if (m === 'POST' && p === '/api/auth/passar-cargo') {
      if (!eu.id) return erro('Entre com seu nome e senha para passar o cargo.');
      const alvo = await db.prepare('SELECT id, nome FROM usuario WHERE id = ? AND ativo = 1 AND nome <> ?').bind(Number(corpo.usuarioId), NOME_DEMO).first();
      if (!alvo || alvo.id === eu.id) return erro('Escolha outra pessoa.');
      const u = await db.prepare('SELECT * FROM usuario WHERE id = ?').bind(eu.id).first();
      if (!igual(await hashSenha(String(corpo.senha ?? ''), u.senha_sal), u.senha_hash)) return erro('Senha incorreta.', 403);
      await db.batch([
        db.prepare("UPDATE usuario SET papel = 'gerente' WHERE id = ?").bind(eu.id),
        db.prepare("UPDATE usuario SET papel = 'superadmin' WHERE id = ?").bind(alvo.id),
      ]);
      return json({ ok: true, novoSuperadmin: alvo.nome });
    }
  }
  return null;
}
