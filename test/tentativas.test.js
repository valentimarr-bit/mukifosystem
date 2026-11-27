// Limite de tentativas: senha ou código errado demais bloqueia por 15 minutos.
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
const chamar = async (caminho, corpo, token, method, ip) => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, {
    method: method ?? (corpo ? 'POST' : 'GET'), body: corpo ? JSON.stringify(corpo) : undefined,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(ip ? { 'cf-connecting-ip': ip } : {}) },
  }), env);
  return { status: r.status, corpo: await r.json() };
};

test('código de primeiro acesso: 5 errados bloqueiam o IP; o certo também fica barrado', async () => {
  const ip = '10.0.0.2';
  for (let i = 0; i < 5; i++) assert.equal((await chamar('/api/auth/primeiro-acesso', { nome: 'Ana', senha: 'senha-da-ana', codigo: 'errado' }, null, null, ip)).status, 403);
  const bloq = await chamar('/api/auth/primeiro-acesso', { nome: 'Ana', senha: 'senha-da-ana', codigo: 'codigo-teste' }, null, null, ip);
  assert.equal(bloq.status, 429);
  assert.equal(bloq.corpo.erro, 'Muitas tentativas. Espere 15 minutos e tente de novo.');
  // outro aparelho (outro IP) consegue fazer o primeiro acesso
  assert.equal((await chamar('/api/auth/primeiro-acesso', { nome: 'Ana', senha: 'senha-da-ana', codigo: 'codigo-teste' }, null, null, '10.0.0.3')).status, 200);
});

test('5 senhas erradas para um nome: a 6ª, mesmo certa, dá 429; outro nome ainda entra', async () => {
  const dono = (await chamar('/api/auth/entrar', { nome: 'Ana', senha: 'senha-da-ana' }, null, null, '10.0.0.4'));
  assert.equal(dono.status, 200);
  const tok = dono.corpo.token;
  assert.equal((await chamar('/api/usuarios', { nome: 'Beto', senha: 'senha-do-beto' }, tok, null, '10.0.0.4')).status, 200);
  assert.equal((await chamar('/api/usuarios', { nome: 'Carol', senha: 'senha-da-carol' }, tok, null, '10.0.0.4')).status, 200);
  for (let i = 0; i < 5; i++) assert.equal((await chamar('/api/auth/entrar', { nome: 'Beto', senha: 'errada' }, null, null, '10.0.0.5')).status, 401);
  const sexta = await chamar('/api/auth/entrar', { nome: 'Beto', senha: 'senha-do-beto' }, null, null, '10.0.0.5');
  assert.equal(sexta.status, 429);
  assert.equal(sexta.corpo.erro, 'Muitas tentativas. Espere 15 minutos e tente de novo.');
  assert.equal((await chamar('/api/auth/entrar', { nome: 'Carol', senha: 'senha-da-carol' }, null, null, '10.0.0.5')).status, 200);
});

test('acertar a senha limpa o contador do nome', async () => {
  for (let i = 0; i < 3; i++) await chamar('/api/auth/entrar', { nome: 'Carol', senha: 'errada' }, null, null, '10.0.0.6');
  assert.equal((await chamar('/api/auth/entrar', { nome: 'Carol', senha: 'senha-da-carol' }, null, null, '10.0.0.6')).status, 200);
  for (let i = 0; i < 4; i++) await chamar('/api/auth/entrar', { nome: 'Carol', senha: 'errada' }, null, null, '10.0.0.6');
  assert.equal((await chamar('/api/auth/entrar', { nome: 'Carol', senha: 'senha-da-carol' }, null, null, '10.0.0.6')).status, 200);
});
