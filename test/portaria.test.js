// Portaria: páginas de gestão só para quem tem login (e o módulo). Os arquivos estáticos continuam livres.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { portaria } from '../src/portaria.js';
import { criarD1 } from './d1-falso.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = {
  DB: criarD1([arq('../migrations/0001_inicial.sql'), arq('../migrations/0002_lista_compras.sql'), arq('../migrations/0003_usuarios.sql'), arq('../migrations/0004_fotos.sql'), arq('../migrations/0005_alerta_estoque.sql'), arq('../migrations/0006_venda.sql'), arq('../migrations/0007_cliente.sql'), arq('../migrations/0008_combos.sql'), arq('../migrations/0009_trava_estoque.sql'), arq('../migrations/0010_estoque_recomendado.sql'), arq('../migrations/0011_indices.sql'), arq('../migrations/0012_financeiro.sql'), arq('../migrations/0013_clientes_e_dias.sql'), arq('../migrations/0014_indices_estoque.sql'), arq('../migrations/0015_recuperar_senha.sql'), arq('../migrations/0016_auditoria.sql'), arq('../migrations/0017_tempo_preparo.sql'), arq('../migrations/0018_pronta_entrega.sql'), arq('../migrations/0019_entrega_parcial.sql'), arq('../migrations/0020_carteira.sql'), arq('../migrations/0021_item_pronto.sql'), arq('../migrations/0022_campeonato.sql'), arq('../migrations/0023_gateway.sql'), arq('../migrations/0024_sinuca.sql'), arq('../migrations/0025_nota_fiscal.sql'), arq('../migrations/0026_fiscal.sql'), arq('../migrations/0027_pix_monitor.sql'), arq('../migrations/0028_canais.sql'), arq('../migrations/0029_whatsapp.sql'), arq('../migrations/0030_consentimento_whats.sql'), arq('../migrations/0031_campeonato_nivel.sql'), arq('../migrations/0032_jogador_titulo.sql'), arq('../migrations/0033_sinuca_resultado.sql'), arq('../migrations/0034_cancelamento.sql'), arq('../migrations/0035_seguranca.sql'), arq('../seed/seed.sql')]),
  ASSETS: { fetch: () => new Response('estatico') },
  CODIGO_PRIMEIRO_ACESSO: 'codigo-teste',
  ADMIN_TOKEN: 'segredo-teste',
};
const chamar = async (caminho, { token, cookie, corpo, metodo } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, {
    method: metodo ?? (corpo ? 'POST' : 'GET'), body: corpo ? JSON.stringify(corpo) : undefined, headers, redirect: 'manual',
  }), env);
  return { status: r.status, location: r.headers.get('location'), cache: r.headers.get('cache-control'), texto: await r.text() };
};

let tokenAtendente;

test('primeiro acesso do Dono e criação de um atendente', async () => {
  const r = await chamar('/api/auth/primeiro-acesso', { corpo: { nome: 'Ana', senha: 'senha-da-ana', codigo: 'codigo-teste' }, metodo: 'POST' });
  assert.equal(r.status, 200);
  const ana = JSON.parse(r.texto).token;
  const novo = await chamar('/api/usuarios', { token: 'segredo-teste', corpo: { nome: 'Bia', senha: 'senha-da-bia', cargo: 'atendente' } });
  assert.equal(novo.status, 200);
  const login = JSON.parse((await chamar('/api/auth/entrar', { corpo: { nome: 'Bia', senha: 'senha-da-bia' } })).texto);
  tokenAtendente = login.token;
  // senha de fábrica: troca obrigatória antes de usar as páginas
  assert.equal((await chamar('/api/auth/trocar-senha', { token: tokenAtendente, corpo: { senhaAtual: 'senha-da-bia', senhaNova: 'Atend#2026x' } })).status, 200);
  assert.ok(ana);
});

test('sem cookie: página de gestão manda entrar, com volta', async () => {
  const r = await chamar('/gestao.html');
  assert.equal(r.status, 302);
  assert.equal(r.location, '/entrar.html?volta=%2Fgestao.html');
});

test("'/' sem cookie vai para entrar; com cookie vai para o início", async () => {
  const sem = await chamar('/');
  assert.equal(sem.status, 302);
  assert.equal(sem.location, '/entrar.html');
  const com = await chamar('/', { cookie: `mk_equipe=${tokenAtendente}` });
  assert.equal(com.status, 302);
  assert.equal(com.location, '/inicio.html');
});

test('atendente com o módulo: a página abre, sem cache', async () => {
  const r = await chamar('/venda.html', { cookie: `mk_equipe=${tokenAtendente}` });
  assert.equal(r.status, 200);
  assert.equal(r.texto, 'estatico');
  assert.equal(r.cache, 'private, no-store');
});

test('atendente sem o módulo financeiro: volta para o início com aviso', async () => {
  const r = await chamar('/pix.html', { cookie: `mk_equipe=${tokenAtendente}` });
  assert.equal(r.status, 302);
  assert.equal(r.location, '/inicio.html?sem=1');
});

test('início e manual abrem para qualquer pessoa da equipe; gestão vazia não abre para o atendente', async () => {
  assert.equal((await chamar('/inicio.html', { cookie: `mk_equipe=${tokenAtendente}` })).status, 200);
  assert.equal((await chamar('/manual.html', { cookie: `mk_equipe=${tokenAtendente}` })).status, 200);
  const g = await chamar('/gestao.html', { cookie: `mk_equipe=${tokenAtendente}` });
  assert.equal(g.status, 302); assert.equal(g.location, '/inicio.html?sem=1');
});

test('/compras sem o módulo vai para o início; /compras/ com o módulo abre', async () => {
  const r = await chamar('/compras', { cookie: `mk_equipe=${tokenAtendente}` });
  assert.equal(r.status, 302);
  assert.equal(r.location, '/inicio.html?sem=1');
});

test('cookie inválido é tratado como sem login', async () => {
  const r = await chamar('/gestao.html', { cookie: 'mk_equipe=token-falso' });
  assert.equal(r.status, 302);
  assert.match(r.location, /^\/entrar\.html\?volta=/);
});

test('arquivo que não é página de gestão segue direto para o estático', async () => {
  const r = await chamar('/cliente.html');
  assert.equal(r.status, 200);
  assert.equal(r.texto, 'estatico');
  assert.equal(await portaria(new Request('https://mukifo.test/cliente.html'), env, new URL('https://mukifo.test/cliente.html')), null);
});

test('a portaria só olha GET e HEAD', async () => {
  const req = new Request('https://mukifo.test/gestao.html', { method: 'POST' });
  assert.equal(await portaria(req, env, new URL(req.url)), null);
});
