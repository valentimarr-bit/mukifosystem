// Trava de estoque: quantas consultas ao banco ela faz e se o resultado não muda quando o cardápio não manda lista.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { criarD1 } from './d1-falso.js';
import worker from '../src/worker.js';
import { travaLigada, disponibilidade } from '../src/trava.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const base = criarD1([...readdirSync(arq('../migrations/')).filter((f) => f.endsWith('.sql')).sort().map((f) => arq('../migrations/' + f)), arq('../seed/seed.sql')]);
let consultas = [];
const contar = (s, sql) => ({ bind: (...p) => contar(s.bind(...p), sql), all: () => (consultas.push(sql), s.all()), first: () => (consultas.push(sql), s.first()), run: () => (consultas.push(sql), s.run()), runSync: () => s.runSync() });
const DB = { prepare: (sql) => contar(base.prepare(sql), sql), batch: (st) => (consultas.push('BATCH'), base.batch(st)) };
const env = { DB, ADMIN_TOKEN: 'segredo-teste', ASSETS: { fetch: () => new Response('x') } };

const ajustar = (chave, valor) => base.prepare("INSERT INTO configuracao (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor").bind(chave, valor).run();

test('travaLigada faz uma consulta só e segue as regras: padrão ligada, "nao" desliga, modo teste desliga', async () => {
  consultas = [];
  assert.equal(await travaLigada(DB), true);
  assert.equal(consultas.length, 1);

  await ajustar('travar_estoque', 'nao');
  assert.equal(await travaLigada(DB), false);
  await ajustar('travar_estoque', 'sim');
  assert.equal(await travaLigada(DB), true);

  await ajustar('modo_teste', 'sim');
  assert.equal(await travaLigada(DB), false);
  await ajustar('modo_teste', 'nao');
  assert.equal(await travaLigada(DB), true);
});

test('disponibilidade(db, null) dá o mesmo resultado que a lista com todos os produtos', async () => {
  // Dá saldo a todos os insumos das fichas, para a trava valer de verdade.
  await base.prepare("INSERT INTO movimento_estoque (insumo_id, tipo, quantidade) SELECT DISTINCT insumo_id, 'compra', 3 FROM ficha_tecnica").run();
  const { results } = await base.prepare('SELECT id FROM produto').all();
  const ids = results.map((r) => r.id);

  const comLista = await disponibilidade(DB, ids);
  const semLista = await disponibilidade(DB, null);
  assert.ok(comLista.size > 0, 'deveria haver produtos com limite de estoque');
  assert.deepEqual([...semLista.entries()].sort(), [...comLista.entries()].sort());
});
