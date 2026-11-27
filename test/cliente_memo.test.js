// Desempenho: a conta do cliente é consultada uma vez por requisição.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { criarD1 } from './d1-falso.js';
import { clienteLogado } from '../src/clientes.js';
import { hashToken } from '../src/auth.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const base = criarD1([...readdirSync(arq('../migrations/')).filter((f) => f.endsWith('.sql')).sort().map((f) => arq('../migrations/' + f)), arq('../seed/seed.sql')]);
let consultas = [];
const contar = (s, sql) => ({ bind: (...p) => contar(s.bind(...p), sql), all: () => (consultas.push(sql), s.all()), first: () => (consultas.push(sql), s.first()), run: () => (consultas.push(sql), s.run()), runSync: () => s.runSync() });
const DB = { prepare: (sql) => contar(base.prepare(sql), sql), batch: (st) => (consultas.push('BATCH'), base.batch(st)) };

test('duas chamadas com a mesma requisição consultam cliente_sessao uma vez', async () => {
  const cid = 'c-cli-memo';
  await DB.prepare("INSERT INTO cliente (id, nome, celular, pontos, pontos_total) VALUES (?, 'Cá', '51999990000', 0, 0)").bind(cid).run();
  const token = 'token-cliente-teste';
  await DB.prepare(`INSERT INTO cliente_sessao (token_hash, cliente_id, expira_em) VALUES (?, ?, datetime('now', '+30 days'))`).bind(await hashToken(token), cid).run();

  const req = new Request('https://mukifo.test/api/conta/eu', { headers: { 'X-Sessao-Cliente': token } });
  consultas = [];
  const a = await clienteLogado(req, { DB });
  const b = await clienteLogado(req, { DB });
  assert.equal(a.nome, 'Cá');
  assert.equal(b.id, cid);
  assert.equal(consultas.filter((s) => s.includes('cliente_sessao')).length, 1);
});
