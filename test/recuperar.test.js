// Recuperação do dono: quem tem o código de primeiro acesso troca a senha do superadmin.
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
const chamar = async (caminho, corpo, token, method, e = env) => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, {
    method: method ?? (corpo ? 'POST' : 'GET'), body: corpo ? JSON.stringify(corpo) : undefined,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), e);
  return { status: r.status, corpo: await r.json() };
};

let tokenAntigo;

test('sem o código configurado, a recuperação responde 503 com o mesmo aviso do primeiro acesso', async () => {
  const semCodigo = { ...env, CODIGO_PRIMEIRO_ACESSO: undefined };
  const r = await chamar('/api/auth/recuperar', { codigo: 'x', senhaNova: 'senha-nova-1' }, null, null, semCodigo);
  assert.equal(r.status, 503);
  assert.match(r.corpo.erro, /CODIGO_PRIMEIRO_ACESSO/);
});

test('antes de existir dono, a recuperação responde 409 (com o código certo)', async () => {
  const r = await chamar('/api/auth/recuperar', { codigo: 'codigo-teste', senhaNova: 'senha-nova-1' });
  assert.equal(r.status, 409);
  assert.equal(r.corpo.erro, 'Ainda não há dono: faça o primeiro acesso.');
});

test('código errado é recusado com 403', async () => {
  tokenAntigo = (await chamar('/api/auth/primeiro-acesso', { nome: 'Ana', senha: 'senha-da-ana', codigo: 'codigo-teste' })).corpo.token;
  const r = await chamar('/api/auth/recuperar', { codigo: 'errado', senhaNova: 'senha-nova-1' });
  assert.equal(r.status, 403);
});

test('código certo troca a senha, derruba o token antigo e o novo funciona', async () => {
  const r = await chamar('/api/auth/recuperar', { codigo: 'codigo-teste', senhaNova: 'Forte#2026x', nome: 'Ana Souza' });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.usuario.papel, 'superadmin');
  assert.equal(r.corpo.usuario.nome, 'Ana Souza');
  assert.equal(r.corpo.trocarSenha, false);
  assert.equal((await chamar('/api/auth/eu', null, tokenAntigo)).status, 401);
  const eu = await chamar('/api/auth/eu', null, r.corpo.token);
  assert.equal(eu.status, 200);
  assert.equal(eu.corpo.usuario.papel, 'superadmin');
  assert.equal((await chamar('/api/auth/entrar', { nome: 'Ana Souza', senha: 'Forte#2026x' })).status, 200);
});

test('senha de recuperação fraca (123456) obriga a trocar depois; nome curto é recusado', async () => {
  assert.equal((await chamar('/api/auth/recuperar', { codigo: 'codigo-teste', senhaNova: '123456', nome: 'A' })).status, 400);
  const r = await chamar('/api/auth/recuperar', { codigo: 'codigo-teste', senhaNova: '123456' });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.trocarSenha, true);
  assert.equal((await chamar('/api/venda/comandas', null, r.corpo.token)).status, 401);
});
