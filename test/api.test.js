// Testa a API de ponta a ponta com o banco montado pelas migrações + seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { lerRelatorioCSV } from '../src/api.js';
import { criarD1 } from './d1-falso.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = {
  DB: criarD1([arq('../migrations/0001_inicial.sql'), arq('../migrations/0002_lista_compras.sql'), arq('../migrations/0003_usuarios.sql'), arq('../migrations/0004_fotos.sql'), arq('../migrations/0005_alerta_estoque.sql'), arq('../migrations/0006_venda.sql'), arq('../migrations/0007_cliente.sql'), arq('../migrations/0008_combos.sql'), arq('../migrations/0009_trava_estoque.sql'), arq('../migrations/0010_estoque_recomendado.sql'), arq('../migrations/0011_indices.sql'), arq('../migrations/0012_financeiro.sql'), arq('../migrations/0013_clientes_e_dias.sql'), arq('../migrations/0014_indices_estoque.sql'), arq('../migrations/0015_recuperar_senha.sql'), arq('../migrations/0016_auditoria.sql'), arq('../migrations/0017_tempo_preparo.sql'), arq('../migrations/0018_pronta_entrega.sql'), arq('../migrations/0019_entrega_parcial.sql'), arq('../migrations/0020_carteira.sql'), arq('../migrations/0021_item_pronto.sql'), arq('../migrations/0022_campeonato.sql'), arq('../migrations/0023_gateway.sql'), arq('../migrations/0024_sinuca.sql'), arq('../migrations/0025_nota_fiscal.sql'), arq('../migrations/0026_fiscal.sql'), arq('../migrations/0027_pix_monitor.sql'), arq('../migrations/0028_canais.sql'), arq('../migrations/0029_whatsapp.sql'), arq('../seed/seed.sql')]),
  ADMIN_TOKEN: 'segredo-teste',
  ASSETS: { fetch: () => new Response('estatico') },
};
const chamar = async (caminho, opcoes = {}) => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, opcoes), env);
  return { status: r.status, corpo: await r.json() };
};
const post = (caminho, corpo, token = 'segredo-teste', method = 'POST') => chamar(caminho, {
  method, body: JSON.stringify(corpo), headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
});

test('saúde mostra o banco conectado', async () => {
  const { corpo } = await chamar('/api/saude');
  assert.match(corpo.banco, /conectado \(78 insumos\)/);
});

test('estoque: 78 itens, sem estoque registrado ainda, mínimos calculados pelo histórico', async () => {
  const { corpo } = await chamar('/api/estoque?dia=quinta');
  assert.equal(corpo.itens.length, 78);
  const ypioca = corpo.itens.find((i) => i.insumo === 'Cachaça Ypióca Ouro');
  assert.equal(ypioca.minimo_quinta, 7); // mesmo valor da planilha
  assert.equal(ypioca.situacao, 'SEM ESTOQUE');
});

test('lista de compras agrupa por fornecedor, deixa Ceasa por último e separa a produção própria', async () => {
  const { corpo } = await chamar('/api/lista-compras?dia=segunda');
  assert.ok(corpo.fornecedores.length > 5);
  assert.equal(corpo.fornecedores.at(-1).fornecedor, 'Ceasa');
  assert.ok(corpo.producao.some((p) => p.insumo.startsWith('Xarope')));
  assert.ok(!corpo.fornecedores.some((f) => f.fornecedor === 'Produção própria'));
});

test('escrita sem senha é recusada', async () => {
  const { status } = await post('/api/compras', { itens: [] }, 'errada');
  assert.equal(status, 401);
});

test('compra → relatório do dia → contagem: estoque e perdas fecham', async () => {
  let r = await post('/api/compras', { fornecedor: 'NW', itens: [{ insumo: 'Cachaça Ypióca Ouro', quantidade: 6, valor_pago: 228 }] });
  assert.equal(r.status, 201);

  assert.equal(lerRelatorioCSV('Produto,UN,Estoque,Qtd. vendida,Total vendas\n"CAIPIRINHA CACHAÇA",UN,-1,20,"400,00"')[0].total, 400);
  r = await post('/api/vendas/relatorio', { dia: '2026-11-24', csv: 'Produto,UN,Estoque,Qtd. vendida,Total vendas\nCAIPIRINHA CACHAÇA,UN,-1,20,"400,00"\nPRODUTO NOVO X,UN,0,2,"10,00"' });
  assert.equal(r.status, 201);
  assert.deepEqual(r.corpo.sem_ficha.map((s) => s.produto), ['PRODUTO NOVO X']);

  // 20 caipirinhas × 50 ml = 1000 ml = 1,036 garrafa de 965 ml
  let est = (await chamar('/api/estoque')).corpo.itens.find((i) => i.insumo === 'Cachaça Ypióca Ouro');
  assert.equal(est.atual, Math.round((6 - 1000 / 965) * 100) / 100);

  r = await post('/api/vendas/relatorio', { dia: '2026-11-24', csv: 'Produto,UN,Estoque,Qtd. vendida,Total vendas\nX,UN,0,1,"1,00"' });
  assert.equal(r.status, 409, 'não importa o mesmo dia duas vezes');

  r = await post('/api/contagem', { itens: [{ insumo: 'Cachaça Ypióca Ouro', contado: 4.5 }] });
  assert.equal(r.status, 201);
  assert.equal(r.corpo.diferencas[0].diferenca, Math.round((4.5 - (6 - 1000 / 965)) * 100) / 100);
  est = (await chamar('/api/estoque')).corpo.itens.find((i) => i.insumo === 'Cachaça Ypióca Ouro');
  assert.equal(est.atual, 4.5);
});

test('produtos trazem CMV e lucro; preço real da compra substitui a estimativa', async () => {
  const { corpo } = await chamar('/api/produtos');
  const c = corpo.find((p) => p.produto === 'CAIPIRINHA CACHAÇA');
  assert.ok(c.tem_ficha && c.cmv > 0 && c.lucro > 0);
  assert.ok(corpo.some((p) => !p.tem_ficha), 'lista produtos vendidos sem ficha');
});

test('lista no celular: gerar, marcar, ajustar, adicionar esquecido, finalizar → entra no estoque', async () => {
  const auth = { headers: { authorization: 'Bearer segredo-teste' } };
  assert.equal((await chamar('/api/listas/atual')).status, 401, 'pede senha');
  assert.equal((await chamar('/api/listas/atual', auth)).corpo.lista, null);

  let r = await post('/api/listas', { dia: 'quinta' });
  assert.equal(r.status, 201);
  const lista = r.corpo.lista;
  assert.ok(lista.itens_total > 10);
  assert.equal(lista.fornecedores.at(-1).fornecedor, 'Ceasa');
  assert.ok(!lista.fornecedores.some((f) => f.fornecedor === 'Produção própria'));

  const limao = lista.fornecedores.at(-1).itens.find((i) => i.insumo === 'Limão Taiti');
  const antes = (await chamar('/api/estoque')).corpo.itens.find((i) => i.insumo === 'Limão Taiti').atual;
  r = await post(`/api/listas/${lista.id}/itens/${limao.id}`, { comprado: true, quantidade_comprada: 3, valor_pago: 21 }, undefined, 'PATCH');
  assert.equal(r.status, 200);

  r = await post(`/api/listas/${lista.id}/itens`, { insumo: 'Seda', quantidade: 2 });
  const seda = r.corpo.lista.fornecedores.flatMap((f) => f.itens).find((i) => i.insumo === 'Seda');
  await post(`/api/listas/${lista.id}/itens/${seda.id}`, { comprado: true }, undefined, 'PATCH');

  const atual = (await chamar('/api/listas/atual', auth)).corpo.lista;
  assert.equal(atual.itens_comprados, 2);

  r = await post(`/api/listas/${lista.id}/finalizar`, {});
  assert.equal(r.status, 200);
  assert.equal(r.corpo.compras.length, 2);
  assert.ok(r.corpo.faltaram.length > 0);

  const est = (await chamar('/api/estoque')).corpo.itens;
  assert.equal(est.find((i) => i.insumo === 'Limão Taiti').atual, Math.round((antes + 3) * 100) / 100);
  assert.equal((await chamar('/api/listas/atual', auth)).corpo.lista, null, 'lista fechada');
  const prod = (await chamar('/api/produtos')).corpo;
  assert.ok(prod.length);
  r = await post(`/api/listas/${lista.id}/itens/${limao.id}`, { comprado: false }, undefined, 'PATCH');
  assert.equal(r.status, 409, 'lista finalizada não muda');
});

test('alertas de estoque: define o nível, marca o item em alerta e limpa', async () => {
  const antes = await chamar('/api/estoque?dia=quinta');
  const item = antes.corpo.itens[0];
  assert.equal(item.alerta, false);
  assert.equal(item.minimo_alerta, null);

  assert.equal((await post('/api/alertas', { itens: [{ insumo_id: item.insumo_id, minimo_alerta: 3 }] }, 'token-errado', 'PUT')).status, 401);
  assert.equal((await post('/api/alertas', { itens: [{ insumo_id: item.insumo_id, minimo_alerta: -1 }] }, 'segredo-teste', 'PUT')).status, 400);
  assert.equal((await post('/api/alertas', { itens: [] }, 'segredo-teste', 'PUT')).status, 400);

  assert.equal((await post('/api/alertas', { itens: [{ insumo_id: item.insumo_id, minimo_alerta: 3 }] }, 'segredo-teste', 'PUT')).status, 200);
  const depois = (await chamar('/api/estoque?dia=quinta')).corpo.itens.find((i) => i.insumo_id === item.insumo_id);
  assert.equal(depois.minimo_alerta, 3);
  assert.equal(depois.alerta, depois.atual <= 3);

  await post('/api/alertas', { itens: [{ insumo_id: item.insumo_id, minimo_alerta: 1e9 }] }, 'segredo-teste', 'PUT');
  assert.equal((await chamar('/api/estoque?dia=quinta')).corpo.itens.find((i) => i.insumo_id === item.insumo_id).alerta, true);
  await post('/api/alertas', { itens: [{ insumo_id: item.insumo_id, minimo_alerta: 0 }] }, 'segredo-teste', 'PUT');
  const zero = (await chamar('/api/estoque?dia=quinta')).corpo.itens.find((i) => i.insumo_id === item.insumo_id);
  assert.equal(zero.alerta, zero.atual <= 0);

  await post('/api/alertas', { itens: [{ insumo_id: item.insumo_id, minimo_alerta: null }] }, 'segredo-teste', 'PUT');
  assert.equal((await chamar('/api/estoque?dia=quinta')).corpo.itens.find((i) => i.insumo_id === item.insumo_id).alerta, false);
});

test('lista pelo estoque: entra só o que acabou, está em alerta ou não cobre até a próxima compra; sobe até o recomendado', async () => {
  const calc = async () => (await chamar('/api/lista-compras?dia=estoque')).corpo;
  const itens = (c) => c.fornecedores.flatMap((f) => f.itens);
  const c1 = await calc();
  assert.equal(c1.dia, 'estoque'); assert.ok(itens(c1).length > 0);
  assert.ok(itens(c1).every((i) => i.quantidade > 0 && i.recomendado > 0));
  const alvo = itens(c1)[0], ins = await env.DB.prepare('SELECT id FROM insumo WHERE nome = ?').bind(alvo.insumo).first();
  assert.ok(alvo.quantidade >= alvo.recomendado - alvo.tem, 'leva até o recomendado');
  await env.DB.prepare("INSERT INTO movimento_estoque (insumo_id, tipo, quantidade) VALUES (?, 'ajuste', ?)").bind(ins.id, 10000).run();
  assert.ok(!itens(await calc()).some((i) => i.insumo === alvo.insumo), 'estoque cheio: não entra');
  await env.DB.prepare('DELETE FROM movimento_estoque WHERE insumo_id = ? AND quantidade = 10000').bind(ins.id).run();
  // um pouco abaixo do recomendado e no nível de alerta: entra, só com a diferença
  await env.DB.prepare("INSERT INTO movimento_estoque (insumo_id, tipo, quantidade) VALUES (?, 'ajuste', ?)").bind(ins.id, alvo.recomendado - 0.5).run();
  await env.DB.prepare('UPDATE insumo SET minimo_alerta = ? WHERE id = ?').bind(alvo.recomendado - 0.5, ins.id).run();
  const parcial = itens(await calc()).find((i) => i.insumo === alvo.insumo);
  assert.ok(parcial, 'no nível de alerta: entra'); assert.ok(parcial.quantidade <= 1 && parcial.quantidade > 0, 'só a diferença até o recomendado');
  await env.DB.prepare('UPDATE insumo SET minimo_alerta = NULL WHERE id = ?').bind(ins.id).run();
  await env.DB.prepare("DELETE FROM movimento_estoque WHERE insumo_id = ? AND tipo = 'ajuste'").bind(ins.id).run();
  // gerar a lista de verdade guarda o modo
  const g = await post('/api/listas', { dia: 'estoque' });
  assert.equal(g.status, 201); assert.equal(g.corpo.lista.dia_compra, 'estoque'); assert.ok(g.corpo.lista.itens_total > 0);
});
