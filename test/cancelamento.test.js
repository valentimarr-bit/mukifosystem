// Contas de cliente, pontos e níveis, tela de produção, aviso no celular e fornecedores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto as wc } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = {
  DB: criarD1(['0001_inicial', '0002_lista_compras', '0003_usuarios', '0004_fotos', '0005_alerta_estoque', '0006_venda', '0007_cliente', '0008_combos', '0009_trava_estoque', '0010_estoque_recomendado', '0011_indices', '0012_financeiro', '0013_clientes_e_dias', '0014_indices_estoque', '0015_recuperar_senha', '0016_auditoria', '0017_tempo_preparo', '0018_pronta_entrega', '0019_entrega_parcial', '0020_carteira', '0021_item_pronto', '0022_campeonato', '0023_gateway', '0024_sinuca', '0025_nota_fiscal', '0026_fiscal', '0027_pix_monitor', '0028_canais', '0029_whatsapp', '0030_consentimento_whats', '0031_campeonato_nivel', '0032_jogador_titulo', '0033_sinuca_resultado', '0034_cancelamento', '0035_seguranca'].map((m) => arq(`../migrations/${m}.sql`)).concat(arq('../seed/seed.sql'))),
  ADMIN_TOKEN: 'segredo-teste', ASSETS: { fetch: () => new Response('x') },
};
const chamar = async (caminho, metodo = 'GET', corpo, cab = {}, token = 'segredo-teste') => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined,
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '9.9.9.9', ...(token ? { authorization: `Bearer ${token}` } : {}), ...cab } }), env);
  return { status: r.status, corpo: await r.json() };
};


const um = (sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const abastecer = (prod) => env.DB.prepare("INSERT INTO movimento_estoque (insumo_id, tipo, quantidade, motivo) SELECT insumo_id, 'compra', 1000, 'teste' FROM ficha_tecnica WHERE produto_id = ?").bind(prod).run();

test('cancelar pedido: motivo obrigatório, saldo volta, estoque volta, pontos saem e fica no histórico', async () => {
  const cad = await chamar('/api/conta/cadastro', 'POST', { nome: 'Cleo Cancela', celular: '(51) 98888-7001', senha: 'segredo1', aceite: true }, {}, null);
  const sess = { 'X-Sessao-Cliente': cad.corpo.token }, cli = cad.corpo.cliente.id;
  await chamar('/api/venda/pix', 'PUT', { chave: 'bar@mukifo.com' });
  assert.equal((await chamar(`/api/clientes/${cli}/saldo`, 'POST', { valor: 100, obs: 'recarga em dinheiro' })).status, 200);
  const prod = await um("SELECT p.id, p.preco_venda FROM produto p WHERE p.preco_venda IS NOT NULL AND EXISTS (SELECT 1 FROM ficha_tecnica f WHERE f.produto_id = p.id) LIMIT 1");
  await abastecer(prod.id);
  const ped = await chamar('/api/cliente/pedidos', 'POST', { itens: [{ produto_id: prod.id, quantidade: 2 }], pagar_com_saldo: true }, sess, null);
  assert.equal(ped.status, 201); const id = ped.corpo.id;
  const estoque = async () => (await um("SELECT COALESCE(SUM(quantidade), 0) AS s FROM movimento_estoque WHERE referencia = ?", id)).s;
  assert.ok((await estoque()) < 0);   // deu baixa ao pagar
  const saldoPago = (await um('SELECT saldo FROM cliente WHERE id = ?', cli)).saldo;

  assert.equal((await chamar(`/api/pedidos/${id}/cancelar`, 'POST', {}, {}, null)).status, 401);   // só equipe logada
  assert.equal((await chamar(`/api/pedidos/${id}/cancelar`, 'POST', { motivo: '' })).status, 400);   // motivo obrigatório
  const r = await chamar(`/api/pedidos/${id}/cancelar`, 'POST', { motivo: 'cliente desistiu' });
  assert.equal(r.status, 200); assert.equal(r.corpo.estorno, 'saldo'); assert.equal(r.corpo.estoque_devolvido, true);
  assert.equal((await um('SELECT saldo FROM cliente WHERE id = ?', cli)).saldo, Math.round((saldoPago + 2 * prod.preco_venda) * 100) / 100);
  assert.ok(Math.abs(await estoque()) < 1e-9);   // estoque voltou
  assert.equal((await um('SELECT pontos FROM cliente WHERE id = ?', cli)).pontos, 0);
  assert.equal((await um('SELECT status FROM pedido WHERE id = ?', id)).status, 'cancelado');
  assert.equal((await chamar(`/api/pedidos/${id}/cancelar`, 'POST', { motivo: 'de novo' })).status, 409);   // uma vez só
  const h = (await chamar('/api/cancelamentos')).corpo.cancelamentos.find((c) => c.pedido_id === id);
  assert.equal(h.motivo, 'cliente desistiu'); assert.equal(h.operador, 'chave-de-emergência'); assert.equal(h.estorno, 'saldo'); assert.match(h.itens, /^2× /);
  // o cliente vê que o bar cancelou
  const visto = await chamar(`/api/cliente/pedidos/${id}`, 'GET', null, { 'X-Chave-Pedido': ped.corpo.chave_qr }, null);
  assert.equal(visto.corpo.status, 'cancelado'); assert.equal(visto.corpo.cancelado_pelo_bar, true);
});

test('cancelar pedido pago por Pix sem conta: precisa escolher como devolve; em preparo o estoque não volta sozinho', async () => {
  await chamar('/api/venda/pix', 'PUT', { chave: 'bar@mukifo.com' });
  const prod = await um("SELECT p.id FROM produto p WHERE p.preco_venda IS NOT NULL AND EXISTS (SELECT 1 FROM ficha_tecnica f WHERE f.produto_id = p.id) LIMIT 1");
  await abastecer(prod.id);
  const ped = await chamar('/api/cliente/pedidos', 'POST', { nome: 'Visitante', celular: '51977001122', itens: [{ produto_id: prod.id, quantidade: 1 }] }, { 'CF-Connecting-IP': '7.7.7.1' }, null); assert.equal(ped.status, 201, ped.corpo.erro);
  const id = ped.corpo.id; const cob = await um("SELECT id FROM cobranca WHERE pedido_id = ?", id);
  assert.equal((await chamar(`/api/venda/cobrancas/${cob.id}/confirmar`, 'POST', {})).status, 200);
  await chamar(`/api/producao/${id}/preparo`, 'POST', { acao: 'preparando' });
  assert.equal((await chamar(`/api/pedidos/${id}/cancelar`, 'POST', { motivo: 'erro no pedido' })).status, 400);   // pago: escolher estorno
  assert.equal((await chamar(`/api/pedidos/${id}/cancelar`, 'POST', { motivo: 'erro no pedido', estorno: 'saldo' })).status, 400);   // sem conta
  const r = await chamar(`/api/pedidos/${id}/cancelar`, 'POST', { motivo: 'erro no pedido', estorno: 'por_fora' });
  assert.equal(r.status, 200); assert.equal(r.corpo.estoque_devolvido, false); assert.ok(r.corpo.valor_estorno > 0);
  // pedido ainda não pago: cancela sem estorno
  const p2 = await chamar('/api/cliente/pedidos', 'POST', { nome: 'Visitante', celular: '51977001133', itens: [{ produto_id: prod.id, quantidade: 1 }] }, { 'CF-Connecting-IP': '7.7.7.2' }, null); assert.equal(p2.status, 201, p2.corpo.erro);
  const r2 = await chamar(`/api/pedidos/${p2.corpo.id}/cancelar`, 'POST', { motivo: 'teste' });
  assert.equal(r2.corpo.estorno, 'nenhum');
  assert.equal((await um("SELECT COUNT(*) AS n FROM cobranca WHERE pedido_id = ? AND status = 'pendente'", p2.corpo.id)).n, 0);
});
