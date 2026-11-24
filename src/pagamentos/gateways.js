// Gateways de Pix plugáveis. Cada um é um objeto com a mesma forma; para integrar outro, crie um arquivo/objeto assim e registre em GATEWAYS:
//   id, nome, segredos[]            — nomes dos segredos da Cloudflare que ele usa (nunca valores)
//   configurado(env)                — tem os segredos?
//   criarPix(env, { ref, valor, descricao, expiraMin, urlAviso }) → { externo, copiaECola }
//   identificarAviso(env, request, bruto) → { externo?, ref? } | { erro, status }   (só lê o aviso; NÃO acredita no que ele diz)
//   consultar(env, { externo, ref }) → { ref, valor, pago }                          (pergunta ao gateway; é a fonte da verdade)
// O aviso chega pelo webhook, mas só confirma pagamento o que o gateway confirmar na consulta.
const json = (r) => r.json().catch(() => ({}));
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const iguais = (a, b) => a.length === b.length && a.split('').reduce((s, c, i) => s | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

async function hmacHex(segredo, texto) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texto)));
}
const dentroDe = (min) => { const t = new Date(Date.now() + min * 60000 - 3 * 3600000); return t.toISOString().slice(0, 23) + '-03:00'; };   // horário de Brasília

// ---------- Mercado Pago (API de Pagamentos) ----------
const mercadopago = {
  id: 'mercadopago', nome: 'Mercado Pago', segredos: ['MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET (opcional, recomendado)'],
  configurado: (env) => !!env.MP_ACCESS_TOKEN,
  async criarPix(env, { ref, valor, descricao, expiraMin, urlAviso }) {
    const r = await fetch('https://api.mercadopago.com/v1/payments', { method: 'POST',
      headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'content-type': 'application/json', 'X-Idempotency-Key': ref },
      body: JSON.stringify({ transaction_amount: valor, description: String(descricao).slice(0, 200), payment_method_id: 'pix', external_reference: ref,
        notification_url: urlAviso, date_of_expiration: dentroDe(expiraMin), payer: { email: 'cliente@mukifo.app' } }) });
    const j = await json(r), cod = j?.point_of_interaction?.transaction_data?.qr_code;
    if (!r.ok || !cod) throw new Error(`Mercado Pago recusou (${r.status}).`);
    return { externo: String(j.id), copiaECola: cod };
  },
  async identificarAviso(env, request, bruto) {
    let b = {}; try { b = JSON.parse(bruto || '{}'); } catch { /* aviso por query string */ }
    const q = new URL(request.url).searchParams, id = String(b?.data?.id ?? q.get('data.id') ?? q.get('id') ?? '');
    const tipo = b?.type ?? q.get('type') ?? q.get('topic');
    if (tipo && tipo !== 'payment') return { ignorar: true };
    if (!/^\d{1,20}$/.test(id)) return { erro: 'Aviso sem id de pagamento.', status: 400 };
    if (env.MP_WEBHOOK_SECRET) {   // assinatura oficial: "ts=…,v1=…" sobre "id:…;request-id:…;ts:…;"
      const sig = Object.fromEntries((request.headers.get('x-signature') ?? '').split(',').map((p) => p.trim().split('=')));
      const esperado = await hmacHex(env.MP_WEBHOOK_SECRET, `id:${id};request-id:${request.headers.get('x-request-id') ?? ''};ts:${sig.ts ?? ''};`);
      if (!sig.v1 || !iguais(esperado, String(sig.v1).toLowerCase())) return { erro: 'Assinatura inválida.', status: 401 };
    }
    return { externo: id };
  },
  async consultar(env, { externo }) {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(externo)}`, { headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}` } });
    const j = await json(r); if (!r.ok) throw new Error(`Mercado Pago: consulta falhou (${r.status}).`);
    return { ref: String(j.external_reference ?? ''), valor: Number(j.transaction_amount), pago: j.status === 'approved' };
  },
};

// ---------- Woovi / OpenPix ----------
const woovi = {
  id: 'woovi', nome: 'Woovi (OpenPix)', segredos: ['WOOVI_APP_ID'],
  configurado: (env) => !!env.WOOVI_APP_ID,
  async criarPix(env, { ref, valor, descricao, expiraMin }) {
    const r = await fetch('https://api.openpix.com.br/api/v1/charge', { method: 'POST', headers: { authorization: env.WOOVI_APP_ID, 'content-type': 'application/json' },
      body: JSON.stringify({ correlationID: ref, value: Math.round(valor * 100), comment: String(descricao).slice(0, 140), expiresIn: expiraMin * 60 }) });
    const j = await json(r), cod = j?.charge?.brCode ?? j?.brCode;
    if (!r.ok || !cod) throw new Error(`Woovi recusou (${r.status}).`);
    return { externo: ref, copiaECola: cod };
  },
  async identificarAviso(env, request, bruto) {
    let b = {}; try { b = JSON.parse(bruto || '{}'); } catch { return { erro: 'Corpo inválido.', status: 400 }; }
    const ref = String(b?.charge?.correlationID ?? b?.pix?.charge?.correlationID ?? '');
    if (!ref) return { ignorar: true };
    return { ref, externo: ref };
  },
  async consultar(env, { ref, externo }) {
    const id = externo || ref, r = await fetch(`https://api.openpix.com.br/api/v1/charge/${encodeURIComponent(id)}`, { headers: { authorization: env.WOOVI_APP_ID } });
    const j = await json(r); if (!r.ok) throw new Error(`Woovi: consulta falhou (${r.status}).`);
    const c = j.charge ?? j; return { ref: String(c.correlationID ?? id), valor: Number(c.value) / 100, pago: c.status === 'COMPLETED' };
  },
};

export const GATEWAYS = { mercadopago, woovi };
export const MANUAL = { id: 'manual', nome: 'Pix da chave do bar (confirmação manual)', segredos: [], configurado: () => true };

export async function gatewayAtivo(db, env) {
  const c = await db.prepare("SELECT valor FROM configuracao WHERE chave = 'gateway_pix'").first();
  const g = GATEWAYS[c?.valor];
  return g && g.configurado(env) ? g : MANUAL;
}

/** Cria o Pix no gateway ativo e guarda. Se não houver gateway (ou ele falhar), devolve null e o fluxo segue com o Pix estático + confirmação manual. */
export async function cobrarPix(db, env, request, { ref, valor, descricao, expiraMin = 30 }) {
  const g = await gatewayAtivo(db, env);
  if (g === MANUAL) return null;
  try {
    const ja = await pixDaRef(db, ref); if (ja) return ja;
    const origem = env.URL_PUBLICA || new URL(request.url).origin;
    const { externo, copiaECola } = await g.criarPix(env, { ref, valor, descricao, expiraMin, urlAviso: `${origem}/api/pagamentos/aviso/${g.id}` });
    await db.prepare('INSERT OR IGNORE INTO pix_externo (ref, gateway, externo, copia_cola, valor) VALUES (?, ?, ?, ?, ?)').bind(ref, g.id, externo, copiaECola, valor).run();
    return copiaECola;
  } catch (e) { console.error('gateway Pix:', e.message); return null; }
}

/** Código copia e cola criado no gateway para essa referência (ou null → usar o Pix estático). */
export async function pixDaRef(db, ref) {
  const r = await db.prepare('SELECT copia_cola FROM pix_externo WHERE ref = ?').bind(ref).first();
  return r?.copia_cola ?? null;
}
