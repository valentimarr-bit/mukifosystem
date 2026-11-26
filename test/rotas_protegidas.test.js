// Rotas de gestão exigem login: sem login é 401; quem não tem o módulo é 403.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = {
  DB: criarD1([arq('../migrations/0001_inicial.sql'), arq('../migrations/0002_lista_compras.sql'), arq('../migrations/0003_usuarios.sql'), arq('../migrations/0004_fotos.sql'), arq('../migrations/0005_alerta_estoque.sql'), arq('../migrations/0006_venda.sql'), arq('../migrations/0007_cliente.sql'), arq('../migrations/0008_combos.sql'), arq('../migrations/0009_trava_estoque.sql'), arq('../migrations/0010_estoque_recomendado.sql'), arq('../migrations/0011_indices.sql'), arq('../migrations/0012_financeiro.sql'), arq('../migrations/0013_clientes_e_dias.sql'), arq('../migrations/0014_indices_estoque.sql'), arq('../migrations/0015_recuperar_senha.sql'), arq('../migrations/0016_auditoria.sql'), arq('../migrations/0017_tempo_preparo.sql'), arq('../migrations/0018_pronta_entrega.sql'), arq('../migrations/0019_entrega_parcial.sql'), arq('../migrations/0020_carteira.sql'), arq('../migrations/0021_item_pronto.sql'), arq('../migrations/0022_campeonato.sql'), arq('../migrations/0023_gateway.sql'), arq('../migrations/0024_sinuca.sql'), arq('../migrations/0025_nota_fiscal.sql'), arq('../migrations/0026_fiscal.sql'), arq('../migrations/0027_pix_monitor.sql'), arq('../migrations/0028_canais.sql'), arq('../migrations/0029_whatsapp.sql'), arq('../migrations/0030_consentimento_whats.sql'), arq('../migrations/0031_campeonato_nivel.sql'), arq('../migrations/0032_jogador_titulo.sql'), arq('../migrations/0033_sinuca_resultado.sql'), arq('../migrations/0035_seguranca.sql'), arq('../seed/seed.sql')]),
  ASSETS: { fetch: () => new Response('estatico') },
  ADMIN_TOKEN: 'segredo-teste',
};
const chamar = async (caminho, corpo, token, method) => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, {
    method: method ?? (corpo ? 'POST' : 'GET'), body: corpo ? JSON.stringify(corpo) : undefined,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), env);
  return { status: r.status, corpo: await r.json() };
};

test('rotas de gestão sem login → 401', async () => {
  for (const caminho of ['/api/estoque', '/api/produtos', '/api/lista-compras', '/api/insumos', '/api/listas/atual']) {
    assert.equal((await chamar(caminho)).status, 401, caminho);
  }
});

test('vitrine do cardápio e fotos continuam públicas → 200', async () => {
  assert.equal((await chamar('/api/venda/cardapio')).status, 200);
  assert.equal((await chamar('/api/fotos')).status, 200);
});

test('gerente só com o módulo venda não altera produtos nem contagem → 403', async () => {
  assert.equal((await chamar('/api/usuarios', { nome: 'Gerente', senha: 'senha-gerente' }, 'segredo-teste')).status, 200);
  const lista = (await chamar('/api/usuarios', null, 'segredo-teste')).corpo;
  const id = lista.find((u) => u.nome === 'Gerente').id;
  assert.equal((await chamar(`/api/usuarios/${id}/modulos`, { modulos: ['venda'] }, 'segredo-teste', 'PUT')).status, 200);
  const token = (await chamar('/api/auth/entrar', { nome: 'Gerente', senha: 'senha-gerente' })).corpo.token;
  assert.ok(token, 'gerente entra');
  assert.equal((await chamar('/api/produtos/1', { preco: 1 }, token, 'PUT')).status, 403);
  assert.equal((await chamar('/api/contagem', { itens: [] }, token)).status, 403);
});
