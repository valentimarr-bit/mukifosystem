// O manual do sistema: a tela gerada tem que estar em dia com docs/manual.md e docs/alteracoes.md, e toda tela nova tem que estar citada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gerarManualHtml, mdParaHtml } from '../scripts/manual_lib.mjs';

const ler = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const manual = ler('docs/manual.md'), alteracoes = ler('docs/alteracoes.md');

test('manual.html está atualizado (rode "npm run manual" depois de mudar docs/manual.md ou docs/alteracoes.md)', () => {
  assert.equal(ler('public/manual.html'), gerarManualHtml(manual, alteracoes));
});

test('toda tela do sistema está citada no manual', () => {
  const telas = readdirSync(new URL('../public/', import.meta.url)).filter((f) => f.endsWith('.html') && !['manual.html', 'index.html'].includes(f));
  const faltam = telas.filter((f) => !manual.includes(`/${f}`));
  assert.deepEqual(faltam, [], `Telas sem texto no manual (docs/manual.md): ${faltam.join(', ')}`);
  assert.ok(manual.includes('/compras/'));
});

test('registro de alterações: uma linha por mudança, com data', () => {
  const linhas = alteracoes.split('\n').filter((l) => l.startsWith('- '));
  assert.ok(linhas.length >= 1);
  for (const l of linhas) assert.match(l, /^- \d{4}-\d{2}-\d{2} — .+/, `linha fora do formato: ${l}`);
});

test('conversor de markdown: títulos, listas, tabelas, negrito e código; escapa HTML', () => {
  const { html, toc } = mdParaHtml('## Título\n\nTexto **forte** e `cod` <b>x</b>\n\n- um\n- dois\n\n1. a\n2. b\n\n| A | B |\n|---|---|\n| 1 | 2 |\n');
  assert.deepEqual(toc, [{ id: 'titulo', texto: 'Título' }]);
  for (const trecho of ['<h2 id="titulo">', '<b>forte</b>', '<code>cod</code>', '&lt;b&gt;x&lt;/b&gt;', '<ul><li>um</li>', '<ol><li>a</li>', '<th>A</th>', '<td>2</td>']) assert.ok(html.includes(trecho), trecho);
});
