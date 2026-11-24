// Fotos de produtos e insumos. Leitura pública (não tem nada sigiloso); envio e remoção exigem login.
import { json } from './api.js';
import { usuarioLogado } from './auth.js';

const erro = (msg, status = 400) => json({ erro: msg }, status);
const TIPOS = { produtos: 'produto', insumos: 'insumo' };
const MIMES = ['image/jpeg', 'image/webp', 'image/png'];
const MAX_BYTES = 350_000; // o navegador reduz para ~640 px; isto é só um teto de segurança

function paraBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const deBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const versao = (s) => Date.parse(String(s).replace(' ', 'T') + 'Z') || 0;

export async function rotearFotos(request, env, url) {
  const db = env.DB;
  const m = request.method;
  const p = url.pathname;

  // Quem já tem foto (e a versão, para o navegador trocar a imagem em cache quando mudar).
  if (m === 'GET' && p === '/api/fotos') {
    const { results } = await db.prepare('SELECT tipo, ref_id, atualizada_em FROM foto').all();
    const saida = { produtos: {}, insumos: {} };
    for (const r of results) saida[r.tipo === 'produto' ? 'produtos' : 'insumos'][r.ref_id] = versao(r.atualizada_em);
    return json(saida);
  }

  const k = p.match(/^\/api\/fotos\/(produtos|insumos)\/(\d+)$/);
  if (!k) return null;
  const tipo = TIPOS[k[1]], id = Number(k[2]);

  if (m === 'GET') {
    const f = await db.prepare('SELECT mime, dados_b64, atualizada_em FROM foto WHERE tipo = ? AND ref_id = ?').bind(tipo, id).first();
    if (!f) return erro('Sem foto', 404);
    return new Response(deBase64(f.dados_b64), { headers: {
      'content-type': f.mime, 'cache-control': 'public, max-age=31536000, immutable', // a URL leva ?v=versão, então pode guardar para sempre
    } });
  }

  const eu = await usuarioLogado(request, env);
  if (!eu) return erro('Entre com seu nome e senha', 401);

  if (m === 'PUT') {
    const mime = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!MIMES.includes(mime)) return erro('Envie uma foto JPG, PNG ou WebP.');
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length) return erro('Foto vazia.');
    if (bytes.length > MAX_BYTES) return erro('Foto grande demais. Tente de novo (o sistema reduz sozinho).', 413);
    const existe = await db.prepare(`SELECT 1 AS ok FROM ${tipo === 'produto' ? 'produto' : 'insumo'} WHERE id = ?`).bind(id).first();
    if (!existe) return erro('Item não encontrado.', 404);
    await db.prepare(
      `INSERT INTO foto (tipo, ref_id, mime, dados_b64, bytes, usuario) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (tipo, ref_id) DO UPDATE SET mime = excluded.mime, dados_b64 = excluded.dados_b64,
         bytes = excluded.bytes, usuario = excluded.usuario, atualizada_em = datetime('now')`)
      .bind(tipo, id, mime, paraBase64(bytes), bytes.length, eu.nome).run();
    const r = await db.prepare('SELECT atualizada_em FROM foto WHERE tipo = ? AND ref_id = ?').bind(tipo, id).first();
    return json({ ok: true, versao: versao(r.atualizada_em) });
  }

  if (m === 'DELETE') {
    await db.prepare('DELETE FROM foto WHERE tipo = ? AND ref_id = ?').bind(tipo, id).run();
    return json({ ok: true });
  }
  return null;
}
