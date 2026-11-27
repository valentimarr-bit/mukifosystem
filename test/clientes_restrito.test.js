// Segurança da área de clientes: atendente não mexe em saldo nem em senha do cliente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = {
  DB: criarD1([arq('../migrations/0001_inicial.sql'), arq('../migrations/0002_lista_compras.sql'), arq('../migrations/0003_usuarios.sql'), arq('../migrations/0004_fotos.sql'), arq('../migrations/0005_alerta_estoque.sql'), arq('../migrations/0006_venda.sql'), arq('../migrations/0007_cliente.sql'), arq('../migrations/0008_combos.sql'), arq('../migrations/0009_trava_estoque.sql'), arq('../migrations/0010_estoque_recomendado.sql'), arq('../migrations/0011_indices.sql'), arq('../migrations/0012_financeiro.sql'), arq('../migrations/0013_clientes_e_dias.sql'), arq('../migrations/0014_indices_estoque.sql'), arq('../migrations/0015_recuperar_senha.sql'), arq('../migrations/0016_auditoria.sql'), arq('../migrations/0017_tempo_preparo.sql'), arq('../migrations/0018_pronta_entrega.sql'), arq('../migrations/0019_entrega_parcial.sql'), arq('../migrations/0020_carteira.sql'), arq('../migrations/0021_item_pronto.sql'), arq('../migrations/0022_campeonato.sql'), arq('../migrations/0023_gateway.sql'), arq('../migrations/0024_sinuca.sql'), arq('../migrations/0025_nota_fiscal.sql'), arq('../migrations/0026_fiscal.sql'), arq('../migrations/0027_pix_monitor.sql'), arq('../migrations/0028_canais.sql'), arq('../migrations/0029_whatsapp.sql'), arq('../migrations/0030_consentimento_whats.sql'), arq('../migrations/0031_campeonato_nivel.sql'), arq('../migrations/0032_jogador_titulo.sql'), arq('../migrations/0033_sinuca_resultado.sql'), arq('../migrations/0034_cancelamento.sql'), arq('../migrations/0035_seguranca.sql'), arq('../seed/seed.sql')]),
  ASSETS: { fetch: () => new Response('estatico') },
  ADMIN_TOKEN: 'segredo-teste',
  CODIGO_PRIMEIRO_ACESSO: 'codigo-teste',
};
const chamar = async (caminho, corpo, token, method) => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, {
    method: method ?? (corpo ? 'POST' : 'GET'), body: corpo ? JSON.stringify(corpo) : undefined,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), env);
  return { status: r.status, corpo: await r.json() };
};

let idCliente, tokenGerente, tokenAtendente;

test('cria um gerente e um atendente, e um cliente para os testes', async () => {
  assert.equal((await chamar('/api/usuarios', { nome: 'Gil', senha: 'senha-do-gil' }, 'segredo-teste')).status, 200);
  assert.equal((await chamar('/api/usuarios', { nome: 'Ari', senha: 'senha-da-ari' }, 'segredo-teste')).status, 200);
  const idAri = (await env.DB.prepare('SELECT id FROM usuario WHERE nome = ?').bind('Ari').first()).id;
  await env.DB.prepare("UPDATE usuario SET cargo = 'atendente' WHERE id = ?").bind(idAri).run();
  const cad = await chamar('/api/conta/cadastro', { nome: 'Cliente Teste', celular: '51999991234', senha: 'senha-cliente', aceite: true });
  assert.equal(cad.status, 201);
  idCliente = cad.corpo.cliente.id;
  const entrar = async (nome, senha) => { const t = (await chamar('/api/auth/entrar', { nome, senha })).corpo.token;   // login criado pelo dono: troca a senha provisória antes
    assert.equal((await chamar('/api/auth/trocar-senha', { senhaAtual: senha, senhaNova: senha + '-Nova9' }, t)).status, 200); return t; };
  tokenGerente = await entrar('Gil', 'senha-do-gil');
  tokenAtendente = await entrar('Ari', 'senha-da-ari');
  assert.ok(tokenGerente && tokenAtendente);
});

test('gerente comum continua mexendo em saldo e em senha do cliente', async () => {
  assert.equal((await chamar(`/api/clientes/${idCliente}/saldo`, { valor: 10, obs: 'recarga teste' }, tokenGerente)).status, 200);
  assert.equal((await chamar(`/api/clientes/${idCliente}/codigo-senha`, null, tokenGerente, 'POST')).status, 200);
});

test('ADMIN_TOKEN continua mexendo em saldo e em senha do cliente', async () => {
  assert.equal((await chamar(`/api/clientes/${idCliente}/saldo`, { valor: 5, obs: 'recarga admin' }, 'segredo-teste')).status, 200);
  assert.equal((await chamar(`/api/clientes/${idCliente}/codigo-senha`, null, 'segredo-teste', 'POST')).status, 200);
});

test('atendente não mexe em saldo nem em senha do cliente', async () => {
  assert.equal((await chamar(`/api/clientes/${idCliente}/saldo`, { valor: 10, obs: 'tentativa' }, tokenAtendente)).status, 403);
  assert.equal((await chamar(`/api/clientes/${idCliente}/codigo-senha`, null, tokenAtendente, 'POST')).status, 403);
});
