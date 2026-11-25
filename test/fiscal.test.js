// Emissão de NFC-e: montagem da nota, regras de bloqueio, emissor (com fetch simulado), consulta e cancelamento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';
import { montarNfce } from '../src/dominio/nfce.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = { DB: criarD1(['0001_inicial', '0002_lista_compras', '0003_usuarios', '0004_fotos', '0005_alerta_estoque', '0006_venda', '0007_cliente', '0008_combos', '0009_trava_estoque', '0010_estoque_recomendado', '0011_indices', '0012_financeiro', '0013_clientes_e_dias', '0014_indices_estoque', '0015_recuperar_senha', '0016_auditoria', '0017_tempo_preparo', '0018_pronta_entrega', '0019_entrega_parcial', '0020_carteira', '0021_item_pronto', '0022_campeonato', '0023_gateway', '0024_sinuca', '0025_nota_fiscal', '0026_fiscal', '0027_pix_monitor', '0028_canais', '0029_whatsapp', '0030_consentimento_whats', '0031_campeonato_nivel', '0032_jogador_titulo', '0033_sinuca_resultado'].map((m) => arq(`../migrations/${m}.sql`))), ADMIN_TOKEN: 'segredo-teste', ASSETS: { fetch: () => new Response('x') } };
const chamar = async (caminho, metodo = 'GET', corpo) => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '9.9.9.9', authorization: 'Bearer segredo-teste' } }), env);
  return { status: r.status, corpo: await r.json() };
};
const CNPJ = '11222333000181', cfg = { cnpj: CNPJ, ncm: '22030000', cfop: '5102', csosn: '102', origem: '0' };

test('montarNfce: dados do produto ou padrão, pagamento e bloqueios', () => {
  const pedido = { pagamento: 'pix', total: 30, pago_em: 'x' };
  const ok = montarNfce({ pedido, itens: [{ produto_id: 1, nome: 'Chopp', quantidade: 2, preco: 10 }, { nome: 'Porção', quantidade: 1, preco: 10, ncm: '19059090', csosn: '500', cfop: '5405' }], cfg });
  assert.equal(ok.nota.itens.length, 2); assert.equal(ok.nota.itens[1].codigo_ncm, '19059090'); assert.equal(ok.nota.itens[0].icms_situacao_tributaria, '102'); assert.deepEqual(ok.nota.formas_pagamento, [{ forma_pagamento: '17', valor_pagamento: 30 }]);
  assert.match(montarNfce({ pedido, itens: [{ nome: 'X', quantidade: 1, preco: 30 }], cfg: { ...cfg, ncm: '' } }).erros[0], /falta NCM/);
  assert.match(montarNfce({ pedido: { ...pedido, total: 50 }, itens: [{ nome: 'X', quantidade: 1, preco: 30 }], cfg }).erros[0], /não bate/);
  assert.match(montarNfce({ pedido, itens: [{ nome: 'X', quantidade: 1, preco: 30 }], cfg: { ...cfg, cnpj: '' } }).erros[0], /CNPJ/);
  assert.match(montarNfce({ pedido: { total: 5 }, itens: [{ nome: 'X', quantidade: 1, preco: 5 }], cfg }).erros[0], /não foi pago/);
});

test('emissão: desligada, sem token, bloqueios, autorização, repetição, consulta e cancelamento', async () => {
  const antes = globalThis.fetch, chamadas = []; let resposta;
  globalThis.fetch = async (url, init) => { chamadas.push({ url: String(url), metodo: init?.method, corpo: init?.body ? JSON.parse(init.body) : null, auth: init?.headers?.authorization }); return resposta(); };
  try {
    const pid = 'ped-1';
    await env.DB.prepare("INSERT INTO produto (id, nome, nome_normalizado, preco_venda) VALUES (1, 'Chopp', 'CHOPP', 10)").run();
    await env.DB.prepare("INSERT INTO pedido (id, numero, dia, origem, status, pagamento, total, pago_em) VALUES (?, 'A1', '2026-11-24', 'pos', 'entregue', 'pix', 20, datetime('now'))").bind(pid).run();
    await env.DB.prepare('INSERT INTO item_pedido (pedido_id, produto_id, nome, quantidade, preco) VALUES (?, 1, ?, 2, 10)').bind(pid, 'Chopp').run();

    assert.equal((await chamar('/api/fiscal/emitir', 'POST', { pedido_id: pid })).status, 409);                       // desligado por padrão
    assert.equal((await chamar('/api/fiscal/config', 'PUT', { emissor: 'xpto' })).status, 400);
    assert.equal((await chamar('/api/fiscal/config', 'PUT', { cnpj: '11222333000182' })).status, 400);
    assert.equal((await chamar('/api/fiscal/config', 'PUT', { emissor: 'focusnfe', cnpj: CNPJ })).status, 200);
    assert.equal((await chamar('/api/fiscal/emitir', 'POST', { pedido_id: pid })).status, 503);                       // sem token
    env.FOCUSNFE_TOKEN = 'tk-teste';
    const sem = await chamar('/api/fiscal/emitir', 'POST', { pedido_id: pid }); assert.equal(sem.status, 422); assert.match(sem.corpo.erro, /Chopp: falta NCM/);
    assert.equal(chamadas.length, 0);                                                                                 // nada saiu antes de estar completo
    assert.equal((await chamar('/api/fiscal/produtos/1', 'PUT', { ncm: '123' })).status, 400);
    assert.equal((await chamar('/api/fiscal/produtos/1', 'PUT', { ncm: '22030000', unidade: 'un' })).status, 200);

    resposta = () => new Response(JSON.stringify({ status: 'processando_autorizacao' }), { status: 202 });
    const e1 = await chamar('/api/fiscal/emitir', 'POST', { pedido_id: pid }); assert.equal(e1.status, 200); assert.equal(e1.corpo.nota.status, 'pendente');
    assert.match(chamadas[0].url, /^https:\/\/homologacao\.focusnfe\.com\.br\/v2\/nfce\?ref=mkf-ped-1-/); assert.equal(chamadas[0].auth, 'Basic ' + btoa('tk-teste:'));
    assert.equal(chamadas[0].corpo.itens[0].codigo_ncm, '22030000'); assert.equal(chamadas[0].corpo.itens[0].unidade_comercial, 'UN');
    const rep = await chamar('/api/fiscal/emitir', 'POST', { pedido_id: pid }); assert.equal(rep.corpo.repetida, true); assert.equal(chamadas.length, 1);   // não emite duas vezes

    const id = e1.corpo.nota.id;
    resposta = () => new Response(JSON.stringify({ status: 'autorizado', numero: '15', serie: '1', chave_nfe: 'NFe43' + '0'.repeat(40), protocolo: 'P1', caminho_danfe: '/danfe/x.pdf', caminho_xml_nota_fiscal: '/xml/x.xml' }));
    const c = await chamar(`/api/fiscal/notas/${id}/consultar`, 'POST'); assert.equal(c.corpo.nota.status, 'autorizada'); assert.equal(c.corpo.nota.url_danfe, 'https://homologacao.focusnfe.com.br/danfe/x.pdf'); assert.equal(c.corpo.nota.numero, '15');

    assert.equal((await chamar(`/api/fiscal/notas/${id}/cancelar`, 'POST', { justificativa: 'curta' })).status, 400);
    resposta = () => new Response(JSON.stringify({ status: 'erro_cancelamento', mensagem: 'Prazo excedido' }), { status: 422 });
    const nao = await chamar(`/api/fiscal/notas/${id}/cancelar`, 'POST', { justificativa: 'Pedido lançado em duplicidade' }); assert.equal(nao.status, 422); assert.match(nao.corpo.erro, /Prazo/);
    resposta = () => new Response(JSON.stringify({ status: 'cancelado', protocolo: 'P2' }));
    assert.equal((await chamar(`/api/fiscal/notas/${id}/cancelar`, 'POST', { justificativa: 'Pedido lançado em duplicidade' })).corpo.nota.status, 'cancelada');

    // rejeitada pelo emissor/SEFAZ: guarda o motivo e libera nova tentativa
    resposta = () => new Response(JSON.stringify({ status: 'erro_autorizacao', mensagem_sefaz: 'Rejeição 391: CSC inválido' }), { status: 422 });
    const rej = await chamar('/api/fiscal/emitir', 'POST', { pedido_id: pid }); assert.equal(rej.corpo.nota.status, 'rejeitada'); assert.match(rej.corpo.nota.mensagem, /CSC/);
    resposta = () => new Response('', { status: 503 });
    assert.equal((await chamar('/api/fiscal/emitir', 'POST', { pedido_id: pid })).corpo.nota.status, 'erro');
    const painel = (await chamar('/api/fiscal')).corpo; assert.equal(painel.token_ok, true); assert.equal(painel.sem_ncm, 0); assert.ok(painel.notas.length >= 3);
    assert.equal((await chamar('/api/fiscal/emitir', 'POST', { pedido_id: 'nao-existe' })).status, 404);
  } finally { globalThis.fetch = antes; delete env.FOCUSNFE_TOKEN; }
});
