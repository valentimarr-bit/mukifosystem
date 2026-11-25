// Campeonato mais justo: score (Elo) por jogador, ordem da chave por nível, séries e repescagem por recompra.
import { calcularScores, chaveJogador, nivelDoScore, gerarChave, gruposRepescagem, dividirEmSeries, SCORE_INICIAL } from './dominio/chaves.js';

const r2 = (v) => Math.round(Number(v) * 100) / 100;
const id8 = () => crypto.randomUUID().replace(/-/g, '').slice(0, 8);
export const FORMATOS = ['sorteio', 'nivel', 'cabecas'];
const embaralhar = (l) => { const a = [...l]; for (let i = a.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** Refaz o score de todos a partir dos jogos terminados (com os dois jogadores), na ordem em que terminaram. */
export async function recalcularScores(db) {
  const { results } = await db.prepare(`SELECT p.vencedor_id, p.a_id, p.b_id, ia.cliente_id AS ca, ia.nome AS na, ib.cliente_id AS cb, ib.nome AS nb
    FROM partida p JOIN inscricao ia ON ia.id = p.a_id JOIN inscricao ib ON ib.id = p.b_id
    WHERE p.status = 'finalizada' AND p.vencedor_id IS NOT NULL ORDER BY p.atualizada_em, p.id`).all();
  const t = calcularScores(results.map((j) => ({ a: chaveJogador(j.ca, j.na), b: chaveJogador(j.cb, j.nb), nomeA: j.na, nomeB: j.nb, clienteA: j.ca, clienteB: j.cb, aVenceu: j.vencedor_id === j.a_id })));
  const ops = [db.prepare('DELETE FROM jogador_score')];
  for (const [k, x] of t) ops.push(db.prepare('INSERT INTO jogador_score (chave, cliente_id, nome, score, jogos, vitorias) VALUES (?, ?, ?, ?, ?, ?)').bind(k, x.cliente_id, x.nome, Math.round(x.score * 10) / 10, x.jogos, x.vitorias));
  for (let i = 0; i < ops.length; i += 50) await db.batch(ops.slice(i, i + 50));
}

/** Score e nível de cada inscrição (quem nunca jogou começa com 1000, Novato). */
export async function scoresDasInscricoes(db, inscricoes) {
  const chaves = [...new Set(inscricoes.map((i) => chaveJogador(i.cliente_id, i.nome)))];
  const mapa = new Map();
  for (let i = 0; i < chaves.length; i += 80) {
    const parte = chaves.slice(i, i + 80);
    const { results } = await db.prepare(`SELECT * FROM jogador_score WHERE chave IN (${parte.map(() => '?').join(',')})`).bind(...parte).all();
    for (const r of results) mapa.set(r.chave, r);
  }
  const out = new Map();
  for (const i of inscricoes) {
    const s = mapa.get(chaveJogador(i.cliente_id, i.nome)), score = s?.score ?? SCORE_INICIAL, jogos = s?.jogos ?? 0, n = nivelDoScore(score, jogos);
    out.set(i.id, { score: Math.round(score), jogos, vitorias: s?.vitorias ?? 0, nivel: n.nome, cor: n.cor });
  }
  return out;
}

/** Ordem das inscrições para montar a chave, conforme o formato. As vagas da repescagem vêm primeiro (pegam as folgas). */
export async function ordemParaChave(db, m, inscricoes) {
  const sc = await scoresDasInscricoes(db, inscricoes);
  const porScore = embaralhar(inscricoes).sort((a, b) => sc.get(b.id).score - sc.get(a.id).score);   // empate: sorteio
  const ids = m.formato === 'sorteio' ? embaralhar(inscricoes).map((i) => i.id) : porScore.map((i) => i.id);
  const vagas = Array.from({ length: m.rep_vagas || 0 }, (_, k) => `REP:${k + 1}`);
  return { lista: [...vagas, ...ids], modo: m.formato === 'nivel' ? 'nivel' : 'sementes' };
}

// ---------- repescagem ----------
/** Quem pode recomprar agora: perdeu um jogo de verdade na 1ª rodada e ainda não recomprou. */
export async function candidatosRepescagem(db, modId) {
  const { results } = await db.prepare(`SELECT i.id, i.nome, i.cliente_id FROM partida p JOIN inscricao i ON i.id = CASE WHEN p.vencedor_id = p.a_id THEN p.b_id ELSE p.a_id END
    WHERE p.modalidade_id = ? AND p.chave = 'W' AND p.fase = 1 AND p.status = 'finalizada' AND p.a_id IS NOT NULL AND p.b_id IS NOT NULL
      AND i.id NOT IN (SELECT inscricao_id FROM recompra WHERE modalidade_id = ?)`).bind(modId, modId).all();
  return results;
}

export function estadoRepescagem(m) {
  if (!m.rep_vagas) return 'sem';
  if (m.rep_status === 'fechada') return 'fechada';
  return m.status === 'andamento' ? 'aberta' : m.status === 'encerrada' ? 'fechada' : 'aguardando';
}

/** Registra a recompra (pagamento já feito: balcão, saldo, teste ou grátis). */
export async function registrarRecompra(db, m, inscricaoId, forma, operador) {
  if (estadoRepescagem(m) !== 'aberta') return { erro: 'A repescagem desta modalidade não está aberta.', status: 409 };
  const ok = (await candidatosRepescagem(db, m.id)).some((c) => c.id === inscricaoId);
  if (!ok) return { erro: 'Só quem perdeu na 1ª rodada (e ainda não recomprou) pode recomprar.', status: 409 };
  const valor = r2(m.rep_valor ?? m.taxa);
  try { await db.prepare('INSERT INTO recompra (id, modalidade_id, inscricao_id, valor, forma, operador) VALUES (?, ?, ?, ?, ?, ?)').bind(`rec-${id8()}${id8()}`, m.id, inscricaoId, valor, forma, operador).run(); }
  catch { return { erro: 'Esse jogador já recomprou.', status: 409 }; }
  return { ok: true, valor };
}

/** Fecha a repescagem: monta os grupos, a chave de cada grupo e liga o campeão de cada grupo à vaga reservada. */
export async function fecharRepescagem(db, m) {
  if (estadoRepescagem(m) !== 'aberta') return { erro: 'A repescagem desta modalidade não está aberta.', status: 409 };
  const falta = await db.prepare("SELECT COUNT(*) AS n FROM partida WHERE modalidade_id = ? AND chave = 'W' AND fase = 1 AND status <> 'finalizada'").bind(m.id).first();
  if (falta.n) return { erro: `Ainda falta${falta.n > 1 ? 'm' : ''} ${falta.n} jogo${falta.n > 1 ? 's' : ''} da 1ª rodada. A repescagem fecha depois que ela acabar.`, status: 409 };
  const { results: rec } = await db.prepare('SELECT i.id, i.nome, i.cliente_id FROM recompra r JOIN inscricao i ON i.id = r.inscricao_id WHERE r.modalidade_id = ? ORDER BY r.paga_em').bind(m.id).all();
  const sc = await scoresDasInscricoes(db, rec);
  const ordenados = m.formato === 'sorteio' ? embaralhar(rec) : embaralhar(rec).sort((a, b) => sc.get(b.id).score - sc.get(a.id).score);
  const v = m.rep_vagas, grupos = gruposRepescagem(ordenados.map((x) => x.id), Math.min(v, Math.max(1, ordenados.length)));
  while (grupos.length < v) grupos.push([]);
  const ops = [];
  const vaga = async (g) => db.prepare('SELECT id, rep_a, rep_b FROM partida WHERE modalidade_id = ? AND (rep_a = ? OR rep_b = ?)').bind(m.id, g, g).first();
  for (let k = 0; k < v; k++) {
    const g = k + 1, jog = grupos[k], alvo = await vaga(g); if (!alvo) continue;
    const lado = alvo.rep_a === g ? 'a' : 'b', col = lado === 'a' ? 'a_id' : 'b_id', repCol = lado === 'a' ? 'rep_a' : 'rep_b';
    if (!jog.length) { ops.push(db.prepare(`UPDATE partida SET ${repCol} = -1 WHERE id = ?`).bind(alvo.id)); continue; }   // ninguém: W.O.
    if (jog.length === 1) { ops.push(db.prepare(`UPDATE partida SET ${col} = ?, ${repCol} = NULL, atualizada_em = datetime('now') WHERE id = ?`).bind(jog[0], alvo.id)); continue; }
    const { partidas } = gerarChave(jog, { modo: m.formato === 'nivel' ? 'nivel' : 'sementes', terceiro: false });
    const por = new Map(partidas.map((p) => [p.id, p])), R = Math.max(...partidas.map((p) => p.fase));
    for (const p of partidas) if (p.fase === 1 && (!p.a || !p.b)) { p.status = 'finalizada'; p.venc = p.a ?? p.b; const q = por.get(p.prox); if (q) q[p.proxLado] = p.venc; }
    const idp = (x) => `${m.id}:R${g}.${x}`;
    for (const p of partidas) {
      const fim = p.fase === R, st = p.status === 'finalizada' ? 'finalizada' : p.a && p.b ? 'pronta' : 'aguardando';
      ops.push(db.prepare("INSERT INTO partida (id, modalidade_id, fase, pos, chave, grupo, a_id, b_id, vencedor_id, status, prox_id, prox_lado) VALUES (?, ?, ?, ?, 'R', ?, ?, ?, ?, ?, ?, ?)")
        .bind(idp(p.id), m.id, p.fase, p.pos, g, p.a, p.b, p.venc ?? null, st, fim ? alvo.id : idp(p.prox), fim ? lado : p.proxLado));
    }
  }
  ops.push(db.prepare("UPDATE modalidade SET rep_status = 'fechada' WHERE id = ?").bind(m.id));
  for (let i = 0; i < ops.length; i += 50) await db.batch(ops.slice(i, i + 50));
  await acertarChave(db, m.id);
  return { ok: true, recompras: rec.length, grupos: grupos.map((x) => x.length) };
}

/**
 * Depois de qualquer mudança: resolve W.O. (vaga da repescagem que ficou sem ninguém) e marca jogos prontos.
 * W.O. não dá colocação a quem não jogou; o vencedor só avança.
 */
export async function acertarChave(db, modId) {
  for (let volta = 0; volta < 12; volta++) {
    const { results } = await db.prepare(`SELECT * FROM partida WHERE modalidade_id = ? AND status <> 'finalizada'
      AND ((rep_a = -1 AND (b_id IS NOT NULL OR rep_b = -1)) OR (rep_b = -1 AND (a_id IS NOT NULL OR rep_a = -1)))`).bind(modId).all();
    if (!results.length) break;
    const ops = [];
    for (const p of results) {
      const venc = p.a_id ?? p.b_id ?? null;
      ops.push(db.prepare("UPDATE partida SET vencedor_id = ?, status = 'finalizada', atualizada_em = datetime('now') WHERE id = ?").bind(venc, p.id));
      if (p.prox_id) {
        const col = p.prox_lado === 'a' ? 'a_id' : 'b_id', rep = p.prox_lado === 'a' ? 'rep_a' : 'rep_b';
        ops.push(venc ? db.prepare(`UPDATE partida SET ${col} = ? WHERE id = ?`).bind(venc, p.prox_id) : db.prepare(`UPDATE partida SET ${rep} = -1 WHERE id = ?`).bind(p.prox_id));
      } else if (venc && p.chave === 'W') ops.push(db.prepare('UPDATE inscricao SET colocacao = 1 WHERE id = ?').bind(venc));
      else if (venc && p.chave === 'T') ops.push(db.prepare('UPDATE inscricao SET colocacao = 3 WHERE id = ?').bind(venc));
      if (p.perc_id) ops.push(db.prepare(`UPDATE partida SET ${p.perc_lado === 'a' ? 'rep_a' : 'rep_b'} = -1 WHERE id = ?`).bind(p.perc_id));   // sem perdedor: o 3º lugar também é W.O.
    }
    await db.batch(ops);
  }
  await db.prepare("UPDATE partida SET status = 'pronta' WHERE modalidade_id = ? AND status = 'aguardando' AND a_id IS NOT NULL AND b_id IS NOT NULL").bind(modId).run();
  const r = await db.prepare("SELECT COUNT(*) AS n FROM partida WHERE modalidade_id = ? AND status <> 'finalizada'").bind(modId).first();
  if (r.n === 0) await db.prepare("UPDATE modalidade SET status = 'encerrada' WHERE id = ?").bind(modId).run();
}

// ---------- séries ----------
const SERIES = 'ABCD';
export async function dividirSeries(db, m, n) {
  if (m.status !== 'inscricoes') return { erro: 'Só dá para dividir em séries antes de sortear a chave.', status: 409 };
  if (!Number.isInteger(n) || n < 2 || n > 4) return { erro: 'Escolha de 2 a 4 séries.' };
  const { results: ins } = await db.prepare("SELECT id, nome, cliente_id FROM inscricao WHERE modalidade_id = ? AND status <> 'cancelada'").bind(m.id).all();
  if (ins.length < 2 * n) return { erro: `Para ${n} séries precisa de pelo menos ${2 * n} inscritos (cada série com 2 ou mais).`, status: 409 };
  const sc = await scoresDasInscricoes(db, ins);
  const series = dividirEmSeries(embaralhar(ins).sort((a, b) => sc.get(b.id).score - sc.get(a.id).score), n);
  const base = m.nome.replace(/\s+—\s+Série [A-D]$/, '');
  const ops = [db.prepare('UPDATE modalidade SET nome = ? WHERE id = ?').bind(`${base} — Série A`.slice(0, 60), m.id)], novas = [];
  for (let s = 1; s < n; s++) {
    const id = `mod-${id8()}`; novas.push(id);
    ops.push(db.prepare('INSERT INTO modalidade (id, campeonato_id, nome, taxa, vagas, premio_pct, formato, rep_vagas, rep_valor, rep_premio) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)')
      .bind(id, m.campeonato_id, `${base} — Série ${SERIES[s]}`.slice(0, 60), m.taxa, m.premio_pct, m.formato, m.rep_vagas, m.rep_valor, m.rep_premio));
    for (const i of series[s]) ops.push(db.prepare('UPDATE inscricao SET modalidade_id = ? WHERE id = ?').bind(id, i.id));
  }
  await db.batch(ops);
  return { ok: true, series: series.map((x, k) => ({ serie: SERIES[k], id: k === 0 ? m.id : novas[k - 1], inscritos: x.length })) };
}

/** Configuração do formato e da repescagem (só antes do sorteio). */
export function lerConfig(c, atual) {
  const out = {};
  if (c.formato !== undefined) { if (!FORMATOS.includes(c.formato)) return { erro: 'Formato inválido.' }; out.formato = c.formato; }
  if (c.rep_vagas !== undefined) { const v = Math.floor(Number(c.rep_vagas)); if (!(v >= 0 && v <= 8)) return { erro: 'Vagas da repescagem: de 0 a 8.' }; out.rep_vagas = v; }
  if (c.rep_valor !== undefined) {
    if (c.rep_valor === null || c.rep_valor === '') out.rep_valor = null;
    else { const v = r2(c.rep_valor); if (!Number.isFinite(v) || v < 0 || v > 1000) return { erro: 'Valor da recompra inválido.' }; out.rep_valor = v; }
  }
  if (c.rep_premio !== undefined) out.rep_premio = c.rep_premio ? 1 : 0;
  return { ok: true, valores: { ...atual, ...out } };
}
