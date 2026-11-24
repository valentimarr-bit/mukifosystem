// Gera public/manual.html a partir de docs/manual.md e docs/alteracoes.md. Rode: npm run manual
import { readFileSync, writeFileSync } from 'node:fs';
import { gerarManualHtml } from './manual_lib.mjs';

const raiz = new URL('../', import.meta.url);
const ler = (p) => readFileSync(new URL(p, raiz), 'utf8');
writeFileSync(new URL('public/manual.html', raiz), gerarManualHtml(ler('docs/manual.md'), ler('docs/alteracoes.md')));
console.log('public/manual.html gerado.');
