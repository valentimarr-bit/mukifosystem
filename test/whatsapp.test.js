// Convite automático por WhatsApp (izapia): fila, ritmo, teto, recusa, erro de credencial e uma mensagem por cliente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';
import { processarFila, numeroWhats } from '../src/whatsapp.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = { DB: criarD1(['0001_inicial', '0002_lista_compras', '0003_usuarios', '0004_fotos', '0005_alerta_estoque', '0006_venda', '0007_cliente', '0008_combos', '0009_trava_estoque', '0010_estoque_recomendado', '0011_indices', '0012_financeiro', '0013_clientes_e_dias', '0014_indices_estoque', '0015_recuperar_senha', '0016_auditoria', '0017_tempo_preparo', '0018_pronta_entrega', '0019_entrega_parcial', '0020_carteira', '0021_item_pronto', '0022_campeonato', '0023_gateway', '0024_sinuca', '0025_nota_fiscal', '0026_fiscal', '0027_pix_monitor', '0028_canais', '0029_whatsapp'].map((m) => arq(`../migrations/${m}.sql`))), ADMIN_TOKEN: 'segredo-teste', ASSETS: { fetch: () => new Response('x') }, URL_PUBLICA: 'https://mukifo.test' };
const chamar = async (caminho, metodo = 'GET', corpo) => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '9.9.9.9', authorization: 'Bearer segredo-teste' } }), env);
  return { status: r.status, corpo: await r.json() };
};
const sql = (q, ...b) => env.DB.prepare(q).bind(...b).run();
const um = (q, ...b) => env.DB.prepare(q).bind(...b).first();
const G = '/api/campeonato/gestao';

test('números: só celular brasileiro válido, sempre com 55', () => {
  assert.equal(numeroWhats('(51) 99999-1234'), '5551999991234');
  assert.equal(numeroWhats('5551999991234'), '5551999991234');
  assert.equal(numeroWhats('51 3333-1234'), '555133331234');
  assert.equal(numeroWhats('12345'), null);
  assert.equal(numeroWhats(null), null);
});

test('convite automático: liga só com credencial, enfileira quem pode, manda devagar, respeita recusa, teto e erro de credencial', async () => {
  const antes = globalThis.fetch, envios = []; let resposta = () => new Response('{}');
  globalThis.fetch = async (url, init) => { envios.push({ url: String(url), auth: init.headers.authorization, corpo: JSON.parse(init.body) }); return resposta(); };
  try {
    for (const [id, nome, cel, ativo] of [['c1', 'Ana Souza', '51999990001', 1], ['c2', 'Bruno Lima', '(51) 99999-0002', 1], ['c3', 'Carla Dias', '51999990003', 1], ['c4', 'Diego Reis', '51999990004', 1], ['c5', 'Eva Rocha', '51999990005', 1], ['c6', 'Sem Numero', null, 1], ['c7', 'Numero Torto', '123', 1], ['c8', 'Inativo', '51999990008', 0]])
      await sql('INSERT INTO cliente (id, nome, celular, ativo) VALUES (?, ?, ?, ?)', id, nome, cel, ativo);
    await sql("UPDATE cliente SET whats_recusou = 1 WHERE id = 'c5'");
    const camp = (await chamar(`${G}/campeonatos`, 'POST', { nome: 'Copa Mukifo' })).corpo.id;

    assert.equal((await chamar(`${G}/whats`)).corpo.configurado, false);
    assert.equal((await chamar(`${G}/whats`, 'PUT', { ativo: true })).status, 409);                    // sem IZAPIA_API_KEY/SID
    const semLigar = await chamar(`${G}/campeonatos/${camp}/modalidades`, 'POST', { nome: 'Bola 8', taxa: 20 });
    assert.equal(semLigar.corpo.convite, null);                                                         // desligado: nada vai para a fila
    assert.equal((await um('SELECT COUNT(*) AS n FROM convite_whats')).n, 0);
    assert.equal((await chamar(`${G}/modalidades/${semLigar.corpo.id}/convidar`, 'POST')).status, 409);

    Object.assign(env, { IZAPIA_API_KEY: 'chave', IZAPIA_SID: 'sessao-1' });
    assert.equal((await chamar(`${G}/whats`, 'PUT', { ativo: true, por_minuto: 2 })).status, 200);
    const mod = await chamar(`${G}/campeonatos/${camp}/modalidades`, 'POST', { nome: 'Bola 9', taxa: 15 });
    assert.deepEqual(mod.corpo.convite, { na_fila: 4 });                                                // c1..c4: sem número, número torto, inativo e recusa ficam de fora
    assert.equal((await chamar(`${G}/modalidades/${mod.corpo.id}/convidar`, 'POST')).corpo.na_fila, 0); // ninguém é convidado duas vezes
    const modAntiga = semLigar.corpo.id;
    assert.equal((await chamar(`${G}/modalidades/${modAntiga}/convidar`, 'POST')).corpo.na_fila, 4);

    assert.equal((await processarFila(env.DB, env)).enviados, 2);                                       // ritmo: 2 por minuto
    assert.equal(envios.length, 2);
    assert.equal(envios[0].url, 'https://api.izapia.com/api/v1/sessions/sessao-1/messages/text');
    assert.equal(envios[0].auth, 'Bearer chave');
    assert.equal(envios[0].corpo.to, '5551999990001');
    assert.match(envios[0].corpo.text, /^Oi, Ana! .*Copa Mukifo \(Bola 9\).*R\$ 15,00.*https:\/\/mukifo\.test\/campeonato\.html/s);

    await chamar(`${G}/whats/recusa`, 'POST', { celular: '(51) 99999-0003' });                           // pediu no balcão para não receber
    assert.equal((await processarFila(env.DB, env)).enviados, 2);
    assert.equal((await um("SELECT COUNT(*) AS n FROM convite_whats WHERE status = 'cancelado' AND erro = 'cliente não quer receber'")).n, 1);   // c3 saiu da fila

    resposta = () => new Response('sessão desconectada', { status: 500 });                              // izapia fora do ar: tenta de novo depois
    const x = await processarFila(env.DB, env); assert.equal(x.enviados, 0);
    assert.ok((await um("SELECT COUNT(*) AS n FROM convite_whats WHERE status = 'fila' AND tentativas = 1")).n >= 1);

    resposta = () => new Response('chave inválida', { status: 401 });                                   // credencial recusada: para tudo, sem insistir
    const antesLen = envios.length; const y = await processarFila(env.DB, env); assert.match(y.parado, /credencial/);
    assert.equal(envios.length, antesLen + 1);
    assert.match((await chamar(`${G}/whats`)).corpo.ultimo_erro, /401/);

    resposta = () => new Response('{}');
    await chamar(`${G}/whats`, 'PUT', { max_dia: 3 });                                                  // já foram 4 hoje: teto
    assert.deepEqual(await processarFila(env.DB, env), { enviados: 0, parado: 'teto do dia' });

    await chamar(`${G}/whats`, 'PUT', { max_dia: 100 });
    await sql("UPDATE modalidade SET status = 'andamento'");                                            // inscrições encerradas: o que sobrou na fila é cancelado
    await processarFila(env.DB, env);
    assert.equal((await um("SELECT COUNT(*) AS n FROM convite_whats WHERE status = 'fila'")).n, 0);
    const est = (await chamar(`${G}/whats`)).corpo; assert.equal(est.ativo, true); assert.equal(est.enviados, 4);

    await chamar(`${G}/whats`, 'PUT', { ativo: false });
    assert.deepEqual(await processarFila(env.DB, env), { enviados: 0, parado: 'desligado' });
  } finally { globalThis.fetch = antes; }
});
