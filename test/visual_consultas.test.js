// GET /api/visual: uma só consulta ao banco e o mesmo formato de resposta de antes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { prepararBanco } from '../src/banco/preparar.js';
import { criarD1 } from './d1-falso.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const base = criarD1([
  '0001_inicial', '0002_lista_compras', '0003_usuarios', '0004_fotos', '0005_alerta_estoque', '0006_venda', '0007_cliente', '0008_combos',
  '0009_trava_estoque', '0010_estoque_recomendado', '0011_indices', '0012_financeiro', '0013_clientes_e_dias', '0014_indices_estoque',
  '0015_recuperar_senha', '0016_auditoria', '0017_tempo_preparo', '0018_pronta_entrega', '0019_entrega_parcial', '0020_carteira',
  '0021_item_pronto', '0022_campeonato', '0023_gateway', '0024_sinuca', '0025_nota_fiscal', '0026_fiscal', '0027_pix_monitor',
  '0028_canais', '0029_whatsapp', '0030_consentimento_whats', '0031_campeonato_nivel', '0032_jogador_titulo', '0033_sinuca_resultado',
  '0034_cancelamento', '0035_seguranca',
].map((m) => arq(`../migrations/${m}.sql`)).concat(arq('../seed/seed.sql')));

// Contador de consultas: cada prepare().all/first/run conta uma; cada batch conta como BATCH.
let consultas = [];
const contar = (s, sql) => ({
  bind: (...p) => contar(s.bind(...p), sql),
  all: () => (consultas.push(sql), s.all()),
  first: () => (consultas.push(sql), s.first()),
  run: () => (consultas.push(sql), s.run()),
  runSync: () => s.runSync(),
});
const DB = { prepare: (sql) => contar(base.prepare(sql), sql), batch: (st) => (consultas.push('BATCH'), base.batch(st)) };
const env = { DB, ADMIN_TOKEN: 'segredo-teste', ASSETS: { fetch: () => new Response('x') } };

const ver = async () => {
  const r = await worker.fetch(new Request('https://mukifo.test/api/visual'), env);
  return { status: r.status, corpo: await r.json() };
};

test('GET /api/visual: uma consulta e o formato de antes (com visual e modo de teste)', async () => {
  await prepararBanco(DB);   // monta o banco antes de começar a contar
  const visual = { tema: 'escuro', acento: '#112233', raio: '8', texto: '1', botoes: 'normal', fonte: 'sistema', marca: { nome: 'Mukifo', emoji: '🍹' } };
  await base.prepare("INSERT OR REPLACE INTO configuracao (chave, valor) VALUES ('visual', ?)").bind(JSON.stringify(visual)).run();
  await base.prepare("INSERT OR REPLACE INTO configuracao (chave, valor) VALUES ('modo_teste', 'sim')").run();
  consultas = [];
  const r = await ver();
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo, { visual, teste: true });
  assert.equal(consultas.length, 1);
  assert.match(consultas[0], /FROM configuracao WHERE chave IN \('visual', 'modo_teste'\)/);
});

test('GET /api/visual: sem nada configurado devolve visual nulo e teste falso', async () => {
  await base.prepare("DELETE FROM configuracao WHERE chave IN ('visual', 'modo_teste')").run();
  consultas = [];
  const r = await ver();
  assert.deepEqual(r.corpo, { visual: null, teste: false });
  assert.equal(consultas.length, 1);
});

test('GET /api/visual: valor de modo de teste que não é "sim" conta como desligado', async () => {
  await base.prepare("INSERT OR REPLACE INTO configuracao (chave, valor) VALUES ('modo_teste', 'nao')").run();
  const r = await ver();
  assert.equal(r.corpo.teste, false);
});
