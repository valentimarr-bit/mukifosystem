// Testa a API de ponta a ponta com o banco montado pelas migrações + seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { lerRelatorioCSV } from '../src/api.js';
import { criarD1 } from './d1-falso.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = {
  DB: criarD1([arq('../migrations/0001_inicial.sql'), arq('../seed/seed.sql')]),
  ADMIN_TOKEN: 'segredo-teste',
  ASSETS: { fetch: () => new Response('estatico') },
};
const chamar = async (caminho, opcoes = {}) => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, opcoes), env);
  return { status: r.status, corpo: await r.json() };
};
const post = (caminho, corpo, token = 'segredo-teste') => chamar(caminho, {
  method: 'POST', body: JSON.stringify(corpo), headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
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
