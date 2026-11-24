// Aviso no celular (Web Push, padrão aberto): funciona no Android e no iPhone com o app instalado na tela inicial.
// Precisa de duas chaves VAPID (secrets VAPID_PUBLICA e VAPID_PRIVADA); rode `node scripts/gerar_vapid.mjs`.
const enc = new TextEncoder();
export const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const deb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(s).length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const junta = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };

async function hkdf(salt, ikm, info, bytes) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}

/** Cifra a mensagem para o aparelho (RFC 8291, aes128gcm). */
export async function cifrar(payload, p256dhB64, authB64) {
  const ua = deb64u(p256dhB64), auth = deb64u(authB64), salt = crypto.getRandomValues(new Uint8Array(16));
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const as = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const segredo = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, par.privateKey, 256));
  const ikm = await hkdf(auth, segredo, junta(enc.encode('WebPush: info\0'), ua, as), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const chave = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, chave, junta(enc.encode(payload), new Uint8Array([2]))));
  return junta(salt, new Uint8Array([0, 0, 0x10, 0]), new Uint8Array([as.length]), as, cifrado);
}

async function jwtVapid(endpoint, env) {
  const pub = deb64u(env.VAPID_PUBLICA);
  const chave = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: env.VAPID_PRIVADA }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const corpo = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))) + '.' + b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_CONTATO || 'mailto:contato@mukifo.com.br' })));
  return corpo + '.' + b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, chave, enc.encode(corpo)));
}

export const pushLigado = (env) => !!(env.VAPID_PUBLICA && env.VAPID_PRIVADA);

/** Manda o aviso para todos os aparelhos que ativaram aquele pedido. Nunca derruba quem chamou. */
export async function avisarPedido(env, pedidoId, mensagem, enviar = fetch) {
  if (!pushLigado(env)) return { enviados: 0, motivo: 'push não configurado' };
  const { results } = await env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM push_assinatura WHERE pedido_id = ?').bind(pedidoId).all();
  let enviados = 0;
  await Promise.allSettled(results.map(async (s) => {
    try {
      const r = await enviar(s.endpoint, { method: 'POST', body: await cifrar(JSON.stringify(mensagem), s.p256dh, s.auth),
        headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '1800', Urgency: 'high', Authorization: `vapid t=${await jwtVapid(s.endpoint, env)}, k=${env.VAPID_PUBLICA}` } });
      if (r.status === 404 || r.status === 410) await env.DB.prepare('DELETE FROM push_assinatura WHERE id = ?').bind(s.id).run(); else if (r.ok) enviados++;
    } catch { /* aparelho fora do ar: o app também confere sozinho a cada poucos segundos */ }
  }));
  return { enviados };
}
