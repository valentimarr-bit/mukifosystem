// Login do Mukifo: primeiro acesso cria o superadmin; ele pode trocar a senha e passar o cargo.
import { json } from './api.js';

const erro = (msg, status = 400) => json({ erro: msg }, status);
const DIAS_SESSAO = 30;
const enc = new TextEncoder();

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const aleatorio = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

async function hashSenha(senha, sal) {
  const chave = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(sal), iterations: 100000 }, chave, 256);
  return hex(bits);
}
const hashToken = async (t) => hex(await crypto.subtle.digest('SHA-256', enc.encode(t)));

function igual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function novaSessao(db, usuarioId) {
  const token = aleatorio(32);
  await db.prepare(`INSERT INTO sessao (token_hash, usuario_id, expira_em) VALUES (?, ?, datetime('now', ?))`)
    .bind(await hashToken(token), usuarioId, `+${DIAS_SESSAO} days`).run();
  return token;
}

/** Quem está logado? Aceita o token de sessão ou, como chave de emergência, o ADMIN_TOKEN. */
export async function usuarioLogado(request, env) {
  const h = request.headers.get('authorization') ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) return null;
  if (env.ADMIN_TOKEN && igual(token, env.ADMIN_TOKEN)) return { id: null, nome: 'chave-de-emergência', papel: 'superadmin' };
  if (!env.DB) return null;
  return env.DB.prepare(
    `SELECT u.id, u.nome, u.papel FROM sessao s JOIN usuario u ON u.id = s.usuario_id
     WHERE s.token_hash = ? AND s.expira_em > datetime('now') AND u.ativo = 1`).bind(await hashToken(token)).first();
}

const validarNovaSenha = (s) => (typeof s === 'string' && s.length >= 6 ? null : 'A senha precisa ter pelo menos 6 caracteres.');

export async function rotearAuth(request, env, url) {
  const db = env.DB;
  const m = request.method;
  const p = url.pathname;
  let corpo = {};
  if (m === 'POST') { try { corpo = await request.json(); } catch { corpo = {}; } }

  if (m === 'GET' && p === '/api/auth/estado') {
    const r = await db.prepare('SELECT COUNT(*) AS n FROM usuario').first();
    return json({ primeiroAcesso: r.n === 0, pedeCodigo: r.n === 0 && !!env.CODIGO_PRIMEIRO_ACESSO });
  }

  if (m === 'POST' && p === '/api/auth/primeiro-acesso') {
    const nome = String(corpo.nome ?? '').trim();
    if (nome.length < 2) return erro('Digite seu nome.');
    const e = validarNovaSenha(corpo.senha); if (e) return erro(e);
    if (env.CODIGO_PRIMEIRO_ACESSO && !igual(String(corpo.codigo ?? ''), env.CODIGO_PRIMEIRO_ACESSO)) return erro('Código de primeiro acesso inválido.', 403);
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
    if (!eu.id) return erro('A chave de emergência não tem senha para trocar.');
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

  // ---- só o superadmin ----
  if (p === '/api/usuarios' || p === '/api/auth/passar-cargo') {
    if (eu.papel !== 'superadmin') return erro('Só o superadmin pode fazer isso.', 403);

    if (m === 'GET' && p === '/api/usuarios') {
      const { results } = await db.prepare('SELECT id, nome, papel, ativo, criado_em FROM usuario ORDER BY id').all();
      return json(results);
    }
    if (m === 'POST' && p === '/api/usuarios') {
      const nome = String(corpo.nome ?? '').trim();
      if (nome.length < 2) return erro('Digite o nome.');
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
      const alvo = await db.prepare('SELECT id, nome FROM usuario WHERE id = ? AND ativo = 1').bind(Number(corpo.usuarioId)).first();
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
