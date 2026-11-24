// Nota fiscal nas contas a pagar: validação de CNPJ e chave, leitura da chave, duplicidade, anexo e consulta de CNPJ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';
import { cnpjValido, chaveValida, lerChave } from '../src/dominio/fiscal.js';
import { consultarCnpj } from '../src/financeiro.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = { DB: criarD1(['0001_inicial', '0002_lista_compras', '0003_usuarios', '0004_fotos', '0005_alerta_estoque', '0006_venda', '0007_cliente', '0008_combos', '0009_trava_estoque', '0010_estoque_recomendado', '0011_indices', '0012_financeiro', '0013_clientes_e_dias', '0014_indices_estoque', '0015_recuperar_senha', '0016_auditoria', '0017_tempo_preparo', '0018_pronta_entrega', '0019_entrega_parcial', '0020_carteira', '0021_item_pronto', '0022_campeonato', '0023_gateway', '0024_sinuca', '0025_nota_fiscal', '0026_fiscal', '0027_pix_monitor'].map((m) => arq(`../migrations/${m}.sql`))), ADMIN_TOKEN: 'segredo-teste', ASSETS: { fetch: () => new Response('x') } };
const chamar = async (caminho, metodo = 'GET', corpo, cab = {}) => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, { method: metodo, body: corpo && !(corpo instanceof Uint8Array) ? JSON.stringify(corpo) : corpo,
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '9.9.9.9', authorization: 'Bearer segredo-teste', ...cab } }), env);
  const t = await r.text(); let c; try { c = JSON.parse(t); } catch { c = t; } return { status: r.status, corpo: c, tipo: r.headers.get('content-type') };
};
// monta uma chave válida: UF 43, 2026-11, CNPJ, modelo 55, série 1, número 1234
const dv = (b) => { let s = 0, p = 2; for (let i = 42; i >= 0; i--) { s += Number(b[i]) * p; p = p === 9 ? 2 : p + 1; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
const CNPJ = '11222333000181';
const base = '43' + '2611' + CNPJ + '55' + '001' + '000001234' + '1' + '12345678';
const CHAVE = base + dv(base);

test('CNPJ e chave de acesso', () => {
  assert.ok(cnpjValido(CNPJ)); assert.ok(cnpjValido('11.222.333/0001-81')); assert.ok(!cnpjValido('11222333000182')); assert.ok(!cnpjValido('11111111111111'));
  assert.ok(chaveValida(CHAVE)); assert.ok(!chaveValida(CHAVE.slice(0, 43) + ((Number(CHAVE[43]) + 1) % 10))); assert.ok(!chaveValida('123'));
  assert.deepEqual(lerChave(CHAVE), { uf: '43', mes: '2026-11', cnpj: CNPJ, modelo: '55', serie: '1', numero: '1234' });
});

test('conta a pagar: lançar nota, duplicidade, anexo', async () => {
  const mk = async (d) => (await chamar('/api/financeiro/despesas', 'POST', { descricao: d, valor: 100, vencimento: '2026-12-10' })).corpo.id;
  const a = await mk('Distribuidora A'), b = await mk('Distribuidora B');
  const r = await chamar(`/api/financeiro/despesas/${a}/nota`, 'PUT', { chave: CHAVE });
  assert.equal(r.status, 200); assert.equal(r.corpo.numero, '1234'); assert.equal(r.corpo.cnpj, CNPJ);
  assert.equal((await chamar(`/api/financeiro/despesas/${b}/nota`, 'PUT', { chave: CHAVE })).status, 409);          // mesma nota em outra conta
  assert.equal((await chamar(`/api/financeiro/despesas/${b}/nota`, 'PUT', { chave: '1234' })).status, 400);
  assert.equal((await chamar(`/api/financeiro/despesas/${b}/nota`, 'PUT', { cnpj: '11222333000182' })).status, 400);
  assert.equal((await chamar(`/api/financeiro/despesas/${a}/nota`, 'PUT', { chave: CHAVE, cnpj: '45723174000110' })).status, 400); // CNPJ diferente da chave

  assert.equal((await chamar(`/api/financeiro/despesas/${a}/anexo`, 'PUT', new Uint8Array([1, 2, 3]), { 'content-type': 'text/html' })).status, 400);
  assert.equal((await chamar(`/api/financeiro/despesas/${a}/anexo`, 'PUT', new Uint8Array(2000), { 'content-type': 'application/pdf' })).status, 200);
  assert.equal((await chamar(`/api/financeiro/despesas/${a}/anexo`, 'PUT', new Uint8Array(1_000_000), { 'content-type': 'application/pdf' })).status, 413);
  const g = await chamar(`/api/financeiro/despesas/${a}/anexo`); assert.equal(g.status, 200); assert.equal(g.tipo, 'application/pdf');
  const lista = (await chamar('/api/financeiro/despesas?status=todas')).corpo.despesas;
  assert.equal(lista.find((x) => x.id === a).tem_anexo, 1); assert.equal(lista.find((x) => x.id === a).nf_numero, '1234'); assert.ok(!lista.find((x) => x.id === b).tem_anexo);
  assert.equal((await chamar(`/api/financeiro/despesas/${a}/anexo`, 'DELETE')).status, 200);
  assert.equal((await chamar(`/api/financeiro/despesas/${a}/anexo`)).status, 404);
});

test('consulta de CNPJ na Receita (BrasilAPI) com falhas tratadas', async () => {
  const ok = await consultarCnpj('11.222.333/0001-81', async () => new Response(JSON.stringify({ razao_social: 'ACME LTDA', descricao_situacao_cadastral: 'ATIVA', municipio: 'PORTO ALEGRE', uf: 'RS' })));
  assert.equal(ok.status, 200); assert.equal((await ok.json()).razao_social, 'ACME LTDA');
  assert.equal((await consultarCnpj('123')).status, 400);
  assert.equal((await consultarCnpj(CNPJ, async () => new Response('', { status: 404 }))).status, 404);
  assert.equal((await consultarCnpj(CNPJ, async () => { throw new Error('rede'); })).status, 502);
});
