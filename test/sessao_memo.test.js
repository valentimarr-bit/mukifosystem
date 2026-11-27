// Desempenho: o login é consultado uma vez por requisição (cada consulta ao banco leva ~120 ms).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { criarD1 } from './d1-falso.js';
import worker from '../src/worker.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const base = criarD1([...readdirSync(arq('../migrations/')).filter((f) => f.endsWith('.sql')).sort().map((f) => arq('../migrations/' + f)), arq('../seed/seed.sql')]);
let consultas = [];
const contar = (s, sql) => ({ bind: (...p) => contar(s.bind(...p), sql), all: () => (consultas.push(sql), s.all()), first: () => (consultas.push(sql), s.first()), run: () => (consultas.push(sql), s.run()), runSync: () => s.runSync() });
const DB = { prepare: (sql) => contar(base.prepare(sql), sql), batch: (st) => (consultas.push('BATCH'), base.batch(st)) };
const env = { DB, ADMIN_TOKEN: 'segredo-teste', ASSETS: { fetch: () => new Response('x') }, CODIGO_PRIMEIRO_ACESSO: 'codigo-teste' };
const chamar = async (caminho, corpo, token, method) => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, {
    method: method ?? (corpo ? 'POST' : 'GET'), body: corpo ? JSON.stringify(corpo) : undefined,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), env);
  return { status: r.status, corpo: await r.json() };
};

test('GET /api/venda/comandas consulta a sessão só uma vez', async () => {
  const dono = await chamar('/api/auth/primeiro-acesso', { nome: 'Ana', senha: 'senha-da-ana', codigo: 'codigo-teste' });
  assert.equal(dono.status, 200);
  const criado = await chamar('/api/usuarios', { nome: 'Bia', senha: 'provisoria-1', cargo: 'gerente' }, dono.corpo.token);
  assert.equal(criado.status, 200);
  const provisoria = await chamar('/api/auth/entrar', { nome: 'Bia', senha: 'provisoria-1' });
  assert.equal(provisoria.status, 200);
  const troca = await chamar('/api/auth/trocar-senha', { senhaAtual: 'provisoria-1', senhaNova: 'nova-senha-bia' }, provisoria.corpo.token);
  assert.equal(troca.status, 200);
  const entrou = await chamar('/api/auth/entrar', { nome: 'Bia', senha: 'nova-senha-bia' });
  assert.equal(entrou.status, 200);

  consultas = [];
  const r = await chamar('/api/venda/comandas', null, entrou.corpo.token);
  assert.equal(r.status, 200);
  const daSessao = consultas.filter((s) => s.includes('FROM sessao'));
  assert.equal(daSessao.length, 1);
});
