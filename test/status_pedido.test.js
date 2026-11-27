// Status do pedido do app (GET /api/cliente/pedidos/:id): poucas consultas e nenhuma escrita quando o pedido está pago.
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

const hash = (t) => createHash('sha256').update(t).digest('hex');
const chamar = async (caminho, chave) => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, {
    method: 'GET', headers: chave ? { 'X-Chave-Pedido': chave } : {},
  }), env);
  return { status: r.status, corpo: await r.json() };
};

// pedidos montados direto no banco de teste (sem passar pelo fluxo de criação)
let numeros = 0;
async function pedido({ id, status, pagoEm = null, chave }) {
  await base.prepare(`INSERT INTO pedido (id, numero, dia, origem, status, nome_cliente, celular, token_hash, total, pago_em, expira_em)
    VALUES (?, ?, '2026-11-26', 'celular', ?, 'Maria', '51999999999', ?, 10, ?, datetime('now', '+15 minutes'))`).bind(id, `C${++numeros}`, status, hash(chave), pagoEm).run();
  await base.prepare("INSERT INTO item_pedido (pedido_id, produto_id, nome, quantidade, preco) VALUES (?, NULL, 'Gin tônica', 1, 10)").bind(id).run();
  await base.prepare("INSERT INTO cobranca (id, pedido_id, forma, valor, status, operador) VALUES (?, ?, 'pix', 10, 'pendente', 'app')").bind('cob-' + id, id).run();
}

test('pedido pago: até 6 consultas e nenhuma escrita', async () => {
  await prepararBanco(DB);   // monta o banco antes de começar a contar
  await pedido({ id: 'app-pago', status: 'recebido', pagoEm: '2026-11-26 12:00:00', chave: 'chave-pago' });
  consultas = [];
  const r = await chamar('/api/cliente/pedidos/app-pago', 'chave-pago');
  assert.equal(r.status, 200);
  assert.equal(r.corpo.status, 'recebido');
  assert.equal(r.corpo.pago, true);
  assert.equal(r.corpo.itens[0].nome, 'Gin tônica');
  assert.ok(r.corpo.fila, 'pedido pago na fila traz a posição');
  assert.ok(consultas.length <= 6, `consultas: ${consultas.length}`);
  assert.equal(consultas.filter((s) => s === 'BATCH' || /^\s*UPDATE/i.test(s)).length, 0);
});

test('pedido vencido: vira cancelado e a cobrança fica cancelada', async () => {
  await pedido({ id: 'app-vencido', status: 'aguardando_pagamento', chave: 'chave-vencido' });
  await base.prepare("UPDATE pedido SET expira_em = datetime('now','-1 minute') WHERE id = ?").bind('app-vencido').run();
  const r = await chamar('/api/cliente/pedidos/app-vencido', 'chave-vencido');
  assert.equal(r.status, 200);
  assert.equal(r.corpo.status, 'cancelado');
  assert.equal(r.corpo.pago, false);
  assert.equal(r.corpo.pix, null);
  const cob = await base.prepare("SELECT status FROM cobranca WHERE pedido_id = ?").bind('app-vencido').first();
  assert.equal(cob.status, 'cancelada');
});

test('chave errada e pedido inexistente dão a mesma resposta 404', async () => {
  await pedido({ id: 'app-outro', status: 'recebido', pagoEm: '2026-11-26 12:00:00', chave: 'chave-certa' });
  assert.equal((await chamar('/api/cliente/pedidos/app-outro', 'chave-errada')).status, 404);
  assert.equal((await chamar('/api/cliente/pedidos/app-nao-existe', 'chave-certa')).status, 404);
});
