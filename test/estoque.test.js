// Compara as contas do sistema novo com a planilha antiga recalculada pelo LibreOffice (test/gabarito.json).
// Rodar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  mediasPorDia, consumoPorDia, estoqueMinimo, sugestaoCompra, situacao, consumoPorVendas, cmv, normalizarNome, painelEstoque,
} from '../src/dominio/estoque.js';

const ler = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'));
const dados = ler('../seed/planilha.json');
const gab = ler('./gabarito.json');
const { insumos, produtos, historico } = dados;
const porNome = new Map(insumos.map((i) => [i.nome, i]));
const perto = (a, b, msg, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${msg}: sistema ${a} × planilha ${b}`);

const hist = mediasPorDia(historico);

test('conta os mesmos dias válidos por dia da semana', () => {
  assert.deepEqual(hist.diasValidos, gab.dias_validos);
});

test('médias de venda por produto e dia batem com a aba Média por Dia', () => {
  for (const [produto, esperado] of Object.entries(gab.medias)) {
    const m = hist.medias.get(normalizarNome(produto)) ?? [0, 0, 0, 0, 0, 0];
    esperado.forEach((v, k) => perto(m[k] ?? 0, v ?? 0, `${produto} dia ${k}`));
  }
});

const consumo = consumoPorDia(insumos, produtos, hist);

test('consumo médio por dia de cada insumo bate com a planilha', () => {
  for (const e of gab.estoque) e.consumo_dia.forEach((v, k) => perto(consumo.get(e.insumo)[k], v, `${e.insumo} dia ${k}`));
});

test('estoques mínimos de segunda e quinta batem com a planilha', () => {
  for (const e of gab.estoque) {
    const i = porNome.get(e.insumo);
    assert.equal(estoqueMinimo(i, consumo.get(e.insumo), 'segunda', gab.folga), e.minimo_segunda, `${e.insumo} segunda`);
    assert.equal(estoqueMinimo(i, consumo.get(e.insumo), 'quinta', gab.folga), e.minimo_quinta, `${e.insumo} quinta`);
  }
});

const vendidos = new Map(gab.fichas.map((f) => [normalizarNome(f.produto), f.vendidos ?? 0]));
const baixa = consumoPorVendas(insumos, produtos, vendidos);

test('consumo da semana (baixa pela ficha) e estoque atual batem com a planilha', () => {
  for (const e of gab.estoque) {
    perto(baixa.get(e.insumo), e.consumo_un, `${e.insumo} consumo`);
    perto(e.inicio + e.compra - baixa.get(e.insumo), e.atual, `${e.insumo} atual`);
  }
});

test('sugestão de compra e situação batem com a planilha (dia = quinta)', () => {
  assert.equal(gab.dia_compra, 'Quinta');
  for (const e of gab.estoque) {
    const i = porNome.get(e.insumo);
    const s = sugestaoCompra(i, e.minimo_quinta, e.atual);
    assert.equal(s, e.sugestao, `${e.insumo} sugestão`);
    assert.equal(situacao(e.atual, s), e.situacao, `${e.insumo} situação`);
  }
});

test('CMV de cada produto bate com a aba Ficha', () => {
  const precos = new Map(gab.estoque.map((e) => [e.insumo, e.preco]));
  const produtosPorNome = new Map(produtos.map((p) => [normalizarNome(p.nome), p]));
  for (const f of gab.fichas) {
    const p = produtosPorNome.get(normalizarNome(f.produto));
    assert.ok(p, `produto ${f.produto} existe`);
    perto(cmv(p, porNome, precos), f.cmv, `${f.produto} CMV`, 1e-4);
  }
});

test('painel completo reproduz a aba Estoque', () => {
  const atual = new Map(gab.estoque.map((e) => [e.insumo, e.atual]));
  const painel = painelEstoque({ insumos, produtos, historico, atual, dia: 'quinta', folga: gab.folga });
  const g = new Map(gab.estoque.map((e) => [e.insumo, e]));
  for (const l of painel) {
    assert.equal(l.sugestao, g.get(l.insumo).sugestao, l.insumo);
    assert.equal(l.situacao, g.get(l.insumo).situacao, l.insumo);
  }
});
