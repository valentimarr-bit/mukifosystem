// Editar produtos: criar, trocar nome/preço/ficha, desativar. Exige login.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = {
  DB: criarD1(['0001_inicial', '0002_lista_compras', '0003_usuarios', '0004_fotos', '0005_alerta_estoque', '0006_venda', '0007_cliente', '0008_combos', '0009_trava_estoque', '0010_estoque_recomendado', '0011_indices', '0012_financeiro', '0013_clientes_e_dias', '0014_indices_estoque', '0015_recuperar_senha', '0016_auditoria', '0017_tempo_preparo', '0018_pronta_entrega', '0019_entrega_parcial', '0020_carteira', '0021_item_pronto', '0022_campeonato', '0023_gateway', '0024_sinuca', '0025_nota_fiscal', '0026_fiscal', '0027_pix_monitor', '0028_canais', '0029_whatsapp', '0030_consentimento_whats', '0031_campeonato_nivel', '0032_jogador_titulo', '0033_sinuca_resultado'].map((m) => arq(`../migrations/${m}.sql`)).concat(arq('../seed/seed.sql'))),
  ADMIN_TOKEN: 'segredo-teste', ASSETS: { fetch: () => new Response('x') },
};
const chamar = async (caminho, metodo = 'GET', corpo, token = 'segredo-teste') => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, {
    method: metodo, body: corpo ? JSON.stringify(corpo) : undefined,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } }), env);
  return { status: r.status, corpo: await r.json() };
};

test('exige login para ver a ficha e para editar', async () => {
  assert.equal((await chamar('/api/produtos/1', 'GET', null, null)).status, 401);
  assert.equal((await chamar('/api/produtos/1', 'PUT', { nome: 'X' }, null)).status, 401);
  assert.equal((await chamar('/api/produtos', 'POST', { nome: 'X' }, null)).status, 401);
});

test('criar produto com ficha: aparece na lista com CMV e lucro', async () => {
  const insumos = (await chamar('/api/insumos')).corpo;
  const cachaca = insumos.find((i) => /cacha/i.test(i.nome));
  const r = await chamar('/api/produtos', 'POST', { nome: 'Dose de teste', preco_venda: 12.5, ficha: [{ insumo_id: cachaca.id, quantidade: 50 }] });
  assert.equal(r.status, 201);
  assert.equal(r.corpo.produto.ficha[0].insumo, cachaca.nome);
  const lista = (await chamar('/api/produtos')).corpo;
  const p = lista.find((x) => x.produto === 'Dose de teste');
  assert.equal(p.preco_venda, 12.5);
  assert.ok(p.tem_ficha && p.cmv > 0 && p.lucro < 12.5);
  assert.equal((await chamar('/api/produtos', 'POST', { nome: 'dose DE  teste' })).status, 400); // nome repetido (sem diferenciar maiúscula/espaço)
});

test('editar: troca preço e ficha, valida entradas', async () => {
  const lista = (await chamar('/api/produtos')).corpo;
  const id = lista.find((x) => x.produto === 'Dose de teste').id;
  const insumos = (await chamar('/api/insumos')).corpo;
  const vodka = insumos.find((i) => /vodka/i.test(i.nome));
  assert.equal((await chamar(`/api/produtos/${id}`, 'PUT', { nome: 'Dose de teste', ficha: [{ insumo_id: vodka.id, quantidade: 0 }] })).status, 400);
  assert.equal((await chamar(`/api/produtos/${id}`, 'PUT', { nome: 'Dose de teste', preco_venda: -1 })).status, 400);
  assert.equal((await chamar(`/api/produtos/${id}`, 'PUT', { nome: 'A', preco_venda: 5 })).status, 400);
  const ok = await chamar(`/api/produtos/${id}`, 'PUT', { nome: 'Dose vodka', preco_venda: 15, ficha: [{ insumo_id: vodka.id, quantidade: 50 }] });
  assert.equal(ok.status, 200);
  assert.equal(ok.corpo.produto.nome, 'Dose vodka');
  assert.deepEqual(ok.corpo.produto.ficha.map((l) => l.insumo_id), [vodka.id]); // a ficha antiga saiu
  assert.equal((await chamar('/api/produtos/999999', 'PUT', { nome: 'Fantasma' })).status, 404);
});

test('desativar tira o produto da lista', async () => {
  const id = (await chamar('/api/produtos')).corpo.find((x) => x.produto === 'Dose vodka').id;
  const p = (await chamar(`/api/produtos/${id}`)).corpo;
  assert.equal((await chamar(`/api/produtos/${id}`, 'PUT', { ...p, ativo: false })).status, 200);
  assert.ok(!(await chamar('/api/produtos')).corpo.some((x) => x.id === id));
});
