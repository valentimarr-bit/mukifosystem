// Fila da sinuca: só com cadastro, localização, chamada, "terminou", conduta e bloqueio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';
import { distanciaM, nivelDeConduta } from '../src/sinuca.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = { DB: criarD1(['0001_inicial', '0002_lista_compras', '0003_usuarios', '0004_fotos', '0005_alerta_estoque', '0006_venda', '0007_cliente', '0008_combos', '0009_trava_estoque', '0010_estoque_recomendado', '0011_indices', '0012_financeiro', '0013_clientes_e_dias', '0014_indices_estoque', '0015_recuperar_senha', '0016_auditoria', '0017_tempo_preparo', '0018_pronta_entrega', '0019_entrega_parcial', '0020_carteira', '0021_item_pronto', '0022_campeonato', '0023_gateway', '0024_sinuca', '0025_nota_fiscal', '0026_fiscal', '0027_pix_monitor', '0028_canais', '0029_whatsapp'].map((m) => arq(`../migrations/${m}.sql`))), ADMIN_TOKEN: 'segredo-teste', ASSETS: { fetch: () => new Response('x') } };
let ip = 10;
const chamar = async (caminho, metodo = 'GET', corpo, cab = {}, token = 'segredo-teste') => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined,
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': `9.9.9.${ip++ % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}), ...cab } }), env);
  return { status: r.status, corpo: await r.json() };
};
const BAR = { lat: -30.0346, lng: -51.2177 };
const NO_BAR = { ...BAR, precisao: 20 }, LONGE = { lat: -30.05, lng: -51.2, precisao: 20 };
let n = 0;
const cliente = async (nome) => { const r = await chamar('/api/conta/cadastro', 'POST', { nome, celular: `(51) 98888-${String(1000 + n++)}`, senha: 'segredo1', aceite: true }, {}, null); return { 'X-Sessao-Cliente': r.corpo.token }; };
const C = (h, caminho, corpo = {}, m = 'POST') => chamar(caminho, m, m === 'GET' ? undefined : corpo, h, null);
const sql = (q, ...b) => env.DB.prepare(q).bind(...b).run();

test('distância e níveis', () => {
  assert.ok(distanciaM(BAR.lat, BAR.lng, BAR.lat, BAR.lng) < 1);
  const d = distanciaM(BAR.lat, BAR.lng, -30.05, -51.2); assert.ok(d > 1500 && d < 2500);
  assert.equal(nivelDeConduta(100, false), 'Ótima'); assert.equal(nivelDeConduta(75, false), 'Boa'); assert.equal(nivelDeConduta(65, false), 'Atenção'); assert.equal(nivelDeConduta(100, true), 'Bloqueado');
});

test('fila: cadastro obrigatório, localização, chamada, cheguei, terminou e conduta', async () => {
  const G = '/api/sinuca/gestao';
  assert.equal((await chamar('/api/sinuca/entrar', 'POST', {}, {}, null)).status, 401);          // sem cadastro
  const ana = await cliente('Ana Lima'), bia = await cliente('Bia Rocha'), caio = await cliente('Caio Dias');
  assert.equal((await C(ana, '/api/sinuca/entrar', NO_BAR)).status, 503);                          // bar sem localização marcada
  assert.equal((await chamar(`${G}/local`, 'POST', { lat: 999, lng: 0 })).status, 400);
  assert.equal((await chamar(`${G}/local`, 'POST', { ...BAR, raio_m: 100 })).status, 200);
  const mesa = (await chamar(`${G}/mesas`, 'POST', { nome: 'Mesa 1' })).corpo.id;

  assert.equal((await C(ana, '/api/sinuca/entrar', LONGE)).status, 403);                           // de longe não entra
  assert.equal((await C(ana, '/api/sinuca/entrar', { ...BAR, precisao: 900 })).status, 400);       // GPS ruim
  assert.equal((await C(ana, '/api/sinuca/entrar', {})).status, 400);                              // sem localização

  const e1 = await C(ana, '/api/sinuca/entrar', NO_BAR); assert.equal(e1.status, 201);
  assert.equal(e1.corpo.minha.status, 'chamado');                                                  // mesa livre: chamada na hora
  assert.equal((await C(ana, '/api/sinuca/entrar', NO_BAR)).status, 409);                          // uma vaga por pessoa
  const e2 = await C(bia, '/api/sinuca/entrar', { ...NO_BAR, nome: 'Bia' }); assert.equal(e2.corpo.minha.pos, 1);
  assert.equal((await C(caio, '/api/sinuca/entrar', NO_BAR)).corpo.minha.pos, 2);

  assert.equal((await C(bia, '/api/sinuca/cheguei')).status, 409);                                 // não foi chamada
  assert.equal((await C(ana, '/api/sinuca/cheguei', LONGE)).status, 403);                          // chegada também confere local
  assert.equal((await C(ana, '/api/sinuca/cheguei', NO_BAR)).corpo.minha.status, 'jogando');

  // Bia (espera) avisa que terminou: abre janela; Ana contesta → Bia perde pontos
  assert.equal((await C(bia, `/api/sinuca/mesas/${mesa}/terminou`, LONGE)).status, 403);
  assert.equal((await C(bia, `/api/sinuca/mesas/${mesa}/terminou`, NO_BAR)).status, 200);
  assert.equal((await C(bia, `/api/sinuca/mesas/${mesa}/ainda-jogando`)).status, 403);            // só quem joga contesta
  assert.equal((await C(ana, `/api/sinuca/mesas/${mesa}/ainda-jogando`)).status, 200);
  const cb = (await chamar(`${G}`)).corpo.conduta.find((c) => c.nome === 'Bia Rocha'); assert.equal(cb.pontos, 75);
  assert.equal((await C(bia, `/api/sinuca/mesas/${mesa}/terminou`, NO_BAR)).status, 403);         // relato contestado: não pode mais avisar

  // Caio avisa, ninguém contesta e o tempo passa → mesa libera e chama Bia
  assert.equal((await C(caio, `/api/sinuca/mesas/${mesa}/terminou`, NO_BAR)).status, 200);
  await sql("UPDATE mesa_sinuca SET liberando_em = datetime('now', '-2 minutes') WHERE id = ?", mesa);
  const est = await C(bia, '/api/sinuca', {}, 'GET'); assert.equal(est.corpo.minha.status, 'chamado');
  assert.equal((await C(ana, '/api/sinuca', {}, 'GET')).corpo.minha, null);                       // Ana terminou
  const pa = (await chamar(G)).corpo; assert.equal(pa.fila.find((f) => f.nome === 'Bia').status, 'chamado');

  // Bia não aparece: expira, perde 15 pontos, mesa vai para Caio
  await sql("UPDATE mesa_sinuca SET desde = datetime('now', '-10 minutes') WHERE id = ?", mesa);
  const est2 = await C(caio, '/api/sinuca', {}, 'GET'); assert.equal(est2.corpo.minha.status, 'chamado');
  assert.equal((await chamar(G)).corpo.conduta.find((c) => c.nome === 'Bia Rocha').pontos, 60 + 10);   // 75 − 15 = 60 → bloqueio e volta a 70
  assert.ok((await C(bia, '/api/sinuca', {}, 'GET')).corpo.conduta.bloqueado_ate);
  assert.equal((await C(bia, '/api/sinuca/entrar', NO_BAR)).status, 403);                         // bloqueada

  // dois clientes diferentes confirmam: libera na hora; equipe perdoa
  assert.equal((await C(caio, '/api/sinuca/cheguei', NO_BAR)).corpo.minha.status, 'jogando');
  const cid = (await env.DB.prepare("SELECT cliente_id FROM sinuca_conduta WHERE bloqueado_ate IS NOT NULL").first()).cliente_id;
  assert.equal((await chamar(`${G}/clientes/${cid}/perdoar`, 'POST', {})).status, 200);
  assert.equal((await C(bia, '/api/sinuca/entrar', NO_BAR)).status, 201);
  assert.equal((await C(caio, `/api/sinuca/mesas/${mesa}/terminou`, NO_BAR)).corpo.minha, null);   // o próprio jogador libera na hora
  assert.equal((await C(bia, '/api/sinuca', {}, 'GET')).corpo.minha.status, 'chamado');
});

test('sinuca: equipe precisa do módulo e a leitura pública não vaza nome completo', async () => {
  assert.equal((await chamar('/api/sinuca/gestao', 'GET', undefined, {}, null)).status, 401);
  const pub = await chamar('/api/sinuca', 'GET', undefined, {}, null); assert.equal(pub.status, 200);
  for (const f of pub.corpo.fila) assert.ok(!/\s\S{2,}$/.test(f.nome));
});
