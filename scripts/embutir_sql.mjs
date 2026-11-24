// Embute as migrações e o seed no código do Worker (src/banco/sql.js).
// Assim o banco se monta sozinho no primeiro acesso, sem rodar nada no terminal.
// Rode de novo sempre que criar uma migração ou regenerar o seed: npm run sql:embutir
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { comandosSql, juntarInserts } from '../src/banco/dividir.js';

const raiz = new URL('../', import.meta.url);
const migracoes = readdirSync(new URL('migrations/', raiz)).filter((f) => f.endsWith('.sql')).sort()
  .map((nome) => ({ nome, comandos: comandosSql(readFileSync(new URL(`migrations/${nome}`, raiz), 'utf-8')) }));
const seed = juntarInserts(comandosSql(readFileSync(new URL('seed/seed.sql', raiz), 'utf-8')));

writeFileSync(new URL('src/banco/sql.js', raiz),
  '// GERADO por scripts/embutir_sql.mjs — não editar à mão (npm run sql:embutir).\n'
  + `export const MIGRACOES = ${JSON.stringify(migracoes)};\n`
  + `export const SEED = ${JSON.stringify(seed)};\n`);
console.log(`${migracoes.length} migrações, seed com ${seed.length} comandos.`);
