// Divide um arquivo .sql em comandos (respeita textos entre aspas e comentários --).
export function comandosSql(texto) {
  const cmds = [];
  let atual = '', aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) { atual += c; if (c === "'") aspas = false; continue; } // '' vira dois toggles: ok
    if (c === "'") { aspas = true; atual += c; continue; }
    if (c === '-' && texto[i + 1] === '-') { while (i < texto.length && texto[i] !== '\n') i++; atual += '\n'; continue; }
    if (c === ';') { const s = atual.trim(); if (s) cmds.push(s); atual = ''; continue; }
    atual += c;
  }
  if (atual.trim()) cmds.push(atual.trim());
  // PRAGMA não é aceito em lote no D1 (as chaves estrangeiras já ficam ligadas).
  return cmds.filter((s) => !/^PRAGMA\b/i.test(s));
}

/**
 * Junta os INSERTs da mesma tabela em poucos comandos (limite de 100 KB por comando no D1).
 * As tabelas ficam na ordem em que aparecem pela primeira vez (pais antes dos filhos);
 * só serve para seeds com ids escritos à mão, sem subconsultas.
 */
export function juntarInserts(cmds, limite = 90_000) {
  const outros = [], grupos = new Map();
  for (const s of cmds) {
    const m = s.match(/^(INSERT INTO \w+ \([^)]*\)) VALUES ([\s\S]+)$/i);
    if (!m) { outros.push(s); continue; }
    if (!grupos.has(m[1])) grupos.set(m[1], []);
    grupos.get(m[1]).push(m[2]);
  }
  const saida = [...outros];
  for (const [cab, vals] of grupos) {
    let bloco = [], tam = 0;
    for (const v of vals) {
      if (tam + v.length > limite && bloco.length) { saida.push(`${cab} VALUES ${bloco.join(',\n')}`); bloco = []; tam = 0; }
      bloco.push(v); tam += v.length + 2;
    }
    if (bloco.length) saida.push(`${cab} VALUES ${bloco.join(',\n')}`);
  }
  return saida;
}
