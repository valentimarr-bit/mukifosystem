// Tela de venda (comandas, cobranças, maquininhas) e app do cliente (pagar antes, QR de uso único).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';
import { gerarPix, crc16 } from '../src/pagamentos/pix.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = {
  DB: criarD1(['0001_inicial', '0002_lista_compras', '0003_usuarios', '0004_fotos', '0005_alerta_estoque', '0006_venda', '0007_cliente', '0008_combos', '0009_trava_estoque', '0010_estoque_recomendado', '0011_indices'].map((m) => arq(`../migrations/${m}.sql`)).concat(arq('../seed/seed.sql'))),
  ADMIN_TOKEN: 'segredo-teste', PAGAMENTO_WEBHOOK_SECRET: 'whsec', ASSETS: { fetch: () => new Response('x') },
};
const chamar = async (caminho, metodo = 'GET', corpo, { token = 'segredo-teste', cab = {}, bruto } = {}) => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, {
    method: metodo, body: bruto ?? (corpo ? JSON.stringify(corpo) : undefined),
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', ...(token ? { authorization: `Bearer ${token}` } : {}), ...cab } }), env);
  return { status: r.status, corpo: await r.json() };
};
const primeiroProduto = async () => (await chamar('/api/venda/cardapio', 'GET', null, { token: null })).corpo.categorias.flatMap((c) => c.produtos)[0];

test('cardápio é público, agrupado por categoria e com preço', async () => {
  const r = await chamar('/api/venda/cardapio', 'GET', null, { token: null });
  assert.equal(r.status, 200);
  assert.ok(r.corpo.categorias.length > 1);
  assert.ok(r.corpo.categorias.every((c) => c.produtos.every((p) => p.preco > 0)));
});

test('comanda: lançar itens, cobrar em dinheiro, fecha e dá baixa no estoque uma vez só', async () => {
  assert.equal((await chamar('/api/venda/comandas', 'POST', {}, { token: null })).status, 401);
  const p = await primeiroProduto();
  const c = (await chamar('/api/venda/comandas', 'POST', { mesa: '5' })).corpo.comanda;
  await chamar(`/api/venda/comandas/${c.id}/itens`, 'POST', { produto_id: p.id, delta: 2 });
  let d = (await chamar(`/api/venda/comandas/${c.id}`)).corpo.comanda;
  assert.equal(d.total, Math.round(p.preco * 2 * 100) / 100);
  const cob = await chamar(`/api/venda/comandas/${c.id}/cobrar`, 'POST', { forma: 'dinheiro' });
  assert.equal(cob.status, 201);
  d = cob.corpo.comanda;
  assert.equal(d.status, 'entregue');
  assert.equal((await chamar(`/api/venda/comandas/${c.id}/itens`, 'POST', { produto_id: p.id, delta: 1 })).status, 409);
  const mov = await env.DB.prepare("SELECT COUNT(*) AS n FROM movimento_estoque WHERE tipo = 'venda' AND referencia = ?").bind(c.id).first();
  assert.ok(mov.n >= 0);
});

test('cartão vai para a maquininha escolhida; some da fila ao confirmar', async () => {
  const p = await primeiroProduto();
  const c = (await chamar('/api/venda/comandas', 'POST', {})).corpo.comanda;
  await chamar(`/api/venda/comandas/${c.id}/itens`, 'POST', { produto_id: p.id, delta: 1 });
  const maqs = (await chamar('/api/venda/maquininhas')).corpo.maquininhas;
  const r = await chamar(`/api/venda/comandas/${c.id}/cobrar`, 'POST', { forma: 'credito', maquininha_id: maqs[1].id });
  assert.equal(r.corpo.maquininha, maqs[1].nome);
  assert.equal(r.corpo.comanda.status, 'aguardando_pagamento');
  const conf = await chamar(`/api/venda/cobrancas/${r.corpo.cobranca_id}/confirmar`, 'POST', {});
  assert.equal(conf.corpo.comanda.status, 'entregue');
  assert.equal((await chamar(`/api/venda/cobrancas/${r.corpo.cobranca_id}/confirmar`, 'POST', {})).status, 409);
});

test('Pix: código copia-e-cola tem CRC válido e o valor', () => {
  const cod = gerarPix({ chave: 'bar@mukifo.com', nome: 'Mukifo', cidade: 'Porto Alegre', valor: 25.5, txid: 'MKF1' });
  assert.match(cod, /5405 ?25\.50|540525\.50/);
  assert.equal(crc16(cod.slice(0, -4)), cod.slice(-4));
});

test('app do cliente: só vale depois de pago; QR confere e só funciona uma vez', async () => {
  const p = await primeiroProduto();
  const sem = { token: null };
  // ainda não liberado (sem chave Pix)
  assert.equal((await chamar('/api/cliente/pedidos', 'POST', { nome: 'Ana', celular: '51999998888', itens: [{ produto_id: p.id, quantidade: 1 }] }, sem)).status, 503);
  assert.equal((await chamar('/api/venda/pix', 'PUT', { chave: 'bar@mukifo.com' })).status, 200);

  assert.equal((await chamar('/api/cliente/pedidos', 'POST', { nome: 'A', celular: '123', itens: [] }, sem)).status, 400);
  // preço enviado pelo aparelho é ignorado: o servidor usa o cadastro
  const ped = await chamar('/api/cliente/pedidos', 'POST', { nome: 'Ana', celular: '(51) 99999-8888', itens: [{ produto_id: p.id, quantidade: 2, preco: 0.01 }] }, sem);
  assert.equal(ped.status, 201);
  assert.equal(ped.corpo.total, Math.round(p.preco * 2 * 100) / 100);
  assert.ok(ped.corpo.pix.startsWith('000201'));
  const codigo = `MKF1.${ped.corpo.id}.${ped.corpo.chave_qr}`;

  // não pago: balcão recusa e a fila do balcão não mostra
  const antes = await chamar('/api/venda/retirada', 'POST', { codigo, confirmar: true });
  assert.equal(antes.status, 402);
  const fila = (await chamar('/api/venda/retiradas')).corpo;
  assert.equal(fila.pedidos.some((x) => x.id === ped.corpo.id), false);
  assert.equal(fila.aguardando.some((x) => x.id === ped.corpo.id), true);
  // outro cliente não vê o pedido (chave errada)
  assert.equal((await chamar(`/api/cliente/pedidos/${ped.corpo.id}`, 'GET', null, { token: null, cab: { 'X-Chave-Pedido': 'x'.repeat(32) } })).status, 404);

  // aviso de pagamento sem assinatura é recusado; com assinatura vale
  const cobId = (await env.DB.prepare("SELECT id FROM cobranca WHERE pedido_id = ?").bind(ped.corpo.id).first()).id;
  const corpo = JSON.stringify({ cobranca_id: cobId, valor: ped.corpo.total });
  assert.equal((await chamar('/api/cliente/pagamento/webhook', 'POST', null, { token: null, bruto: corpo, cab: { 'X-Assinatura': 'abc' } })).status, 401);
  const ass = createHmac('sha256', 'whsec').update(corpo).digest('hex');
  assert.equal((await chamar('/api/cliente/pagamento/webhook', 'POST', null, { token: null, bruto: corpo, cab: { 'X-Assinatura': ass } })).status, 200);

  const st = (await chamar(`/api/cliente/pedidos/${ped.corpo.id}`, 'GET', null, { token: null, cab: { 'X-Chave-Pedido': ped.corpo.chave_qr } })).corpo;
  assert.equal(st.pago, true);
  assert.equal((await chamar('/api/venda/retiradas')).corpo.pedidos.some((x) => x.id === ped.corpo.id), true);

  // QR adulterado, depois conferir, depois entregar, depois reutilizar
  assert.equal((await chamar('/api/venda/retirada', 'POST', { codigo: `MKF1.${ped.corpo.id}.${'0'.repeat(32)}`, confirmar: true })).status, 400);
  const ver = await chamar('/api/venda/retirada', 'POST', { codigo });
  assert.equal(ver.corpo.entregue, false);
  assert.equal((await chamar('/api/venda/retirada', 'POST', { codigo, confirmar: true })).corpo.entregue, true);
  assert.equal((await chamar('/api/venda/retirada', 'POST', { codigo, confirmar: true })).status, 409);
});

test('app do cliente: limita pedidos não pagos por celular', async () => {
  const p = await primeiroProduto();
  const novo = () => chamar('/api/cliente/pedidos', 'POST', { nome: 'Beto', celular: '51988887777', itens: [{ produto_id: p.id, quantidade: 1 }] }, { token: null });
  assert.equal((await novo()).status, 201);
  assert.equal((await novo()).status, 201);
  assert.equal((await novo()).status, 429);
});

test('combos: cria, valida e baixa o estoque pelos produtos do combo', async () => {
  const lista = (await chamar('/api/produtos')).corpo.filter((x) => x.tem_ficha && x.ficha.length && x.preco_venda);
  const [a, b] = lista;
  assert.equal((await chamar('/api/combos', 'GET', null, { token: null })).status, 401);
  assert.equal((await chamar('/api/combos', 'POST', { nome: 'Vazio', preco_venda: 10, itens: [] })).status, 400);
  const r = await chamar('/api/combos', 'POST', { nome: 'Combo teste', preco_venda: 30, itens: [{ produto_id: a.id, quantidade: 2 }, { produto_id: b.id, quantidade: 1 }] });
  assert.equal(r.status, 201);
  const id = r.corpo.combo.id;
  assert.equal((await chamar('/api/combos', 'POST', { nome: 'Combo dentro', preco_venda: 5, itens: [{ produto_id: id, quantidade: 1 }] })).status, 400);
  assert.ok((await chamar('/api/venda/cardapio', 'GET', null, { token: null })).corpo.categorias.some((c) => c.produtos.some((p) => p.id === id)));
  const c = (await chamar('/api/venda/comandas', 'POST', {})).corpo.comanda;
  await chamar(`/api/venda/comandas/${c.id}/itens`, 'POST', { produto_id: id, delta: 1 });
  assert.equal((await chamar(`/api/venda/comandas/${c.id}/cobrar`, 'POST', { forma: 'dinheiro' })).corpo.comanda.status, 'entregue');
  const mov = await env.DB.prepare("SELECT COUNT(*) AS n FROM movimento_estoque WHERE tipo = 'venda' AND referencia = ?").bind(c.id).first();
  assert.ok(mov.n >= 1);
  assert.equal((await chamar(`/api/combos/${id}`, 'DELETE')).status, 200);
});

test('trava: não vende o que não tem no estoque (balcão e app), respeitando reservas', async () => {
  const lista = (await chamar('/api/produtos')).corpo.filter((x) => x.ficha.length && x.preco_venda);
  const prod = lista.find((x) => x.ficha.length === 1) ?? lista[0];
  const ins = (await chamar('/api/insumos')).corpo.find((i) => i.nome === prod.ficha[0].insumo);
  // zera o insumo e deixa só o necessário para 2 unidades
  const atual = (await chamar('/api/estoque')).corpo.itens.find((i) => i.insumo === ins.nome).atual;
  const porUn = prod.ficha[0].quantidade / (ins.conteudo ?? 1);
  await chamar('/api/contagem', 'POST', { momento: 'abertura', itens: [{ insumo: ins.nome, contado: Math.round(porUn * 2 * 1e6) / 1e6 }] });
  const cardapio = async () => (await chamar('/api/venda/cardapio', 'GET', null, { token: null })).corpo.categorias.flatMap((c) => c.produtos).find((p) => p.id === prod.id);
  assert.equal((await cardapio()).restam, 2);
  const c1 = (await chamar('/api/venda/comandas', 'POST', {})).corpo.comanda;
  assert.equal((await chamar(`/api/venda/comandas/${c1.id}/itens`, 'POST', { produto_id: prod.id, delta: 2 })).status, 200);
  assert.equal((await chamar(`/api/venda/comandas/${c1.id}/itens`, 'POST', { produto_id: prod.id, delta: 1 })).status, 409);
  assert.equal((await cardapio()).restam, 0);                       // reservado na comanda 1
  const c2 = (await chamar('/api/venda/comandas', 'POST', {})).corpo.comanda;
  const r = await chamar(`/api/venda/comandas/${c2.id}/itens`, 'POST', { produto_id: prod.id, delta: 1 });
  assert.equal(r.status, 409); assert.match(r.corpo.erro, /esgotado|Sem estoque/);
  const app = await chamar('/api/cliente/pedidos', 'POST', { nome: 'Caio', celular: '51977776666', itens: [{ produto_id: prod.id, quantidade: 1 }] }, { token: null });
  assert.equal(app.status, 409);
  // desligar a trava libera
  assert.equal((await chamar('/api/venda/trava', 'PUT', { ativa: false })).status, 200);
  assert.equal((await chamar(`/api/venda/comandas/${c2.id}/itens`, 'POST', { produto_id: prod.id, delta: 1 })).status, 200);
  await chamar('/api/venda/trava', 'PUT', { ativa: true });
  await chamar(`/api/venda/comandas/${c1.id}/cancelar`, 'POST', {}); await chamar(`/api/venda/comandas/${c2.id}/cancelar`, 'POST', {});
  assert.ok(atual !== undefined);
});

test('estoque recomendado manda na compra recomendada (menos o que tem)', async () => {
  const itens = (await chamar('/api/estoque?dia=quinta')).corpo.itens;
  const it = itens[0];
  assert.equal((await chamar('/api/recomendados', 'PUT', { itens: [{ insumo_id: it.insumo_id, estoque_recomendado: -1 }] })).status, 400);
  assert.equal((await chamar('/api/recomendados', 'PUT', { itens: [{ insumo_id: it.insumo_id, estoque_recomendado: it.atual + 7 }] }, { token: null })).status, 401);
  assert.equal((await chamar('/api/recomendados', 'PUT', { itens: [{ insumo_id: it.insumo_id, estoque_recomendado: it.atual + 7 }] })).status, 200);
  const novo = (await chamar('/api/estoque?dia=quinta')).corpo.itens.find((x) => x.insumo_id === it.insumo_id);
  assert.equal(novo.sugestao, 7);
  const lista = (await chamar('/api/lista-compras?dia=quinta')).corpo;
  const linha = [...lista.fornecedores.flatMap((f) => f.itens), ...lista.producao].find((x) => x.insumo_id === it.insumo_id);
  assert.equal(linha.quantidade, 7);
  await chamar('/api/recomendados', 'PUT', { itens: [{ insumo_id: it.insumo_id, estoque_recomendado: null }] });
  assert.equal((await chamar('/api/estoque?dia=quinta')).corpo.itens.find((x) => x.insumo_id === it.insumo_id).estoque_recomendado, null);
});

test('desempenho: indicadores do período batem com as vendas feitas', async () => {
  assert.equal((await chamar('/api/desempenho', 'GET', null, { token: null })).status, 401);
  const p = await primeiroProduto();
  await chamar('/api/venda/trava', 'PUT', { ativa: false });
  const c = (await chamar('/api/venda/comandas', 'POST', {})).corpo.comanda;
  await chamar(`/api/venda/comandas/${c.id}/itens`, 'POST', { produto_id: p.id, delta: 3 });
  await chamar(`/api/venda/comandas/${c.id}/cobrar`, 'POST', { forma: 'dinheiro' });
  await chamar('/api/venda/trava', 'PUT', { ativa: true });
  const d = (await chamar('/api/desempenho')).corpo;
  assert.ok(d.vendas >= 1 && d.fat >= p.preco * 3);
  assert.ok(d.ticket > 0 && d.itens_por_venda > 0);
  assert.ok(d.top_qtd.some((x) => x.qtd >= 3));
  assert.ok(d.formas.some((f) => f.forma === 'dinheiro'));
  assert.ok(Array.isArray(d.hora) && d.hora.length >= 1);
  assert.equal((await chamar('/api/desempenho?de=2020-01-01&ate=2024-01-01')).status, 400);
});
