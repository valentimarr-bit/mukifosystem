// Gateways de Pix plugáveis: criação do Pix, aviso (webhook) que só vale se o gateway confirmar na consulta, comparativo e simulador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto as wc } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';
import { simular, COMPARATIVO } from '../src/dominio/comparativo.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = { DB: criarD1(['0001_inicial', '0002_lista_compras', '0003_usuarios', '0004_fotos', '0005_alerta_estoque', '0006_venda', '0007_cliente', '0008_combos', '0009_trava_estoque', '0010_estoque_recomendado', '0011_indices', '0012_financeiro', '0013_clientes_e_dias', '0014_indices_estoque', '0015_recuperar_senha', '0016_auditoria', '0017_tempo_preparo', '0018_pronta_entrega', '0019_entrega_parcial', '0020_carteira', '0021_item_pronto', '0022_campeonato', '0023_gateway', '0024_sinuca', '0025_nota_fiscal'].map((m) => arq(`../migrations/${m}.sql`)).concat(arq('../seed/seed.sql'))), ADMIN_TOKEN: 'segredo-teste', ASSETS: { fetch: () => new Response('x') } };
const chamar = async (caminho, metodo = 'GET', corpo, cab = {}, token = 'segredo-teste', bruto) => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, { method: metodo, body: bruto ?? (corpo ? JSON.stringify(corpo) : undefined),
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '9.9.9.9', ...(token ? { authorization: `Bearer ${token}` } : {}), ...cab } }), env);
  return { status: r.status, corpo: await r.json() };
};
const original = globalThis.fetch;
const simulado = (tabela) => { globalThis.fetch = async (url, op) => { simulado.chamadas.push({ url: String(url), op }); const r = tabela(String(url), op); return new Response(JSON.stringify(r.corpo ?? {}), { status: r.status ?? 200 }); }; simulado.chamadas = []; };
const saldoDe = async (id) => (await env.DB.prepare('SELECT saldo FROM cliente WHERE id = ?').bind(id).first()).saldo;
const hmac = async (seg, t) => { const k = await wc.subtle.importKey('raw', new TextEncoder().encode(seg), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return [...new Uint8Array(await wc.subtle.sign('HMAC', k, new TextEncoder().encode(t)))].map((x) => x.toString(16).padStart(2, '0')).join(''); };

test('comparativo: simulador usa fixo e percentual, ordena e marca cartão sem taxa', () => {
  const r = simular({ ticket: 40, pix_qtd: 100 });
  const por = Object.fromEntries(r.map((x) => [x.id, x]));
  assert.equal(por.mercadopago.pix, 39.6);            // 100 × 40 × 0,99%
  assert.equal(por.abacatepay.pix, 80);                // 100 × R$ 0,80
  assert.equal(por.asaas.pix, 199);
  assert.equal(por.getnet.total, 28);                  // Pix grátis, só a mensalidade do pacote
  assert.equal(por.manual.total, 0); assert.equal(r[0].id, 'manual');
  assert.ok(r.every((x, i) => i === 0 || r[i - 1].total <= x.total));
  const c = simular({ ticket: 40, pix_qtd: 0, credito_qtd: 10 });
  assert.equal(c.find((x) => x.id === 'woovi').credito, null); assert.equal(c.find((x) => x.id === 'woovi').completo, false);
  assert.equal(simular({ ticket: -5, pix_qtd: 'x' }).every((x) => x.pix === 0), true);   // lixo vira zero
  assert.ok(COMPARATIVO.every((g) => g.id && g.nome && g.nota));
});

test('escolher gateway: precisa do segredo; só o superadmin troca; o resto do sistema segue igual', async () => {
  const g = await chamar('/api/pagamentos/gateway'); assert.equal(g.corpo.ativo, 'manual');
  assert.deepEqual(g.corpo.gateways.map((x) => x.id), ['manual', 'mercadopago', 'woovi']);
  assert.equal(g.corpo.gateways.find((x) => x.id === 'mercadopago').configurado, false);
  assert.equal((await chamar('/api/pagamentos/gateway', 'PUT', { gateway: 'mercadopago' })).status, 409);   // sem MP_ACCESS_TOKEN
  assert.equal((await chamar('/api/pagamentos/gateway', 'PUT', { gateway: 'inventado' })).status, 400);
  assert.equal((await chamar('/api/pagamentos/gateway', 'GET', null, {}, null)).status, 401);
  assert.equal((await chamar('/api/pagamentos/aviso/mercadopago', 'POST', {}, {}, null)).status, 503);        // webhook de gateway desligado
  assert.equal((await chamar('/api/pagamentos/aviso/naoexiste', 'POST', {}, {}, null)).status, 404);
  const c = await chamar('/api/pagamentos/comparativo?ticket=50&pix_qtd=200'); assert.equal(c.status, 200); assert.ok(c.corpo.simulacao.length >= 6);
});

test('Mercado Pago: Pix criado no gateway, aviso só credita o que a consulta confirma, uma vez, com o valor certo', async () => {
  await chamar('/api/venda/pix', 'PUT', { chave: 'bar@mukifo.com' });
  env.MP_ACCESS_TOKEN = 'TEST-token'; env.MP_WEBHOOK_SECRET = 'segredo-mp';
  assert.equal((await chamar('/api/pagamentos/gateway', 'PUT', { gateway: 'mercadopago' })).corpo.ativo, 'mercadopago');
  const cad = await chamar('/api/conta/cadastro', 'POST', { nome: 'Ana Gateway', celular: '(51) 99999-7001', senha: 'segredo1', aceite: true }, {}, null);
  const sessao = { 'X-Sessao-Cliente': cad.corpo.token }, cid = cad.corpo.cliente.id;
  let pagamento = { status: 'pending', transaction_amount: 30, external_reference: '' };
  simulado((url, op) => url.endsWith('/v1/payments') ? { corpo: { id: 998877, point_of_interaction: { transaction_data: { qr_code: '00020126MERCADOPAGO-COPIA-E-COLA' } } } } : { corpo: pagamento });
  try {
    const rec = await chamar('/api/conta/carteira/recarga', 'POST', { valor: 30 }, sessao, null);
    assert.equal(rec.status, 201); assert.equal(rec.corpo.pendente.pix, '00020126MERCADOPAGO-COPIA-E-COLA');    // Pix do gateway, não o estático
    const ref = rec.corpo.pendente.id, criar = simulado.chamadas.find((x) => x.url.endsWith('/v1/payments'));
    assert.equal(JSON.parse(criar.op.body).external_reference, ref); assert.equal(JSON.parse(criar.op.body).transaction_amount, 30);
    assert.match(criar.op.headers.authorization, /^Bearer TEST-token$/); assert.equal(criar.op.headers['X-Idempotency-Key'], ref);
    assert.equal(JSON.parse(criar.op.body).notification_url, 'https://mukifo.test/api/pagamentos/aviso/mercadopago');
    pagamento = { status: 'pending', transaction_amount: 30, external_reference: ref };

    const aviso = async (corpo, opcoes = {}) => {
      const ts = '1700000000', id = String(corpo?.data?.id ?? ''), assinatura = opcoes.assinatura ?? `ts=${ts},v1=${await hmac('segredo-mp', `id:${id};request-id:req-1;ts:${ts};`)}`;
      return chamar('/api/pagamentos/aviso/mercadopago', 'POST', corpo, { 'x-signature': assinatura, 'x-request-id': 'req-1' }, null);
    };
    assert.equal((await aviso({ type: 'payment', data: { id: '998877' } }, { assinatura: 'ts=1,v1=00' })).status, 401);   // assinatura falsa
    assert.equal((await aviso({ type: 'payment', data: { id: '998877' } })).corpo.pendente, true);                            // gateway diz "pending": nada credita
    assert.equal(await saldoDe(cid), 0);
    pagamento = { status: 'approved', transaction_amount: 29, external_reference: ref };
    assert.equal((await aviso({ type: 'payment', data: { id: '998877' } })).status, 409);                                      // valor diferente do cobrado
    assert.equal(await saldoDe(cid), 0);
    pagamento = { status: 'approved', transaction_amount: 30, external_reference: ref };
    assert.equal((await aviso({ type: 'payment', data: { id: '998877' } })).status, 200); assert.equal(await saldoDe(cid), 30);
    assert.equal((await aviso({ type: 'payment', data: { id: '998877' } })).status, 200); assert.equal(await saldoDe(cid), 30);   // aviso repetido não credita de novo
    assert.equal((await aviso({ type: 'merchant_order', data: { id: '1' } })).corpo.ignorado !== undefined, true);              // outros eventos são ignorados
    pagamento = { status: 'approved', transaction_amount: 30, external_reference: 'rec-desconhecida' };
    assert.equal((await aviso({ type: 'payment', data: { id: '5' } })).corpo.ignorado, 'referência desconhecida');            // gateway aprova algo que não é nosso: ignora

    // inscrição no campeonato paga pelo mesmo caminho
    const camp = (await chamar('/api/campeonato/gestao/campeonatos', 'POST', { nome: 'Copa Gateway' })).corpo.id;
    const mod = (await chamar(`/api/campeonato/gestao/campeonatos/${camp}/modalidades`, 'POST', { nome: 'Bola 8', taxa: 40 })).corpo.id;
    const ins = (await chamar(`/api/campeonato/modalidades/${mod}/inscrever`, 'POST', {}, sessao, null)).corpo;
    assert.equal(ins.status, 'pendente'); assert.equal(ins.pix, '00020126MERCADOPAGO-COPIA-E-COLA');
    pagamento = { status: 'approved', transaction_amount: 40, external_reference: ins.id };
    await aviso({ type: 'payment', data: { id: '998878' } });
    assert.equal((await chamar(`/api/campeonato/inscricoes/${ins.id}`, 'GET', null, sessao, null)).corpo.status, 'paga');
    assert.equal((await env.DB.prepare('SELECT operador FROM inscricao WHERE id = ?').bind(ins.id).first()).operador, 'mercadopago');

    // pedido do app: a cobrança vira paga e o pedido entra na produção
    await chamar('/api/venda/trava', 'PUT', { ativa: false });
    const cardapio = (await chamar('/api/venda/cardapio', 'GET', null, {}, null)).corpo.categorias.flatMap((c) => c.produtos)[0];
    assert.ok(cardapio, 'cardápio com produto');
    {
      const ped = await chamar('/api/cliente/pedidos', 'POST', { nome: 'Ana', celular: '51999997001', itens: [{ produto_id: cardapio.id, quantidade: 1 }] }, sessao, null);
      assert.equal(ped.status, 201, JSON.stringify(ped.corpo));
      {
        assert.equal(ped.corpo.pix, '00020126MERCADOPAGO-COPIA-E-COLA');
        const cob = await env.DB.prepare("SELECT id FROM cobranca WHERE pedido_id = ?").bind(ped.corpo.id).first();
        pagamento = { status: 'approved', transaction_amount: ped.corpo.total, external_reference: cob.id };
        await aviso({ type: 'payment', data: { id: '998879' } });
        assert.equal((await env.DB.prepare('SELECT status FROM pedido WHERE id = ?').bind(ped.corpo.id).first()).status, 'recebido');
      }
    }

    // gateway fora do ar: o cliente ainda recebe o Pix estático e a equipe confirma à mão
    simulado(() => ({ status: 500, corpo: {} }));
    const cai = await chamar('/api/conta/carteira/recarga', 'POST', { valor: 20 }, sessao, null);
    assert.equal(cai.status, 201); assert.ok(cai.corpo.pendente.pix.includes('bar@mukifo.com'));
  } finally { globalThis.fetch = original; delete env.MP_ACCESS_TOKEN; delete env.MP_WEBHOOK_SECRET; }
});

test('Woovi: cria a cobrança em centavos e só confirma pela consulta', async () => {
  env.WOOVI_APP_ID = 'app-id-teste';
  assert.equal((await chamar('/api/pagamentos/gateway', 'PUT', { gateway: 'woovi' })).corpo.ativo, 'woovi');
  const cad = await chamar('/api/conta/cadastro', 'POST', { nome: 'Beto Woovi', celular: '(51) 99999-7002', senha: 'segredo1', aceite: true }, {}, null);
  const sessao = { 'X-Sessao-Cliente': cad.corpo.token }, cid = cad.corpo.cliente.id;
  let status = 'ACTIVE', valorCentavos = 2550;
  simulado((url, op) => op?.method === 'POST' ? { corpo: { charge: { brCode: 'WOOVI-BRCODE-123' } } } : { corpo: { charge: { correlationID: decodeURIComponent(url.split('/charge/')[1]), value: valorCentavos, status } } });
  try {
    const rec = await chamar('/api/conta/carteira/recarga', 'POST', { valor: 25.5 }, sessao, null);
    assert.equal(rec.corpo.pendente.pix, 'WOOVI-BRCODE-123');
    const post = simulado.chamadas.find((x) => x.op?.method === 'POST'); assert.equal(JSON.parse(post.op.body).value, 2550); assert.equal(post.op.headers.authorization, 'app-id-teste');
    const ref = rec.corpo.pendente.id, aviso = () => chamar('/api/pagamentos/aviso/woovi', 'POST', { event: 'OPENPIX:CHARGE_COMPLETED', charge: { correlationID: ref } }, {}, null);
    await aviso(); assert.equal(await saldoDe(cid), 0);                                         // aviso falso/antecipado: a consulta diz que não foi pago
    status = 'COMPLETED'; assert.equal((await aviso()).status, 200); assert.equal(await saldoDe(cid), 25.5);
    await aviso(); assert.equal(await saldoDe(cid), 25.5);
  } finally { globalThis.fetch = original; delete env.WOOVI_APP_ID; }
  await chamar('/api/pagamentos/gateway', 'PUT', { gateway: 'manual' });
});
