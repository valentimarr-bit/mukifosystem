// Fotos de produtos e insumos: enviar (com login), ler (público), trocar e remover.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = {
  DB: criarD1(['0001_inicial', '0002_lista_compras', '0003_usuarios', '0004_fotos', '0005_alerta_estoque', '0006_venda', '0007_cliente', '0008_combos', '0009_trava_estoque', '0010_estoque_recomendado', '0011_indices', '0012_financeiro', '0013_clientes_e_dias', '0014_indices_estoque', '0015_recuperar_senha', '0016_auditoria', '0017_tempo_preparo', '0018_pronta_entrega', '0019_entrega_parcial', '0020_carteira', '0021_item_pronto', '0022_campeonato', '0023_gateway', '0024_sinuca', '0025_nota_fiscal', '0026_fiscal', '0027_pix_monitor', '0028_canais', '0029_whatsapp', '0030_consentimento_whats', '0031_campeonato_nivel', '0032_jogador_titulo', '0033_sinuca_resultado', '0035_seguranca'].map((m) => arq(`../migrations/${m}.sql`)).concat(arq('../seed/seed.sql'))),
  ADMIN_TOKEN: 'segredo-teste', ASSETS: { fetch: () => new Response('x') },
};
const req = (caminho, opcoes = {}) => worker.fetch(new Request('https://mukifo.test' + caminho, opcoes), env);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const put = (caminho, corpo, token = 'segredo-teste', tipo = 'image/jpeg') =>
  req(caminho, { method: 'PUT', body: corpo, headers: { 'content-type': tipo, ...(token ? { authorization: `Bearer ${token}` } : {}) } });

test('os ids de produtos e insumos aparecem nas respostas (a tela precisa deles)', async () => {
  const prods = await (await req('/api/produtos')).json();
  assert.ok(prods.every((p) => Number.isInteger(p.id)));
  const est = await (await req('/api/estoque?dia=quinta')).json();
  assert.ok(est.itens.every((i) => Number.isInteger(i.insumo_id)));
});

test('enviar exige login e só aceita imagem', async () => {
  assert.equal((await put('/api/fotos/produtos/1', JPG, null)).status, 401);
  assert.equal((await put('/api/fotos/produtos/1', JPG, 'token-falso')).status, 401);
  assert.equal((await put('/api/fotos/produtos/1', 'texto', 'segredo-teste', 'text/plain')).status, 400);
  assert.equal((await put('/api/fotos/produtos/999999', JPG)).status, 404);
  assert.equal((await put('/api/fotos/produtos/1', new Uint8Array(400_000))).status, 413);
});

test('foto enviada volta idêntica, aparece no índice e pode ser trocada e removida', async () => {
  const r = await put('/api/fotos/produtos/1', JPG);
  assert.equal(r.status, 200);
  const v1 = (await r.json()).versao;
  assert.ok(v1 > 0);

  const lida = await req('/api/fotos/produtos/1'); // leitura é pública
  assert.equal(lida.status, 200);
  assert.equal(lida.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(new Uint8Array(await lida.arrayBuffer()), JPG);

  assert.ok((await (await req('/api/fotos')).json()).produtos['1']);
  assert.equal((await put('/api/fotos/insumos/2', JPG)).status, 200);
  assert.ok((await (await req('/api/fotos')).json()).insumos['2']);
  assert.equal((await put('/api/fotos/produtos/1', JPG, 'segredo-teste', 'image/webp')).status, 200); // trocar

  assert.equal((await req('/api/fotos/produtos/1', { method: 'DELETE' })).status, 401);
  assert.equal((await req('/api/fotos/produtos/1', { method: 'DELETE', headers: { authorization: 'Bearer segredo-teste' } })).status, 200);
  assert.equal((await req('/api/fotos/produtos/1')).status, 404);
  assert.equal((await (await req('/api/fotos')).json()).produtos['1'], undefined);
});
