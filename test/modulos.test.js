import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODULOS, IDS, PADRAO_GERENTE, PADRAO_ATENDENTE, papelDe, NOME_CARGO, modulosDe, moduloDaRota,
} from '../src/dominio/modulos.js';

test('padrão do atendente é venda e produção', () => {
  assert.deepEqual(PADRAO_ATENDENTE, ['venda', 'producao']);
  assert.deepEqual(modulosDe({ papel: 'gerente', cargo: 'atendente', modulos: null }), ['venda', 'producao']);
});

test('atendente com modulos JSON inválido cai no padrão do atendente', () => {
  assert.deepEqual(modulosDe({ papel: 'gerente', cargo: 'atendente', modulos: '{quebrado' }), ['venda', 'producao']);
  assert.deepEqual(modulosDe({ papel: 'gerente', cargo: 'atendente', modulos: '"nada"' }), ['venda', 'producao']);
});

test('atendente com lista escolhida usa a lista', () => {
  assert.deepEqual(modulosDe({ papel: 'gerente', cargo: 'atendente', modulos: '["estoque","xyz"]' }), ['estoque']);
});

test('gerente sem lista continua com o padrão de gerente', () => {
  assert.deepEqual(modulosDe({ papel: 'gerente', cargo: 'gerente', modulos: null }), PADRAO_GERENTE);
  assert.deepEqual(modulosDe({ papel: 'gerente', modulos: 'não é json' }), PADRAO_GERENTE);
});

test('superadmin vê todos os módulos', () => {
  assert.deepEqual(modulosDe({ papel: 'superadmin', modulos: '["venda"]' }), IDS);
  assert.deepEqual(modulosDe(null), IDS);
  assert.equal(IDS.length, MODULOS.length);
});

test('papelDe', () => {
  assert.equal(papelDe({ papel: 'superadmin', cargo: 'atendente' }), 'superadmin');
  assert.equal(papelDe({ papel: 'gerente', cargo: 'atendente' }), 'atendente');
  assert.equal(papelDe({ papel: 'gerente', cargo: 'gerente' }), 'gerente');
  assert.equal(papelDe({ papel: 'gerente' }), 'gerente');
  assert.equal(papelDe(undefined), 'gerente');
});

test('NOME_CARGO', () => {
  assert.deepEqual(NOME_CARGO, { superadmin: 'Dono', gerente: 'Gerente', atendente: 'Atendente' });
});

test('moduloDaRota: produtos por método', () => {
  assert.equal(moduloDaRota('/api/produtos', 'PUT'), 'produtos');
  const get = moduloDaRota('/api/produtos', 'GET');
  assert.ok(Array.isArray(get));
  assert.ok(get.includes('produtos'));
  assert.equal(moduloDaRota('/api/produtos/12', 'DELETE'), 'produtos');
  assert.ok(moduloDaRota('/api/produtos/12', 'GET').includes('produtos'));
});

test('moduloDaRota: listas e estoque devolvem lista', () => {
  assert.ok(Array.isArray(moduloDaRota('/api/estoque')));
  assert.ok(moduloDaRota('/api/estoque').includes('estoque'));
  assert.deepEqual(moduloDaRota('/api/lista-compras'), ['recomendado', 'registrar']);
  assert.deepEqual(moduloDaRota('/api/listas/3', 'POST'), ['registrar', 'recomendado']);
  assert.equal(moduloDaRota('/api/recomendados/x'), 'recomendado');
  assert.equal(moduloDaRota('/api/insumos').includes('registrar'), true);
});

test('moduloDaRota: compras, contagem e relatório exigem registrar', () => {
  assert.equal(moduloDaRota('/api/compras', 'POST'), 'registrar');
  assert.equal(moduloDaRota('/api/contagem', 'POST'), 'registrar');
  assert.equal(moduloDaRota('/api/vendas/relatorio'), 'registrar');
});

test('moduloDaRota: fotos (escrita protegida, leitura livre)', () => {
  assert.equal(moduloDaRota('/api/fotos', 'GET'), null);
  assert.equal(moduloDaRota('/api/fotos/abc', 'PUT'), 'fotos');
  assert.equal(moduloDaRota('/api/fotos/abc', 'GET'), null);
});

test('moduloDaRota: regras antigas continuam valendo', () => {
  assert.equal(moduloDaRota('/api/pedidos/ab-12/cancelar', 'POST'), 'cancelar');
  assert.equal(moduloDaRota('/api/cancelamentos'), 'cancelar');
  assert.equal(moduloDaRota('/api/venda/x'), 'venda');
  assert.equal(moduloDaRota('/api/pagamentos/x'), 'financeiro');
  assert.equal(moduloDaRota('/api/alertas'), 'niveis');
});

test('moduloDaRota: rotas livres devolvem null', () => {
  assert.equal(moduloDaRota('/api/venda/cardapio'), null);
  assert.equal(moduloDaRota('/api/pagamentos/aviso/x', 'POST'), null);
  assert.equal(moduloDaRota('/api/cliente/pedidos'), null);
  assert.equal(moduloDaRota('/api/conta/sair', 'POST'), null);
});
