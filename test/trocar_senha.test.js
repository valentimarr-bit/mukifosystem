// Troca de senha obrigatória: quem recebeu senha do Dono só usa o sistema depois de trocar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';
import { FRACAS } from '../src/auth.js';

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

let tokenDono, tokenNovo;

test('o Dono cria alguém com senha 123456; o login avisa que a troca é obrigatória', async () => {
  tokenDono = (await chamar('/api/auth/primeiro-acesso', { nome: 'Ana', senha: 'senha-da-ana', codigo: 'codigo-teste' })).corpo.token;
  assert.equal((await chamar('/api/usuarios', { nome: 'Dani', senha: '123456' }, tokenDono)).status, 200);
  const r = await chamar('/api/auth/entrar', { nome: 'Dani', senha: '123456' });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.trocarSenha, true);
  tokenNovo = r.corpo.token;
});

test('com a senha pendente, só /api/auth/eu, trocar-senha e sair funcionam', async () => {
  assert.equal((await chamar('/api/venda/comandas', null, tokenNovo)).status, 401);
  const eu = await chamar('/api/auth/eu', null, tokenNovo);
  assert.equal(eu.status, 200);
  assert.equal(eu.corpo.trocarSenha, true);
});

test('a troca recusa senha fraca (em qualquer capitalização) e a igual à atual', async () => {
  assert.ok(FRACAS.includes('123456'));
  const fraca = await chamar('/api/auth/trocar-senha', { senhaAtual: '123456', senhaNova: '123456' }, tokenNovo);
  assert.equal(fraca.status, 400);
  assert.equal(fraca.corpo.erro, 'Escolha uma senha mais difícil (não use 123456).');
  assert.equal((await chamar('/api/auth/trocar-senha', { senhaAtual: '123456', senhaNova: 'MUKIFO' }, tokenNovo)).status, 400);
  assert.equal((await chamar('/api/auth/trocar-senha', { senhaAtual: '123456', senhaNova: '123456' }, tokenNovo)).status, 400);
});

test('trocar para senha forte libera o sistema e zera o aviso', async () => {
  assert.equal((await chamar('/api/auth/trocar-senha', { senhaAtual: '123456', senhaNova: 'Forte#2026x' }, tokenNovo)).status, 200);
  assert.notEqual((await chamar('/api/venda/comandas', null, tokenNovo)).status, 401);
  assert.equal((await chamar('/api/auth/eu', null, tokenNovo)).corpo.trocarSenha, false);
  const entrar = await chamar('/api/auth/entrar', { nome: 'Dani', senha: 'Forte#2026x' });
  assert.equal(entrar.corpo.trocarSenha, false);
});
