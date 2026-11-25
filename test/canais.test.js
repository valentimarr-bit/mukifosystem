// Canais de venda (iFood, 99Food): importação idempotente, baixa de estoque, aceite, cancelamento, andamento de volta e falhas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';
import { sincronizar } from '../src/canais.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = { DB: criarD1(['0001_inicial', '0002_lista_compras', '0003_usuarios', '0004_fotos', '0005_alerta_estoque', '0006_venda', '0007_cliente', '0008_combos', '0009_trava_estoque', '0010_estoque_recomendado', '0011_indices', '0012_financeiro', '0013_clientes_e_dias', '0014_indices_estoque', '0015_recuperar_senha', '0016_auditoria', '0017_tempo_preparo', '0018_pronta_entrega', '0019_entrega_parcial', '0020_carteira', '0021_item_pronto', '0022_campeonato', '0023_gateway', '0024_sinuca', '0025_nota_fiscal', '0026_fiscal', '0027_pix_monitor', '0028_canais', '0029_whatsapp', '0030_consentimento_whats', '0031_campeonato_nivel', '0032_jogador_titulo', '0033_sinuca_resultado'].map((m) => arq(`../migrations/${m}.sql`))), ADMIN_TOKEN: 'segredo-teste', ASSETS: { fetch: () => new Response('x') } };
const chamar = async (caminho, metodo = 'GET', corpo) => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '9.9.9.9', authorization: 'Bearer segredo-teste' } }), env);
  return { status: r.status, corpo: await r.json() };
};
const sql = (q, ...b) => env.DB.prepare(q).bind(...b).run();
const um = (q, ...b) => env.DB.prepare(q).bind(...b).first();

test('iFood: liga só com credencial, importa, dá baixa, aceita, não duplica, avisa o andamento e cancela', async () => {
  const antes = globalThis.fetch, log = []; let eventos = [];
  const pedidoIfood = { id: 'abc-123', displayId: '4821', customer: { name: 'Marina Costa' }, orderType: 'DELIVERY', orderTiming: 'IMMEDIATE',
    items: [{ name: 'Chopp Pilsen 300ml', quantity: 2, unitPrice: 12, externalCode: '1', observations: 'bem gelado' }, { name: 'Prato Misterioso', quantity: 1, unitPrice: 30 }], total: { orderAmount: 59, deliveryFee: 5 } };
  globalThis.fetch = async (url, init) => {
    const u = String(url), metodo = init?.method ?? 'GET'; log.push(`${metodo} ${u.replace('https://merchant-api.ifood.com.br', '')}`);
    if (u.includes('/oauth/token')) return new Response(JSON.stringify({ accessToken: 'tk', expiresIn: 3600 }));
    if (u.includes('events:polling')) return eventos.length ? new Response(JSON.stringify(eventos)) : new Response(null, { status: 204 });
    if (u.endsWith('/orders/abc-123')) return new Response(JSON.stringify(pedidoIfood));
    return new Response('{}');
  };
  try {
    await sql("INSERT INTO produto (id, nome, nome_normalizado, preco_venda) VALUES (1, 'Chopp Pilsen 300ml', 'CHOPP PILSEN 300ML', 12)");
    await sql("INSERT INTO insumo (id, nome, tipo, embalagem, unidade_ficha, conteudo) VALUES (901, 'Barril Pilsen', 'Cervejas', 'Barril 50 L', 'ml', 50000)");
    await sql('INSERT INTO ficha_tecnica (produto_id, insumo_id, quantidade) VALUES (1, 901, 300)');
    assert.equal((await chamar('/api/canais/config', 'PUT', { ifood: { ativo: true } })).status, 409);                 // sem IFOOD_CLIENT_ID/SECRET
    Object.assign(env, { IFOOD_CLIENT_ID: 'id', IFOOD_CLIENT_SECRET: 'sec' });
    assert.equal((await chamar('/api/canais/config', 'PUT', { ifood: { ativo: true, comissao: 12 } })).status, 200);

    assert.deepEqual(await sincronizar(env.DB, env), { ifood: { novos: 0, cancelados: 0, erros: [] } });               // 204: nada novo
    eventos = [{ id: 'ev1', code: 'PLC', orderId: 'abc-123' }, { id: 'ev2', code: 'KEEPALIVE', orderId: 'x' }];
    const r1 = (await sincronizar(env.DB, env)).ifood; assert.equal(r1.novos, 1); assert.deepEqual(r1.erros, []);
    const ped = await um("SELECT * FROM pedido WHERE id = 'ext-ifood-abc-123'");
    assert.equal(ped.origem, 'celular'); assert.equal(ped.status, 'recebido'); assert.equal(ped.pagamento, 'ifood'); assert.equal(ped.total, 54); assert.equal(ped.numero.startsWith('I4821'), true); assert.match(ped.nome_cliente, /iFood · Marina/);
    assert.equal((await um("SELECT COUNT(*) AS n FROM item_pedido WHERE pedido_id = 'ext-ifood-abc-123'")).n, 2);
    const ex = await um("SELECT * FROM pedido_externo WHERE id = 'ext-ifood-abc-123'"); assert.equal(ex.itens_sem_vinculo, 1); assert.equal(ex.taxa_entrega, 5); assert.ok(ex.confirmado_em);
    assert.ok(Math.abs((await um("SELECT SUM(quantidade) AS q FROM movimento_estoque WHERE referencia = 'ext-ifood-abc-123'")).q + 0.012) < 1e-9);   // 2 chopps de 300 ml = 600 ml de 50 L
    assert.ok(log.includes('POST /order/v1.0/orders/abc-123/confirm')); assert.ok(log.some((l) => l.startsWith('POST /events/v1.0/events/acknowledgment')));
    assert.equal(log.filter((l) => l.includes('oauth/token')).length, 1);                                               // token em cache

    await sincronizar(env.DB, env);                                                                                     // evento repetido: não duplica
    assert.equal((await um("SELECT COUNT(*) AS n FROM pedido WHERE origem = 'celular'")).n, 1);

    // a Produção avisa a plataforma
    assert.equal((await chamar('/api/producao/ext-ifood-abc-123/preparo', 'POST', { acao: 'preparando' })).status, 200);
    assert.equal((await chamar('/api/producao/ext-ifood-abc-123/preparo', 'POST', { acao: 'pronto' })).status, 200);
    assert.ok(log.includes('POST /order/v1.0/orders/abc-123/startPreparation')); assert.ok(log.includes('POST /order/v1.0/orders/abc-123/readyToPickup'));
    const saiu = await chamar('/api/canais/pedidos/ext-ifood-abc-123/saiu', 'POST'); assert.equal(saiu.status, 200); assert.ok(log.includes('POST /order/v1.0/orders/abc-123/dispatch'));
    assert.equal((await chamar('/api/canais/pedidos/ext-ifood-abc-123/saiu', 'POST')).status, 409);

    // plataforma fora do ar ao avisar: a Produção segue e o erro fica guardado
    eventos = []; pedidoIfood.id = 'zzz'; pedidoIfood.displayId = '4822';
    eventos = [{ id: 'ev3', code: 'PLACED', orderId: 'zzz' }];
    const orig = globalThis.fetch; globalThis.fetch = async (url, init) => (String(url).endsWith('/zzz') ? new Response(JSON.stringify(pedidoIfood)) : String(url).includes('/confirm') ? new Response('', { status: 500 }) : orig(url, init));
    const r2 = (await sincronizar(env.DB, env)).ifood; assert.equal(r2.novos, 1); assert.match(r2.erros[0], /confirm recusado/);
    assert.match((await um("SELECT erro FROM pedido_externo WHERE id = 'ext-ifood-zzz'")).erro, /confirm/);
    globalThis.fetch = orig;

    // cancelado na plataforma: pedido cancelado e estoque devolvido
    eventos = [{ id: 'ev4', code: 'CAN', orderId: 'zzz' }];
    const r3 = (await sincronizar(env.DB, env)).ifood; assert.equal(r3.cancelados, 1);
    assert.equal((await um("SELECT status FROM pedido WHERE id = 'ext-ifood-zzz'")).status, 'cancelado');
    assert.equal((await um("SELECT COUNT(*) AS n FROM movimento_estoque WHERE referencia = 'ext-ifood-zzz'")).n, 2);          // baixa + estorno
    const soma = await um("SELECT COALESCE(SUM(quantidade), 0) AS q FROM movimento_estoque WHERE referencia = 'ext-ifood-zzz'"); assert.equal(Math.abs(soma.q) < 1e-9, true);

    const painel = (await chamar('/api/canais')).corpo; assert.equal(painel.canais.find((c) => c.id === 'ifood').comissao, 12); assert.ok(painel.pedidos.length >= 2);
  } finally { globalThis.fetch = antes; delete env.IFOOD_CLIENT_ID; delete env.IFOOD_CLIENT_SECRET; }
});

test('99Food (Open Delivery): precisa da URL base e das credenciais; importa pedido no padrão', async () => {
  const antes = globalThis.fetch, log = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url); log.push(`${init?.method ?? 'GET'} ${u}`);
    if (u.endsWith('/oauth/token')) return new Response(JSON.stringify({ access_token: 'tk99', expires_in: 3600 }));
    if (u.endsWith('/v1/events:polling')) return new Response(JSON.stringify([{ eventId: 'e1', eventType: 'CREATED', orderId: 'o99' }]));
    if (u.endsWith('/v1/orders/o99')) return new Response(JSON.stringify({ id: 'o99', displayId: '77', type: 'TAKEOUT', customer: { name: 'João' }, items: [{ name: 'Porção de Fritas', quantity: 1, unitPrice: { value: 28 } }], total: { orderAmount: { value: 28 } } }));
    return new Response('{}');
  };
  try {
    Object.assign(env, { OD_99FOOD_CLIENT_ID: 'i', OD_99FOOD_CLIENT_SECRET: 's' });
    assert.equal((await chamar('/api/canais/config', 'PUT', { '99food': { ativo: true } })).status, 409);               // falta a URL base
    env.OD_99FOOD_BASE_URL = 'https://od.99.test/';
    assert.equal((await chamar('/api/canais/config', 'PUT', { '99food': { ativo: true } })).status, 200);
    const r = (await sincronizar(env.DB, env))['99food']; assert.equal(r.novos, 1, JSON.stringify(r));
    const ped = await um("SELECT * FROM pedido WHERE id = 'ext-99food-o99'"); assert.equal(ped.total, 28); assert.equal(ped.pagamento, '99food'); assert.ok(ped.numero.startsWith('N77'));
    assert.equal((await um("SELECT tipo FROM pedido_externo WHERE id = 'ext-99food-o99'")).tipo, 'retirada');
    assert.ok(log.includes('POST https://od.99.test/v1/orders/o99/confirm'));
    await chamar('/api/canais/pedidos/ext-99food-o99/saiu', 'POST');
    assert.ok(!log.some((l) => l.includes('/dispatch')));                                                               // retirada não despacha
  } finally { globalThis.fetch = antes; for (const k of ['OD_99FOOD_CLIENT_ID', 'OD_99FOOD_CLIENT_SECRET', 'OD_99FOOD_BASE_URL']) delete env[k]; }
});
