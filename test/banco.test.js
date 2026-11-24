// O banco se monta sozinho no primeiro acesso (deploy só por cliques, sem terminal).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';
import { MIGRACOES } from '../src/banco/sql.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));

test('src/banco/sql.js está em dia com migrations/ e seed/ (senão: npm run sql:embutir)', () => {
  const antes = readFileSync(arq('../src/banco/sql.js'), 'utf-8');
  execFileSync(process.execPath, [arq('../scripts/embutir_sql.mjs')]);
  assert.equal(readFileSync(arq('../src/banco/sql.js'), 'utf-8'), antes);
});

test('banco vazio: o primeiro acesso cria as tabelas e carrega a planilha', async () => {
  const env = { DB: criarD1(), ASSETS: { fetch: () => new Response('x') } };
  const r = await (await worker.fetch(new Request('https://x.test/api/saude'), env)).json();
  assert.match(r.banco, /conectado \(78 insumos\)/);
  const est = await (await worker.fetch(new Request('https://x.test/api/estoque?dia=quinta'), env)).json();
  assert.equal(est.itens.length, 78);
  const { results } = await env.DB.prepare('SELECT nome FROM _mukifo_migracao ORDER BY nome').all();
  assert.deepEqual(results.map((x) => x.nome), [...MIGRACOES.map((m) => m.nome), 'seed', 'categorias-v1'].sort());
});

test('banco já montado pelo terminal: não recarrega nem apaga nada', async () => {
  const db = criarD1([arq('../migrations/0001_inicial.sql'), arq('../migrations/0002_lista_compras.sql'), arq('../migrations/0003_usuarios.sql'), arq('../migrations/0004_fotos.sql'), arq('../migrations/0005_alerta_estoque.sql'), arq('../migrations/0006_venda.sql'), arq('../migrations/0007_cliente.sql'), arq('../migrations/0008_combos.sql'), arq('../migrations/0009_trava_estoque.sql'), arq('../migrations/0010_estoque_recomendado.sql'), arq('../migrations/0011_indices.sql'), arq('../migrations/0012_financeiro.sql'), arq('../migrations/0013_clientes_e_dias.sql'), arq('../migrations/0014_indices_estoque.sql'), arq('../migrations/0015_recuperar_senha.sql'), arq('../seed/seed.sql')]);
  await db.prepare("UPDATE insumo SET nome = 'MARCA' WHERE id = 1").run(); // se o seed rodasse de novo, a marca sumiria
  const env = { DB: db, ASSETS: { fetch: () => new Response('x') } };
  const r = await (await worker.fetch(new Request('https://x.test/api/saude'), env)).json();
  assert.match(r.banco, /78 insumos/);
  assert.equal((await db.prepare('SELECT nome FROM insumo WHERE id = 1').first()).nome, 'MARCA');
});
