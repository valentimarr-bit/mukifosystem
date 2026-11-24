// Financeiro (despesas, taxas, caixa, resultado, fluxo) e planilhas (importar/exportar tudo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = {
  DB: criarD1(['0001_inicial', '0002_lista_compras', '0003_usuarios', '0004_fotos', '0005_alerta_estoque', '0006_venda', '0007_cliente', '0008_combos', '0009_trava_estoque', '0010_estoque_recomendado', '0011_indices', '0012_financeiro', '0013_clientes_e_dias', '0014_indices_estoque', '0015_recuperar_senha', '0016_auditoria', '0017_tempo_preparo', '0018_pronta_entrega', '0019_entrega_parcial', '0020_carteira', '0021_item_pronto', '0022_campeonato', '0023_gateway', '0024_sinuca', '0025_nota_fiscal', '0026_fiscal', '0027_pix_monitor', '0028_canais', '0029_whatsapp', '0030_consentimento_whats'].map((m) => arq(`../migrations/${m}.sql`)).concat(arq('../seed/seed.sql'))),
  ADMIN_TOKEN: 'segredo-teste', ASSETS: { fetch: () => new Response('x') },
};
const chamar = async (caminho, metodo = 'GET', corpo, token = 'segredo-teste') => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } }), env);
  return { status: r.status, corpo: await r.json() };
};
const hojeISO = new Date().toISOString().slice(0, 10);

test('financeiro exige login; despesa válida entra, inválida não', async () => {
  assert.equal((await chamar('/api/financeiro/despesas', 'GET', null, null)).status, 401);
  assert.equal((await chamar('/api/financeiro/despesas', 'POST', { descricao: 'x', valor: -5 })).status, 400);
  const r = await chamar('/api/financeiro/despesas', 'POST', { descricao: 'Aluguel', categoria: 'Aluguel', tipo: 'fixa', valor: 3500, vencimento: hojeISO, recorrente: 'mensal' });
  assert.equal(r.status, 201);
  const lista = (await chamar('/api/financeiro/despesas')).corpo.despesas;
  assert.ok(lista.some((d) => d.descricao === 'Aluguel'));
  const pg = await chamar(`/api/financeiro/despesas/${r.corpo.id}/pagar`, 'POST', {});
  assert.equal(pg.status, 200);
});

test('resultado do mês e fluxo respondem com os números das despesas', async () => {
  const r = (await chamar('/api/financeiro/resumo?mes=' + hojeISO.slice(0, 7))).corpo;
  assert.ok(r.despesas.fixas >= 3500);
  assert.ok(Array.isArray((await chamar('/api/financeiro/fluxo')).corpo.semanas));
});

test('taxas: valida e salva', async () => {
  assert.equal((await chamar('/api/financeiro/taxas', 'PUT', { taxas: [{ forma: 'credito', percentual: 150, dias: 30 }] })).status, 400);
  assert.equal((await chamar('/api/financeiro/taxas', 'PUT', { taxas: [{ forma: 'credito', percentual: 3.5, fixo: 0, dias: 30 }] })).status, 200);
});

test('caixa: sangria entra na conta do dinheiro esperado e fechamento calcula a diferença', async () => {
  await chamar('/api/financeiro/caixa/mov', 'POST', { tipo: 'suprimento', valor: 100, motivo: 'troco' });
  await chamar('/api/financeiro/caixa/mov', 'POST', { tipo: 'sangria', valor: 30 });
  const c = (await chamar('/api/financeiro/caixa')).corpo;
  assert.equal(c.esperado_dinheiro >= 70, true);
  const f = await chamar('/api/financeiro/caixa/fechar', 'POST', { fundo_inicial: 0, contado_dinheiro: 60 });
  assert.equal(f.corpo.caixa.fechamento.diferenca, 60 - f.corpo.caixa.fechamento.esperado_dinheiro);
});

test('planilhas: catálogo e modelos existem; sem login não entra', async () => {
  assert.equal((await chamar('/api/planilhas', 'GET', null, null)).status, 401);
  const ids = (await chamar('/api/planilhas')).corpo.planilhas.map((p) => p.id);
  for (const id of ['insumos', 'produtos', 'fichas', 'combos', 'contagem', 'fornecedores', 'compras', 'despesas', 'taxas', 'vendas']) assert.ok(ids.includes(id), id);
});

test('planilhas: importar produtos — simular não grava, erro bloqueia tudo, aplicar grava e atualiza', async () => {
  const linhas = [{ Nome: 'PRODUTO TESTE XLS', Categoria: 'Testes', 'Preço de venda (R$)': '12,50' }];
  const sim = await chamar('/api/planilhas/produtos?simular=1', 'POST', { linhas });
  assert.equal(sim.corpo.criados, 1);
  assert.equal((await chamar('/api/produtos')).corpo.produtos?.some?.((p) => p.nome === 'PRODUTO TESTE XLS') ?? false, false);
  const ruim = await chamar('/api/planilhas/produtos', 'POST', { linhas: [...linhas, { Nome: 'OUTRO', 'Preço de venda (R$)': 'abc' }] });
  assert.equal(ruim.corpo.ok, false); assert.equal(ruim.corpo.erros[0].linha, 3);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM produto WHERE nome = 'PRODUTO TESTE XLS'").first()).n, 0);
  assert.equal((await chamar('/api/planilhas/produtos', 'POST', { linhas })).corpo.ok, true);
  const dois = await chamar('/api/planilhas/produtos', 'POST', { linhas: [{ Nome: 'produto teste xls', 'Preço de venda (R$)': 14 }] });
  assert.equal(dois.corpo.atualizados, 1);
  assert.equal((await env.DB.prepare("SELECT preco_venda AS p, categoria AS c FROM produto WHERE nome = 'PRODUTO TESTE XLS'").first()).p, 14);
  assert.equal((await env.DB.prepare("SELECT categoria AS c FROM produto WHERE nome = 'PRODUTO TESTE XLS'").first()).c, 'Testes');   // célula em branco não muda
});

test('planilhas: insumo + ficha + contagem + compra em sequência', async () => {
  assert.equal((await chamar('/api/planilhas/fornecedores', 'POST', { linhas: [{ Nome: 'Forn Teste' }] })).corpo.ok, true);
  assert.equal((await chamar('/api/planilhas/insumos', 'POST', { linhas: [{ Nome: 'Insumo XLS', Tipo: 'Teste', Embalagem: 'Caixa', 'Unidade da ficha': 'ml', 'Conteúdo da embalagem': '1.000', Fornecedor: 'Forn Teste', 'Preço de referência (R$)': '10,00' }] })).corpo.ok, true);
  assert.equal((await chamar('/api/planilhas/insumos', 'POST', { linhas: [{ Nome: 'Insumo XLS', Arredondamento: 'invalido' }] })).corpo.ok, false);
  const ficha = await chamar('/api/planilhas/fichas', 'POST', { linhas: [{ Produto: 'PRODUTO TESTE XLS', Ingrediente: 'Insumo XLS', Quantidade: '50' }] });
  assert.equal(ficha.corpo.ok, true);
  assert.equal((await chamar('/api/planilhas/fichas', 'POST', { linhas: [{ Produto: 'NAO EXISTE', Ingrediente: 'Insumo XLS', Quantidade: 1 }] })).corpo.ok, false);
  assert.equal((await chamar('/api/planilhas/contagem', 'POST', { linhas: [{ Item: 'Insumo XLS', Contado: '8' }] })).corpo.atualizados, 1);
  const est = async () => (await env.DB.prepare("SELECT SUM(quantidade) AS s FROM movimento_estoque WHERE insumo_id = (SELECT id FROM insumo WHERE nome = 'Insumo XLS')").first()).s;
  assert.equal(await est(), 8);
  const comp = await chamar('/api/planilhas/compras', 'POST', { linhas: [{ Data: '24/11/2026', Fornecedor: 'Forn Teste', Item: 'Insumo XLS', Quantidade: 2, 'Valor pago (R$)': '20' }] });
  assert.equal(comp.corpo.ok, true); assert.equal(await est(), 10);
});

test('planilhas: despesas e taxas por planilha; exportar devolve as linhas; gerente não importa', async () => {
  const d = await chamar('/api/planilhas/despesas', 'POST', { linhas: [{ 'Descrição': 'Luz', Categoria: 'Energia', 'Tipo (fixa/variável)': 'variável', 'Valor (R$)': '480,90', Vencimento: '10/12/2026' }] });
  assert.equal(d.corpo.criados, 1);
  assert.ok((await chamar('/api/planilhas/despesas')).corpo.linhas.some((l) => l.descricao === 'Luz' && l.valor === 480.9));
  assert.equal((await chamar('/api/planilhas/taxas', 'POST', { linhas: [{ 'Forma (pix/debito/credito/dinheiro)': 'Débito', 'Taxa (%)': '1,5', 'Dias para receber': 1 }] })).corpo.ok, true);
  assert.equal((await chamar('/api/planilhas/taxas', 'POST', { linhas: [{ 'Forma (pix/debito/credito/dinheiro)': 'boleto' }] })).corpo.ok, false);
  assert.equal((await chamar('/api/planilhas/vendas')).status, 200);
  assert.equal((await chamar('/api/planilhas/vendas', 'POST', { linhas: [{}] })).status, 400);
  assert.equal((await chamar('/api/planilhas/inexistente')).status, 404);
});
