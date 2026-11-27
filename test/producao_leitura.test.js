// Tela de produção só lê; pedidos vencidos são cancelados pelo cron (scheduled), não pela tela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

test('GET /api/producao só lê: nenhuma escrita', async () => {
  await prepararBanco(DB);   // monta o banco antes de começar a contar
  await base.prepare(`INSERT INTO pedido (id, numero, dia, origem, status, nome_cliente, celular, token_hash, total, pago_em, expira_em)
    VALUES ('app-prod', 'C1', '2026-11-26', 'celular', 'recebido', 'Maria', '51999999999', 'x', 10, datetime('now'), datetime('now', '+15 minutes'))`).run();
  consultas = [];
  const r = await worker.fetch(new Request('https://mukifo.test/api/producao', {
    method: 'GET', headers: { authorization: 'Bearer segredo-teste' },
  }), env);
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.ok(Array.isArray(corpo.pedidos));
  assert.equal(consultas.filter((s) => s === 'BATCH' || /^\s*(UPDATE|INSERT|DELETE)/i.test(s)).length, 0);
});

test('cron (scheduled) cancela pedido vencido e a cobrança', async () => {
  const hash = (t) => createHash('sha256').update(t).digest('hex');
  await base.prepare(`INSERT INTO pedido (id, numero, dia, origem, status, nome_cliente, celular, token_hash, total, expira_em)
    VALUES ('app-vencido-cron', 'C2', '2026-11-26', 'celular', 'aguardando_pagamento', 'Joao', '51988888888', ?, 10, datetime('now', '+15 minutes'))`).bind(hash('k')).run();
  await base.prepare("INSERT INTO cobranca (id, pedido_id, forma, valor, status, operador) VALUES ('cob-cron', 'app-vencido-cron', 'pix', 10, 'pendente', 'app')").run();
  await base.prepare("UPDATE pedido SET expira_em = datetime('now','-1 minute') WHERE id = 'app-vencido-cron'").run();
  const pendentes = [];
  await worker.scheduled({}, env, { waitUntil: (p) => { pendentes.push(p); return p; } });
  await Promise.all(pendentes);
  const p = await base.prepare("SELECT status FROM pedido WHERE id = 'app-vencido-cron'").first();
  const c = await base.prepare("SELECT status FROM cobranca WHERE id = 'cob-cron'").first();
  assert.equal(p.status, 'cancelado');
  assert.equal(c.status, 'cancelada');
});
