// Monitor de Pix direto na chave: leitura da notificação, segredo, conciliação automática e manual, duplicidade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';
import { lerNotificacao } from '../src/pixmonitor.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = { DB: criarD1(['0001_inicial', '0002_lista_compras', '0003_usuarios', '0004_fotos', '0005_alerta_estoque', '0006_venda', '0007_cliente', '0008_combos', '0009_trava_estoque', '0010_estoque_recomendado', '0011_indices', '0012_financeiro', '0013_clientes_e_dias', '0014_indices_estoque', '0015_recuperar_senha', '0016_auditoria', '0017_tempo_preparo', '0018_pronta_entrega', '0019_entrega_parcial', '0020_carteira', '0021_item_pronto', '0022_campeonato', '0023_gateway', '0024_sinuca', '0025_nota_fiscal', '0026_fiscal', '0027_pix_monitor', '0028_canais', '0029_whatsapp', '0030_consentimento_whats'].map((m) => arq(`../migrations/${m}.sql`))), ADMIN_TOKEN: 'segredo-teste', ASSETS: { fetch: () => new Response('x') } };
const chamar = async (caminho, metodo = 'GET', corpo, cab = {}, token = 'segredo-teste') => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined,
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '9.9.9.9', ...(token ? { authorization: `Bearer ${token}` } : {}), ...cab } }), env);
  return { status: r.status, corpo: await r.json() };
};
const ENTRADA = '/api/pagamentos/aviso/pix-monitor', S = { 'x-pix-segredo': 'chave-do-monitor' };
const sql = (q, ...b) => env.DB.prepare(q).bind(...b).run();

test('lê só Pix recebido da notificação', () => {
  assert.deepEqual(lerNotificacao('Você recebeu um Pix de Maria Souza no valor de R$ 1.250,50'), { valor: 1250.5, pagador: 'Maria Souza' });
  assert.deepEqual(lerNotificacao('Pix recebido: R$ 25,00 de JOAO LIMA'), { valor: 25, pagador: 'JOAO LIMA' });
  assert.equal(lerNotificacao('Você enviou um Pix de R$ 50,00 para Ana'), null);
  assert.equal(lerNotificacao('Compra aprovada R$ 30,00'), null);
  assert.equal(lerNotificacao('Pix devolvido R$ 10,00 recebido de volta'), null);
});

test('monitor: segredo, aprovação automática só com cobrança única, dúvida, manual e repetição', async () => {
  assert.equal((await chamar(ENTRADA, 'POST', { valor: 10 }, {}, null)).status, 503);                // sem PIX_MONITOR_SECRET
  env.PIX_MONITOR_SECRET = 'chave-do-monitor';
  try {
    assert.equal((await chamar(ENTRADA, 'POST', { valor: 10 }, { 'x-pix-segredo': 'errado' }, null)).status, 401);
    // duas recargas de 20 e uma de 35
    await sql("INSERT INTO cliente (id, nome, celular, senha_hash) VALUES ('c1', 'Ana Lima', '51900000001', 'x'), ('c2', 'Bia Rocha', '51900000002', 'x')");
    await sql("INSERT INTO recarga (id, cliente_id, valor, expira_em) VALUES ('rec-a', 'c1', 20, datetime('now', '+30 minutes')), ('rec-b', 'c2', 20, datetime('now', '+30 minutes')), ('rec-c', 'c1', 35, datetime('now', '+30 minutes'))");

    // automático desligado: só registra e sugere
    const n1 = await chamar(ENTRADA, 'POST', { texto: 'Você recebeu um Pix de ANA LIMA no valor de R$ 35,00' }, S, null);
    assert.equal(n1.corpo.candidatos, 1); assert.equal(n1.corpo.aprovado, undefined);
    const rep = await chamar(ENTRADA, 'POST', { texto: 'Você recebeu um Pix de ANA LIMA no valor de R$ 35,00' }, S, null); assert.equal(rep.corpo.repetido, true);   // aviso repetido não duplica
    assert.equal((await chamar(ENTRADA, 'POST', { texto: 'Você enviou um Pix de R$ 5,00' }, S, null)).corpo.ignorado, 'não é um Pix recebido');

    let mon = (await chamar('/api/pagamentos/monitor')).corpo; assert.equal(mon.ligado, true); assert.equal(mon.pendentes.length, 3);
    const novo = mon.recebidos.find((x) => x.valor === 35); assert.equal(novo.candidatos[0].ref, 'rec-c');
    assert.equal((await chamar(`/api/pagamentos/monitor/${novo.id}/conciliar`, 'POST', { ref: 'rec-a' })).status, 409);   // valor diferente
    assert.equal((await chamar(`/api/pagamentos/monitor/${novo.id}/conciliar`, 'POST', { ref: 'rec-c' })).status, 200);
    assert.equal((await env.DB.prepare("SELECT saldo FROM cliente WHERE id = 'c1'").first()).saldo, 35);                  // saldo creditado
    assert.equal((await chamar(`/api/pagamentos/monitor/${novo.id}/conciliar`, 'POST', { ref: 'rec-c' })).status, 409);   // não paga duas vezes

    // automático ligado: com 2 cobranças de R$ 20 fica em dúvida; com 1 só, aprova
    assert.equal((await chamar('/api/pagamentos/monitor/config', 'PUT', { auto: true, auto_max: 100 })).status, 200);
    const d = await chamar(ENTRADA, 'POST', { valor: 20, pagador: 'Bia', id: 'E111' }, S, null); assert.equal(d.corpo.candidatos, 2); assert.equal(d.corpo.aprovado, undefined);
    await sql("UPDATE recarga SET status = 'cancelada' WHERE id = 'rec-b'");
    const a = await chamar(ENTRADA, 'POST', { valor: '20,00', pagador: 'Ana', id: 'E222' }, S, null); assert.equal(a.corpo.aprovado, 'rec-a');
    assert.equal((await env.DB.prepare("SELECT saldo FROM cliente WHERE id = 'c1'").first()).saldo, 55);
    // acima do limite automático nunca aprova sozinho
    await sql("INSERT INTO recarga (id, cliente_id, valor, expira_em) VALUES ('rec-d', 'c2', 150, datetime('now', '+30 minutes'))");
    const g = await chamar(ENTRADA, 'POST', { valor: 150, id: 'E333' }, S, null); assert.equal(g.corpo.aprovado, undefined); assert.equal(g.corpo.candidatos, 1);

    // lançamento manual e ignorar
    const man = await chamar('/api/pagamentos/monitor/manual', 'POST', { valor: 7.5, pagador: 'Cliente balcão' }); assert.equal(man.status, 200);
    mon = (await chamar('/api/pagamentos/monitor')).corpo;
    const x = mon.recebidos.find((q) => q.valor === 7.5); assert.equal((await chamar(`/api/pagamentos/monitor/${x.id}/ignorar`, 'POST', {})).status, 200);
    assert.equal((await chamar('/api/pagamentos/monitor')).corpo.recebidos.find((q) => q.id === x.id).status, 'ignorado');
  } finally { delete env.PIX_MONITOR_SECRET; }
});
