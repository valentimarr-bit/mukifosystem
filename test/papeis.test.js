// Cargos (dono, gerente, atendente) e gestão de logins pelo superadmin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = {
  DB: criarD1([arq('../migrations/0001_inicial.sql'), arq('../migrations/0002_lista_compras.sql'), arq('../migrations/0003_usuarios.sql'), arq('../migrations/0004_fotos.sql'), arq('../migrations/0005_alerta_estoque.sql'), arq('../migrations/0006_venda.sql'), arq('../migrations/0007_cliente.sql'), arq('../migrations/0008_combos.sql'), arq('../migrations/0009_trava_estoque.sql'), arq('../migrations/0010_estoque_recomendado.sql'), arq('../migrations/0011_indices.sql'), arq('../migrations/0012_financeiro.sql'), arq('../migrations/0013_clientes_e_dias.sql'), arq('../migrations/0014_indices_estoque.sql'), arq('../migrations/0015_recuperar_senha.sql'), arq('../migrations/0016_auditoria.sql'), arq('../migrations/0017_tempo_preparo.sql'), arq('../migrations/0018_pronta_entrega.sql'), arq('../migrations/0019_entrega_parcial.sql'), arq('../migrations/0020_carteira.sql'), arq('../migrations/0021_item_pronto.sql'), arq('../migrations/0022_campeonato.sql'), arq('../migrations/0023_gateway.sql'), arq('../migrations/0024_sinuca.sql'), arq('../migrations/0025_nota_fiscal.sql'), arq('../migrations/0026_fiscal.sql'), arq('../migrations/0027_pix_monitor.sql'), arq('../migrations/0028_canais.sql'), arq('../migrations/0029_whatsapp.sql'), arq('../migrations/0030_consentimento_whats.sql'), arq('../migrations/0031_campeonato_nivel.sql'), arq('../migrations/0032_jogador_titulo.sql'), arq('../migrations/0033_sinuca_resultado.sql'), arq('../migrations/0034_cancelamento.sql'), arq('../migrations/0035_seguranca.sql'), arq('../seed/seed.sql')]),
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

let tokenDono, tokenGerente, idGerente, tokenAtendente, idAtendente;

test('o primeiro acesso cria o Dono, com papel superadmin e cargo Dono', async () => {
  const r = await chamar('/api/auth/primeiro-acesso', { nome: 'Ana', senha: 'senha-da-ana', codigo: 'codigo-teste' });
  assert.equal(r.status, 200);
  tokenDono = r.corpo.token;
  const eu = await chamar('/api/auth/eu', null, tokenDono);
  assert.equal(eu.corpo.usuario.papel, 'superadmin');
  assert.equal(eu.corpo.usuario.cargo, 'Dono');
});

test('POST /api/usuarios: cargo padrão é gerente; cargo fora da lista é recusado', async () => {
  assert.equal((await chamar('/api/usuarios', { nome: 'Beto', senha: 'senha-do-beto', cargo: 'dono' }, tokenDono)).status, 400);
  assert.equal((await chamar('/api/usuarios', { nome: 'Beto', senha: 'senha-do-beto' }, tokenDono)).status, 200);
  const lista = (await chamar('/api/usuarios', null, tokenDono)).corpo;
  const beto = lista.find((u) => u.nome === 'Beto');
  idGerente = beto.id;
  assert.equal(beto.papel, 'gerente');
  assert.equal((await chamar('/api/usuarios', { nome: 'Carla', senha: 'senha-da-carla', cargo: 'atendente' }, tokenDono)).status, 200);
  idAtendente = (await chamar('/api/usuarios', null, tokenDono)).corpo.find((u) => u.nome === 'Carla').id;
});

test('atendente: login devolve papel atendente e não alcança o financeiro', async () => {
  const r = await chamar('/api/auth/entrar', { nome: 'Carla', senha: 'senha-da-carla' });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.usuario.papel, 'atendente');
  tokenAtendente = r.corpo.token;
  assert.equal((await chamar('/api/financeiro/resultado', null, tokenAtendente)).status, 403);
  const beto = await chamar('/api/auth/entrar', { nome: 'Beto', senha: 'senha-do-beto' });
  assert.equal(beto.corpo.usuario.papel, 'gerente');
  tokenGerente = beto.corpo.token;
});

test('gerente não edita login; o Dono edita e o token antigo cai ao desativar', async () => {
  assert.equal((await chamar('/api/usuarios/1', { ativo: false }, tokenGerente, 'PUT')).status, 403);
  assert.equal((await chamar('/api/usuarios/' + idGerente, { cargo: 'atendente' }, tokenGerente, 'PUT')).status, 403);
  assert.equal((await chamar('/api/usuarios/' + idGerente, { cargo: 'chefe' }, tokenDono, 'PUT')).status, 400);
  assert.equal((await chamar('/api/usuarios/1', { ativo: false }, tokenDono, 'PUT')).status, 409); // o Dono não se desativa aqui
  assert.equal((await chamar('/api/usuarios/' + idAtendente, { ativo: false }, tokenDono, 'PUT')).status, 200);
  assert.equal((await chamar('/api/auth/eu', null, tokenAtendente)).status, 401);
  assert.equal((await chamar('/api/usuarios/' + idAtendente, { ativo: true }, tokenDono, 'PUT')).status, 200);
});

test('GET /api/usuarios traz papel; PUT de módulos vale para atendente e o padrão dele é venda e produção', async () => {
  const lista = (await chamar('/api/usuarios', null, tokenDono)).corpo;
  assert.equal(lista.find((u) => u.nome === 'Carla').papel, 'atendente');
  const p = await chamar(`/api/usuarios/${idAtendente}/modulos`, { padrao: true }, tokenDono, 'PUT');
  assert.equal(p.status, 200);
  assert.deepEqual(p.corpo.modulos, ['venda', 'producao']);
  const c = await chamar(`/api/usuarios/${idAtendente}/modulos`, { modulos: ['venda', 'financeiro'] }, tokenDono, 'PUT');
  assert.equal(c.status, 200);
  assert.equal((await chamar('/api/modulos', null, tokenDono)).corpo.padrao_atendente.join(','), 'venda,producao');
});
