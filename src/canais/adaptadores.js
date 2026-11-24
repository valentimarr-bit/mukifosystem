// Adaptadores dos canais de venda. Mesmo contrato para todos:
//   configurado(env) · eventos(env) → [{ id, codigo, ref }] · reconhecer(env, ids) · pedido(env, ref) → pedido normalizado
//   confirmar · iniciarPreparo · pronto · despachar (env, ref)
// Eventos normalizados: codigo 'novo' (pedido entrou), 'cancelado', ou 'outro' (só reconhece).
// Pedido normalizado: { ref, numero, cliente, tipo: 'delivery'|'retirada', agendado, itens: [{ codigo, nome, quantidade, preco, obs }], subtotal, taxa_entrega, total }
// Segredos só no Cloudflare. Os campos foram montados pela documentação pública e precisam ser validados com credenciais reais.

const num = (v) => { if (v && typeof v === 'object') v = v.value ?? v.amount; const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (x) => Math.round(x * 100) / 100;

function normalizarPedido(j, ref) {
  const itens = (j.items ?? []).map((i) => ({ codigo: i.externalCode ?? i.code ?? i.id ?? null, nome: String(i.name ?? i.description ?? 'Item').slice(0, 120), quantidade: num(i.quantity) || 1,
    preco: num(i.unitPrice) || (num(i.quantity) ? num(i.totalPrice) / num(i.quantity) : num(i.totalPrice)), obs: i.observations ?? i.notes ?? null }));
  const subtotal = r2(itens.reduce((s, i) => s + i.quantidade * i.preco, 0));
  const t = j.total ?? {}, entrega = num(t.deliveryFee), total = num(t.orderAmount) || r2(subtotal + entrega);
  const tipo = String(j.orderType ?? j.type ?? '').toUpperCase().startsWith('TAKE') || /PICKUP|INDOOR/i.test(String(j.orderType ?? j.type ?? '')) ? 'retirada' : 'delivery';
  return { ref, numero: String(j.displayId ?? j.shortId ?? ref).slice(-8), cliente: String(j.customer?.name ?? 'Cliente').slice(0, 60), tipo, agendado: /SCHEDULED/i.test(String(j.orderTiming ?? j.timing ?? '')), itens, subtotal, taxa_entrega: entrega, total };
}

/** Cria um adaptador OAuth2 (client_credentials) com cache do token. */
function porHttp({ id, nome, base, tokenUrl, idKey, segredoKey, form, caminhos, eventos, mapaEvento, corpoReconhecer }) {
  let cache = { token: null, exp: 0 };
  const cfg = (env) => ({ base: base(env), tokenUrl: tokenUrl(env), cid: env[idKey], sec: env[segredoKey] });
  async function token(env) {
    if (cache.token && Date.now() < cache.exp) return cache.token;
    const c = cfg(env);
    const corpo = form ? new URLSearchParams({ grantType: 'client_credentials', clientId: c.cid, clientSecret: c.sec }) : JSON.stringify({ grant_type: 'client_credentials', client_id: c.cid, client_secret: c.sec });
    const r = await fetch(c.tokenUrl, { method: 'POST', headers: { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json' }, body: corpo.toString() });
    if (!r.ok) throw new Error(`${nome}: login recusado (${r.status})`);
    const j = await r.json(); cache = { token: j.accessToken ?? j.access_token, exp: Date.now() + Math.max(60, (j.expiresIn ?? j.expires_in ?? 3600) - 120) * 1000 };
    return cache.token;
  }
  async function chamar(env, metodo, caminho, corpo) {
    const r = await fetch(cfg(env).base + caminho, { method: metodo, headers: { authorization: 'Bearer ' + await token(env), 'content-type': 'application/json', ...(eventos.cabecalho?.(env) ?? {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
    if (r.status === 401) cache = { token: null, exp: 0 };
    return r;
  }
  return {
    id, nome,
    configurado: (env) => !!(env[idKey] && env[segredoKey] && (id !== '99food' || env.OD_99FOOD_BASE_URL)),
    async eventos(env) {
      const r = await chamar(env, 'GET', caminhos.eventos); if (r.status === 204) return [];
      if (!r.ok) throw new Error(`${nome}: consulta de eventos falhou (${r.status})`);
      const l = await r.json(); return (Array.isArray(l) ? l : []).map((e) => ({ id: e.id ?? e.eventId, codigo: mapaEvento(e.code ?? e.eventType ?? e.fullCode), ref: e.orderId ?? e.order?.id }));
    },
    async reconhecer(env, ids) { if (ids.length) await chamar(env, 'POST', caminhos.reconhecer, corpoReconhecer(ids)); },
    async pedido(env, ref) { const r = await chamar(env, 'GET', caminhos.pedido(ref)); if (!r.ok) throw new Error(`${nome}: pedido ${ref} não veio (${r.status})`); return normalizarPedido(await r.json(), ref); },
    async acao(env, ref, qual, corpo) { const r = await chamar(env, 'POST', caminhos.acao(ref, qual), corpo); if (!r.ok && r.status !== 409) throw new Error(`${nome}: ${qual} recusado (${r.status})`); },
    confirmar(env, ref) { return this.acao(env, ref, 'confirm'); },
    iniciarPreparo(env, ref) { return this.acao(env, ref, 'startPreparation'); },
    pronto(env, ref) { return this.acao(env, ref, id === 'ifood' ? 'readyToPickup' : 'readyForPickup'); },
    despachar(env, ref) { return this.acao(env, ref, 'dispatch'); },
  };
}

const ifood = porHttp({
  id: 'ifood', nome: 'iFood', base: () => 'https://merchant-api.ifood.com.br', tokenUrl: () => 'https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token',
  idKey: 'IFOOD_CLIENT_ID', segredoKey: 'IFOOD_CLIENT_SECRET', form: true,
  caminhos: { eventos: '/events/v1.0/events:polling', reconhecer: '/events/v1.0/events/acknowledgment', pedido: (r) => `/order/v1.0/orders/${encodeURIComponent(r)}`, acao: (r, q) => `/order/v1.0/orders/${encodeURIComponent(r)}/${q}` },
  eventos: { cabecalho: (env) => (env.IFOOD_MERCHANT_ID ? { 'x-polling-merchants': env.IFOOD_MERCHANT_ID } : {}) },
  mapaEvento: (c) => (c === 'PLC' || c === 'PLACED' ? 'novo' : c === 'CAN' || c === 'CANCELLED' ? 'cancelado' : 'outro'),
  corpoReconhecer: (ids) => ids.map((id) => ({ id })),
});

// 99Food (e Keeta) falam o padrão Open Delivery da Abrasel. Exige credenciais de software parceiro da 99.
const noventaenove = porHttp({
  id: '99food', nome: '99Food', base: (env) => String(env.OD_99FOOD_BASE_URL ?? '').replace(/\/$/, ''), tokenUrl: (env) => env.OD_99FOOD_TOKEN_URL || String(env.OD_99FOOD_BASE_URL ?? '').replace(/\/$/, '') + '/oauth/token',
  idKey: 'OD_99FOOD_CLIENT_ID', segredoKey: 'OD_99FOOD_CLIENT_SECRET', form: false,
  caminhos: { eventos: '/v1/events:polling', reconhecer: '/v1/events/acknowledgment', pedido: (r) => `/v1/orders/${encodeURIComponent(r)}`, acao: (r, q) => `/v1/orders/${encodeURIComponent(r)}/${q}` },
  eventos: {},
  mapaEvento: (c) => (/^(CREATED|PLACED|PLC)$/i.test(c) ? 'novo' : /^(CANCELLED|CANCELED|CAN)$/i.test(c) ? 'cancelado' : 'outro'),
  corpoReconhecer: (ids) => ids.map((id) => ({ id })),
});

export const CANAIS = { ifood, '99food': noventaenove };
export { normalizarPedido };
