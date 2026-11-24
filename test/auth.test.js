// Login: primeiro acesso vira superadmin, troca de senha e passagem do cargo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = {
  DB: criarD1([arq('../migrations/0001_inicial.sql'), arq('../migrations/0002_lista_compras.sql'), arq('../migrations/0003_usuarios.sql'), arq('../migrations/0004_fotos.sql'), arq('../migrations/0005_alerta_estoque.sql'), arq('../migrations/0006_venda.sql'), arq('../migrations/0007_cliente.sql'), arq('../migrations/0008_combos.sql'), arq('../migrations/0009_trava_estoque.sql'), arq('../migrations/0010_estoque_recomendado.sql'), arq('../migrations/0011_indices.sql'), arq('../migrations/0012_financeiro.sql'), arq('../migrations/0013_clientes_e_dias.sql'), arq('../migrations/0014_indices_estoque.sql'), arq('../migrations/0015_recuperar_senha.sql'), arq('../migrations/0016_auditoria.sql'), arq('../migrations/0017_tempo_preparo.sql'), arq('../migrations/0018_pronta_entrega.sql'), arq('../migrations/0019_entrega_parcial.sql'), arq('../migrations/0020_carteira.sql'), arq('../migrations/0021_item_pronto.sql'), arq('../migrations/0022_campeonato.sql'), arq('../migrations/0023_gateway.sql'), arq('../migrations/0024_sinuca.sql'), arq('../migrations/0025_nota_fiscal.sql'), arq('../migrations/0026_fiscal.sql'), arq('../migrations/0027_pix_monitor.sql'), arq('../migrations/0028_canais.sql'), arq('../seed/seed.sql')]),
  ASSETS: { fetch: () => new Response('estatico') },
  CODIGO_PRIMEIRO_ACESSO: 'codigo-teste',
};
const chamar = async (caminho, corpo, token, method) => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, {
    method: method ?? (corpo ? 'POST' : 'GET'), body: corpo ? JSON.stringify(corpo) : undefined,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), env);
  return { status: r.status, corpo: await r.json() };
};

test('sem ninguém cadastrado, o sistema pede o primeiro acesso e nada de escrita funciona', async () => {
  assert.equal((await chamar('/api/auth/estado')).corpo.primeiroAcesso, true);
  assert.equal((await chamar('/api/listas/atual')).status, 401);
});

let tokenA, tokenB, idB;
test('o primeiro a entrar vira superadmin e o segundo não consegue', async () => {
  assert.equal((await chamar('/api/auth/primeiro-acesso', { nome: 'Ana', senha: '123', codigo: 'codigo-teste' })).status, 400); // senha curta
  const r = await chamar('/api/auth/primeiro-acesso', { nome: 'Ana', senha: 'senha-da-ana', codigo: 'codigo-teste' });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.usuario.papel, 'superadmin');
  tokenA = r.corpo.token;
  assert.equal((await chamar('/api/auth/primeiro-acesso', { nome: 'Intruso', senha: 'outra-senha', codigo: 'codigo-teste' })).status, 409);
  assert.equal((await chamar('/api/auth/estado')).corpo.primeiroAcesso, false);
});

test('entrar: senha errada é recusada; o token libera as rotas com senha', async () => {
  assert.equal((await chamar('/api/auth/entrar', { nome: 'Ana', senha: 'errada' })).status, 401);
  const ok = await chamar('/api/auth/entrar', { nome: 'ana', senha: 'senha-da-ana' }); // nome sem diferenciar maiúscula
  assert.equal(ok.status, 200);
  assert.notEqual((await chamar('/api/listas/atual', null, ok.corpo.token)).status, 401);
  assert.equal((await chamar('/api/auth/eu', null, 'token-falso')).status, 401);
});

test('superadmin cria gerente; gerente não cria ninguém', async () => {
  assert.equal((await chamar('/api/usuarios', { nome: 'Beto', senha: 'senha-do-beto' }, tokenA)).status, 200);
  const lista = (await chamar('/api/usuarios', null, tokenA)).corpo;
  idB = lista.find((u) => u.nome === 'Beto').id;
  tokenB = (await chamar('/api/auth/entrar', { nome: 'Beto', senha: 'senha-do-beto' })).corpo.token;
  assert.equal((await chamar('/api/usuarios', { nome: 'X', senha: 'xxxxxxx' }, tokenB)).status, 403);
});

test('trocar a própria senha derruba os outros aparelhos', async () => {
  const outro = (await chamar('/api/auth/entrar', { nome: 'Ana', senha: 'senha-da-ana' })).corpo.token;
  assert.equal((await chamar('/api/auth/trocar-senha', { senhaAtual: 'errada', senhaNova: 'nova-senha-1' }, tokenA)).status, 403);
  assert.equal((await chamar('/api/auth/trocar-senha', { senhaAtual: 'senha-da-ana', senhaNova: 'nova-senha-1' }, tokenA)).status, 200);
  assert.equal((await chamar('/api/auth/eu', null, outro)).status, 401);
  assert.equal((await chamar('/api/auth/eu', null, tokenA)).status, 200);
  assert.equal((await chamar('/api/auth/entrar', { nome: 'Ana', senha: 'nova-senha-1' })).status, 200);
});

test('passar o cargo: exige a senha; quem passa vira gerente e o novo vira superadmin', async () => {
  assert.equal((await chamar('/api/auth/passar-cargo', { usuarioId: idB, senha: 'errada' }, tokenA)).status, 403);
  assert.equal((await chamar('/api/auth/passar-cargo', { usuarioId: idB, senha: 'nova-senha-1' }, tokenA)).status, 200);
  assert.equal((await chamar('/api/auth/eu', null, tokenA)).corpo.usuario.papel, 'gerente');
  assert.equal((await chamar('/api/auth/eu', null, tokenB)).corpo.usuario.papel, 'superadmin');
  assert.equal((await chamar('/api/usuarios', null, tokenA)).status, 403);
});

test('código de primeiro acesso é obrigatório', async () => {
  const env2 = { ...env, DB: criarD1([arq('../migrations/0001_inicial.sql'), arq('../migrations/0002_lista_compras.sql'), arq('../migrations/0003_usuarios.sql')]), CODIGO_PRIMEIRO_ACESSO: 'abc123' };
  const t = (corpo) => worker.fetch(new Request('https://x.test/api/auth/primeiro-acesso', { method: 'POST', body: JSON.stringify(corpo) }), env2);
  assert.equal((await t({ nome: 'Ana', senha: 'senha-longa' })).status, 403);
  const semCodigo = { ...env2, CODIGO_PRIMEIRO_ACESSO: undefined };
  const r = await worker.fetch(new Request('https://x.test/api/auth/primeiro-acesso', { method: 'POST', body: JSON.stringify({ nome: 'Ana', senha: 'senha-longa' }) }), semCodigo);
  assert.equal(r.status, 503);
  assert.equal((await t({ nome: 'Ana', senha: 'senha-longa', codigo: 'abc123' })).status, 200);
});
