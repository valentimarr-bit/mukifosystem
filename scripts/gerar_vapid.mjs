// Gera o par de chaves do aviso no celular. Rode uma vez e guarde as duas na Cloudflare como secrets.
import { webcrypto as c } from 'node:crypto';
const b64u = (b) => Buffer.from(b).toString('base64url');
const par = await c.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const pub = b64u(await c.subtle.exportKey('raw', par.publicKey)), jwk = await c.subtle.exportKey('jwk', par.privateKey);
console.log('Guarde estes dois valores como secrets do Worker:\n');
console.log(`npx wrangler secret put VAPID_PUBLICA   # cole: ${pub}`);
console.log(`npx wrangler secret put VAPID_PRIVADA   # cole: ${jwk.d}`);
console.log('\n(opcional) npx wrangler secret put VAPID_CONTATO   # ex.: mailto:voce@email.com');
