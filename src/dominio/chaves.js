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
 * `jogadores`: lista de ids já na ordem de semente (índice 0 = semente 1). Mínimo 2.
 * Ids que começam com "REP:" são vagas reservadas para quem vier da repescagem: entram primeiro na lista para pegar as folgas.
 * `modo`: 'sementes' (padrão: 1 só encontra 2 na final; as primeiras sementes folgam) ou
 *         'nivel' (1ª rodada entre parecidos: 1×2, 3×4…; quem folga são os primeiros da lista).
 * Devolve { rodadas, partidas }. Cada partida: { id, fase, pos, chave: 'W'|'T', a, b, prox, proxLado, percProx, percLado }.
 * `prox` leva o vencedor; `percProx` leva o perdedor (só nas semifinais, para a disputa de 3º).
 */
export function gerarChave(jogadores, { modo = 'sementes', terceiro = true } = {}) {
  const n = jogadores.length;
  if (n < 2) throw new Error('Precisa de pelo menos 2 jogadores.');
  const S = potenciaDe2(n), R = Math.log2(S), ord = ordemSementes(S);
  const id = (f, p) => `${f}.${p}`;
  let primeira = null;   // modo nível: [a, b] de cada jogo da 1ª rodada
  if (modo === 'nivel') {
    const folgas = S - n, unidades = [];
    for (let i = 0; i < folgas; i++) unidades.push([jogadores[i], null]);
    for (let i = folgas; i < n; i += 2) unidades.push([jogadores[i], jogadores[i + 1] ?? null]);
    const ordJ = ordemSementes(S / 2);   // espalha os jogos: os dois melhores pares só se cruzam no fim
    primeira = ordJ.map((sem) => unidades[sem - 1]);
  }
  const partidas = [];
  for (let f = 1; f <= R; f++) {
    const qtd = S / 2 ** f;
    for (let p = 0; p < qtd; p++) {
      const m = { id: id(f, p), fase: f, pos: p, chave: 'W', a: null, b: null, prox: null, proxLado: null, percProx: null, percLado: null };
      if (f === 1 && primeira) { [m.a, m.b] = primeira[p]; }
      else if (f === 1) { const sa = ord[2 * p], sb = ord[2 * p + 1]; m.a = sa <= n ? jogadores[sa - 1] : null; m.b = sb <= n ? jogadores[sb - 1] : null; }
      if (f < R) { m.prox = id(f + 1, p >> 1); m.proxLado = p % 2 === 0 ? 'a' : 'b'; }
      partidas.push(m);
    }
  }
  if (terceiro && R >= 2 && n >= 4) {   // com 3 jogadores a semifinal com folga não tem perdedor: não há disputa de 3º
    partidas.push({ id: 'T', fase: R, pos: 0, chave: 'T', a: null, b: null, prox: null, proxLado: null, percProx: null, percLado: null });
    for (const m of partidas) if (m.fase === R - 1 && m.chave === 'W') { m.percProx = 'T'; m.percLado = m.pos % 2 === 0 ? 'a' : 'b'; }
  }
  return { rodadas: R, partidas };
}

// ---------- score e níveis ----------
export const SCORE_INICIAL = 1000;
/** Elo: ganhar de quem é melhor vale mais. K maior nos primeiros jogos para o score achar o lugar certo rápido. */
export function novoScore(ra, rb, aVenceu, jogosA = 99, jogosB = 99) {
  const ea = 1 / (1 + 10 ** ((rb - ra) / 400)), sa = aVenceu ? 1 : 0;
  const ka = jogosA < 10 ? 40 : 24, kb = jogosB < 10 ? 40 : 24;
  return [ra + ka * (sa - ea), rb + kb * ((1 - sa) - (1 - ea))];
}
export const NIVEIS = [
  { nome: 'Novato', min: -Infinity, cor: '#8a8f98' },
  { nome: 'Bronze', min: -Infinity, cor: '#cd7f32' },
  { nome: 'Prata', min: 1025, cor: '#c8ccd2' },
  { nome: 'Ouro', min: 1075, cor: '#f5c542' },
  { nome: 'Platina', min: 1150, cor: '#7fd1d6' },
  { nome: 'Diamante', min: 1250, cor: '#8ab4ff' },
];
/** Nível pelo score; com menos de 3 jogos é Novato (o score ainda não diz muito). */
export function nivelDoScore(score, jogos) {
  if (!jogos || jogos < 3) return NIVEIS[0];
  let n = NIVEIS[1]; for (const x of NIVEIS.slice(2)) if (score >= x.min) n = x; return n;
}
/** Chave de identidade do jogador: a conta, se tiver; senão o nome (inscrição no balcão). */
export const chaveJogador = (clienteId, nome) => clienteId ? `c:${clienteId}` : `n:${String(nome ?? '').trim().toLowerCase().replace(/\s+/g, ' ')}`;

/**
 * Recalcula o score de todo mundo a partir dos jogos terminados, em ordem.
 * `jogos`: [{ a: chave, b: chave, nomeA, nomeB, clienteA, clienteB, aVenceu }]. Devolve Map chave → { score, jogos, vitorias, nome, cliente_id }.
 */
export function calcularScores(jogos) {
  const t = new Map();
  const pega = (k, nome, cli) => { let x = t.get(k); if (!x) { x = { score: SCORE_INICIAL, jogos: 0, vitorias: 0, nome, cliente_id: cli ?? null }; t.set(k, x); } x.nome = nome || x.nome; return x; };
  for (const j of jogos) {
    if (!j.a || !j.b || j.a === j.b) continue;
    const A = pega(j.a, j.nomeA, j.clienteA), B = pega(j.b, j.nomeB, j.clienteB);
    [A.score, B.score] = novoScore(A.score, B.score, j.aVenceu, A.jogos, B.jogos);
    A.jogos++; B.jogos++; if (j.aVenceu) A.vitorias++; else B.vitorias++;
  }
  return t;
}

/** Divide uma lista já ordenada (melhor primeiro) em `n` séries de tamanhos parecidos; a Série A fica com os melhores. */
export function dividirEmSeries(lista, n) {
  const base = Math.floor(lista.length / n), sobra = lista.length % n, out = []; let i = 0;
  for (let s = 0; s < n; s++) { const tam = base + (s < sobra ? 1 : 0); out.push(lista.slice(i, i + tam)); i += tam; }
  return out;
}
/** Grupos da repescagem: distribui em zigue-zague (1,2,3,3,2,1…) para os grupos ficarem equilibrados. */
export function gruposRepescagem(lista, v) {
  const g = Array.from({ length: v }, () => []);
  lista.forEach((x, i) => { const r = Math.floor(i / v), k = i % v; g[r % 2 === 0 ? k : v - 1 - k].push(x); });
  return g;
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
