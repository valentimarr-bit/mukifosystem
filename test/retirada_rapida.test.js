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


test('QR de retirada: pedido de 1 item sai numa ida só (auto); com 2 itens só mostra a lista', async () => {
  await chamar('/api/venda/pix', 'PUT', { chave: 'bar@mukifo.com' });
  const prod = await um("SELECT p.id FROM produto p WHERE p.preco_venda IS NOT NULL AND EXISTS (SELECT 1 FROM ficha_tecnica f WHERE f.produto_id = p.id) LIMIT 1");
  await abastecer(prod.id);
  const pagar = async (q, ip) => { const ped = await chamar('/api/cliente/pedidos', 'POST', { nome: 'Rui', celular: '5197700' + ip.replace(/\D/g, '').slice(-4), itens: [{ produto_id: prod.id, quantidade: q }] }, { 'CF-Connecting-IP': ip }, null);
    assert.equal(ped.status, 201, ped.corpo.erro); const cob = await um('SELECT id FROM cobranca WHERE pedido_id = ?', ped.corpo.id);
    assert.equal((await chamar(`/api/venda/cobrancas/${cob.id}/confirmar`, 'POST', {})).status, 200); return `MKF1.${ped.corpo.id}.${ped.corpo.chave_qr}.0`; };
  const um1 = await pagar(1, '8.8.8.1');
  const r = await chamar('/api/venda/retirada', 'POST', { codigo: um1, auto: true });
  assert.equal(r.status, 200); assert.equal(r.corpo.entregue, true);
  assert.equal((await chamar('/api/venda/retirada', 'POST', { codigo: um1, auto: true })).status, 409);   // QR já usado
  const dois = await pagar(2, '8.8.8.2');
  const v = await chamar('/api/venda/retirada', 'POST', { codigo: dois, auto: true });
  assert.equal(v.corpo.entregue, false); assert.equal(v.corpo.pedido.itens[0].falta, 2);   // mais de uma unidade: o balcão marca o que sai
  assert.equal(v.corpo.pedido.numero.length > 0, true);
});
