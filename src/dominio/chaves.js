// Gerador de chave de mata-mata (eliminatória simples + disputa de 3º lugar). Puro: não conhece banco nem rede.
// Os mais bem sorteados (sementes baixas) folgam na 1ª rodada quando o número de inscritos não é potência de 2.

/** Ordem padrão de sementes para uma chave de tamanho S (potência de 2): 1 só encontra 2 na final. */
export function ordemSementes(S) {
  let a = [1];
  while (a.length < S) { const t = a.length * 2; a = a.flatMap((x) => [x, t + 1 - x]); }
  return a;
}

export const potenciaDe2 = (n) => { let s = 2; while (s < n) s *= 2; return s; };

/**
 * `jogadores`: lista de ids já na ordem de sorteio (índice 0 = semente 1). Mínimo 2.
 * Devolve { rodadas, partidas }. Cada partida: { id, fase, pos, chave: 'W'|'T', a, b, prox, proxLado, percProx, percLado }.
 * `prox` leva o vencedor; `percProx` leva o perdedor (só nas semifinais, para a disputa de 3º).
 */
export function gerarChave(jogadores) {
  const n = jogadores.length;
  if (n < 2) throw new Error('Precisa de pelo menos 2 jogadores.');
  const S = potenciaDe2(n), R = Math.log2(S), ord = ordemSementes(S);
  const id = (f, p) => `${f}.${p}`;
  const partidas = [];
  for (let f = 1; f <= R; f++) {
    const qtd = S / 2 ** f;
    for (let p = 0; p < qtd; p++) {
      const m = { id: id(f, p), fase: f, pos: p, chave: 'W', a: null, b: null, prox: null, proxLado: null, percProx: null, percLado: null };
      if (f === 1) { const sa = ord[2 * p], sb = ord[2 * p + 1]; m.a = sa <= n ? jogadores[sa - 1] : null; m.b = sb <= n ? jogadores[sb - 1] : null; }
      if (f < R) { m.prox = id(f + 1, p >> 1); m.proxLado = p % 2 === 0 ? 'a' : 'b'; }
      partidas.push(m);
    }
  }
  if (R >= 2 && n >= 4) {   // com 3 jogadores a semifinal com folga não tem perdedor: não há disputa de 3º
    partidas.push({ id: 'T', fase: R, pos: 0, chave: 'T', a: null, b: null, prox: null, proxLado: null, percProx: null, percLado: null });
    for (const m of partidas) if (m.fase === R - 1 && m.chave === 'W') { m.percProx = 'T'; m.percLado = m.pos % 2 === 0 ? 'a' : 'b'; }
  }
  return { rodadas: R, partidas };
}

/** Quem leva a colocação ao perder na fase `f` de uma chave de `R` rodadas (final → 2º, semifinal → 3º, quartas → 5º...). */
export const colocacaoDoPerdedor = (f, R) => 2 ** (R - f) + 1;

/** Pontos do ranking por colocação final. */
export function pontosDaColocacao(c) {
  if (c === 1) return 100; if (c === 2) return 70; if (c === 3) return 50; if (c === 4) return 40;
  if (c <= 5) return 25; if (c <= 9) return 15; return 10;
}

/** Divide o bolo da modalidade: percentuais por colocação; o que sobra fica com a casa. */
export function dividirPremio(arrecadado, pct) {
  const lista = (Array.isArray(pct) ? pct : []).map((x) => Math.max(0, Number(x) || 0));
  const soma = lista.reduce((a, b) => a + b, 0);
  const k = soma > 100 ? 100 / soma : 1;
  const premios = lista.map((x, i) => ({ colocacao: i + 1, pct: Math.round(x * k * 100) / 100, valor: Math.floor(arrecadado * x * k) / 100 }));
  const pago = premios.reduce((a, p) => a + p.valor, 0);
  return { premios, casa: Math.round((arrecadado - pago) * 100) / 100 };
}
