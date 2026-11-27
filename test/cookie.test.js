// Cookie de página: a equipe entra e o navegador guarda mk_equipe (HttpOnly). A API continua só com Bearer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';
import { lerCookie } from '../src/auth.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = {
  DB: criarD1([arq('../migrations/0001_inicial.sql'), arq('../migrations/0002_lista_compras.sql'), arq('../migrations/0003_usuarios.sql'), arq('../migrations/0004_fotos.sql'), arq('../migrations/0005_alerta_estoque.sql'), arq('../migrations/0006_venda.sql'), arq('../migrations/0007_cliente.sql'), arq('../migrations/0008_combos.sql'), arq('../migrations/0009_trava_estoque.sql'), arq('../migrations/0010_estoque_recomendado.sql'), arq('../migrations/0011_indices.sql'), arq('../migrations/0012_financeiro.sql'), arq('../migrations/0013_clientes_e_dias.sql'), arq('../migrations/0014_indices_estoque.sql'), arq('../migrations/0015_recuperar_senha.sql'), arq('../migrations/0016_auditoria.sql'), arq('../migrations/0017_tempo_preparo.sql'), arq('../migrations/0018_pronta_entrega.sql'), arq('../migrations/0019_entrega_parcial.sql'), arq('../migrations/0020_carteira.sql'), arq('../migrations/0021_item_pronto.sql'), arq('../migrations/0022_campeonato.sql'), arq('../migrations/0023_gateway.sql'), arq('../migrations/0024_sinuca.sql'), arq('../migrations/0025_nota_fiscal.sql'), arq('../migrations/0026_fiscal.sql'), arq('../migrations/0027_pix_monitor.sql'), arq('../migrations/0028_canais.sql'), arq('../migrations/0029_whatsapp.sql'), arq('../migrations/0030_consentimento_whats.sql'), arq('../migrations/0031_campeonato_nivel.sql'), arq('../migrations/0032_jogador_titulo.sql'), arq('../migrations/0033_sinuca_resultado.sql'), arq('../migrations/0034_cancelamento.sql'), arq('../migrations/0035_seguranca.sql'), arq('../seed/seed.sql')]),
  ASSETS: { fetch: () => new Response('estatico') },
  CODIGO_PRIMEIRO_ACESSO: 'codigo-teste',
};
// Devolve o corpo, o status e os cabeçalhos; cookie opcional (sem Bearer).
const chamar = async (caminho, corpo, { token, cookie, metodo } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, {
    method: metodo ?? (corpo ? 'POST' : 'GET'), body: corpo ? JSON.stringify(corpo) : undefined, headers,
  }), env);
  return { status: r.status, corpo: await r.json(), cabecalhos: r.headers };
};

let token;

test('o primeiro acesso devolve o cookie mk_equipe, HttpOnly, por 14 dias', async () => {
  const r = await chamar('/api/auth/primeiro-acesso', { nome: 'Ana', senha: 'senha-da-ana', codigo: 'codigo-teste' });
  assert.equal(r.status, 200);
  token = r.corpo.token;
  const sc = r.cabecalhos.get('set-cookie');
  assert.match(sc, /^mk_equipe=/);
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /Max-Age=1209600/);   // 14 dias
});

test('a API não aceita o cookie: GET /api/auth/eu só com cookie dá 401; com o Bearer, 200', async () => {
  assert.equal((await chamar('/api/auth/eu', null, { cookie: `mk_equipe=${token}` })).status, 401);
  assert.equal((await chamar('/api/auth/eu', null, { token })).status, 200);
});

test('o cookie é pedido com o Bearer em POST /api/auth/cookie; sem Bearer dá 401', async () => {
  const r = await chamar('/api/auth/cookie', {}, { token });
  assert.equal(r.status, 200);
  assert.match(r.cabecalhos.get('set-cookie'), /^mk_equipe=/);
  assert.equal((await chamar('/api/auth/cookie', {})).status, 401);
});

test('entrar devolve set-cookie com mk_equipe e HttpOnly', async () => {
  const r = await chamar('/api/auth/entrar', { nome: 'Ana', senha: 'senha-da-ana' });
  assert.equal(r.status, 200);
  const sc = r.cabecalhos.get('set-cookie');
  assert.match(sc, /^mk_equipe=/);
  assert.match(sc, /HttpOnly/);
});

test('sair devolve set-cookie com Max-Age=0', async () => {
  const r = await chamar('/api/auth/sair', {}, { token });
  assert.equal(r.status, 200);
  assert.match(r.cabecalhos.get('set-cookie'), /^mk_equipe=; Path=\/; Max-Age=0$/);
});

test('lerCookie acha o valor pelo nome', () => {
  const req = new Request('https://x.test/', { headers: { cookie: 'a=1; mk_equipe=abc123; b=2' } });
  assert.equal(lerCookie(req, 'mk_equipe'), 'abc123');
  assert.equal(lerCookie(req, 'nao-existe'), null);
  assert.equal(lerCookie(new Request('https://x.test/'), 'mk_equipe'), null);
});
