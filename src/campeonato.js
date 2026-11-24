// Campeonato de sinuca: campeonatos → modalidades → inscrições (Pix/carteira/balcão) → chave de mata-mata → placar ao vivo → ranking.
import { json } from './api.js';
import { erro, id8, r2 } from './venda.js';
import { usuarioLogado } from './auth.js';
import { clienteLogado } from './clientes.js';
import { lerPix } from './cliente.js';
import { modoTeste } from './trava.js';
import { gerarPix } from './pagamentos/pix.js';
import { cobrarPix, pixDaRef } from './pagamentos/gateways.js';
import { enfileirar, estadoWhats, salvarConfigWhats, numeroWhats, registrarConsentimento } from './whatsapp.js';
import { gerarChave, colocacaoDoPerdedor, pontosDaColocacao, dividirPremio } from './dominio/chaves.js';

const VALIDADE_MIN = 30;
const corpoDe = async (request) => { try { return (await request.json()) ?? {}; } catch { return {}; } };
const texto = (v, n) => String(v ?? '').trim().slice(0, n);
const pctDe = (s) => { try { const l = JSON.parse(s); return Array.isArray(l) ? l : []; } catch { return []; } };

async function expirarInscricoes(db, modId) {
  await db.prepare("UPDATE inscricao SET status = 'cancelada' WHERE modalidade_id = ? AND status = 'pendente' AND expira_em IS NOT NULL AND expira_em < datetime('now')").bind(modId).run();
}

/** Paga a inscrição uma única vez (o UPDATE condicional impede pagamento duplo, mesmo com webhook repetido). */
export async function confirmarInscricao(db, id, operador, forma = 'pix') {
  const i = await db.prepare('SELECT id, status FROM inscricao WHERE id = ?').bind(id).first();
  if (!i) return { erro: 'Inscrição não encontrada.', status: 404 };
  if (i.status === 'paga') return { ok: true, ja: true };
  if (i.status !== 'pendente') return { erro: 'Essa inscrição foi cancelada ou venceu.', status: 409 };
  await db.prepare("UPDATE inscricao SET status = 'paga', paga_em = datetime('now'), operador = ?, forma = ? WHERE id = ? AND status = 'pendente'").bind(operador, forma, id).run();
  return { ok: true };
}

async function contagem(db, modId) {
  const r = await db.prepare("SELECT SUM(status = 'paga') AS pagas, SUM(status = 'pendente' AND (expira_em IS NULL OR expira_em > datetime('now'))) AS pendentes FROM inscricao WHERE modalidade_id = ?").bind(modId).first();
  return { pagas: r?.pagas ?? 0, pendentes: r?.pendentes ?? 0 };
}

const resumoMod = (m, c) => ({ id: m.id, nome: m.nome, taxa: m.taxa, vagas: m.vagas, status: m.status, rodadas: m.rodadas, pagas: c.pagas, pendentes: c.pendentes,
  premiacao: dividirPremio(r2(m.taxa * c.pagas), pctDe(m.premio_pct)) });

/** Lista pública: campeonatos abertos (e os encerrados recentes) com suas modalidades. */
export async function listarCampeonatos(db) {
  const { results: camps } = await db.prepare('SELECT * FROM campeonato ORDER BY (status = \'aberto\') DESC, criado_em DESC LIMIT 20').all();
  const { results: mods } = await db.prepare('SELECT * FROM modalidade ORDER BY criado_em').all();
  const out = [];
  for (const c of camps) {
    const ms = [];
    for (const m of mods.filter((x) => x.campeonato_id === c.id)) ms.push(resumoMod(m, await contagem(db, m.id)));
    out.push({ id: c.id, nome: c.nome, data: c.data, local: c.local, status: c.status, modalidades: ms });
  }
  return out;
}

/** Detalhe: inscritos, chave e placares. A equipe enxerga também os pendentes. */
export async function detalheModalidade(db, id, equipe = false) {
  const m = await db.prepare('SELECT m.*, c.nome AS campeonato FROM modalidade m JOIN campeonato c ON c.id = m.campeonato_id WHERE m.id = ?').bind(id).first();
  if (!m) return null;
  await expirarInscricoes(db, id);
  const { results: ins } = await db.prepare(`SELECT id, nome, status, forma, colocacao, cliente_id, criada_em FROM inscricao WHERE modalidade_id = ? AND status ${equipe ? "<> 'cancelada'" : "= 'paga'"} ORDER BY criada_em`).bind(id).all();
  const nomes = new Map(ins.map((i) => [i.id, i.nome]));
  const { results: ps } = await db.prepare("SELECT * FROM partida WHERE modalidade_id = ? ORDER BY chave DESC, fase, pos").bind(id).all();
  const partidas = ps.map((p) => ({ id: p.id, fase: p.fase, pos: p.pos, chave: p.chave, status: p.status, mesa: p.mesa, placar_a: p.placar_a, placar_b: p.placar_b, vencedor_id: p.vencedor_id,
    a: p.a_id ? { id: p.a_id, nome: nomes.get(p.a_id) ?? '?' } : null, b: p.b_id ? { id: p.b_id, nome: nomes.get(p.b_id) ?? '?' } : null }));
  const c = await contagem(db, id);
  return { ...resumoMod(m, c), campeonato: m.campeonato, campeonato_id: m.campeonato_id,
    inscritos: ins.map((i) => ({ id: i.id, nome: i.nome, status: i.status, forma: i.forma, colocacao: i.colocacao, conta: !!i.cliente_id })), partidas,
    campeao: ins.find((i) => i.colocacao === 1)?.nome ?? null };
}

/** Ranking: pontos por colocação em modalidades encerradas, somados por pessoa (conta ou nome do balcão). */
export async function ranking(db, modalidadeNome) {
  const { results } = await db.prepare(`SELECT i.cliente_id, i.nome, i.colocacao, m.nome AS modalidade FROM inscricao i JOIN modalidade m ON m.id = i.modalidade_id
    WHERE i.status = 'paga' AND i.colocacao IS NOT NULL ${modalidadeNome ? 'AND lower(m.nome) = lower(?)' : ''}`).bind(...(modalidadeNome ? [modalidadeNome] : [])).all();
  const por = new Map();
  for (const r of results) {
    const k = r.cliente_id ?? `n:${r.nome.toLowerCase()}`, x = por.get(k) ?? { nome: r.nome, pontos: 0, titulos: 0, vices: 0, torneios: 0 };
    x.pontos += pontosDaColocacao(r.colocacao); x.torneios += 1; if (r.colocacao === 1) x.titulos += 1; if (r.colocacao === 2) x.vices += 1; por.set(k, x);
  }
  const lista = [...por.values()].sort((a, b) => b.pontos - a.pontos || b.titulos - a.titulos || a.nome.localeCompare(b.nome, 'pt-BR'));
  const { results: nm } = await db.prepare('SELECT DISTINCT nome FROM modalidade ORDER BY nome').all();
  return { modalidades: nm.map((x) => x.nome), ranking: lista.map((x, i) => ({ posicao: i + 1, ...x })) };
}

// ---------- inscrição (cliente logado) ----------
async function inscrever(db, cli, modId, corpo, env, request) {
  const m = await db.prepare("SELECT m.*, c.status AS camp FROM modalidade m JOIN campeonato c ON c.id = m.campeonato_id WHERE m.id = ?").bind(modId).first();
  if (!m) return erro('Modalidade não encontrada.', 404);
  if (m.status !== 'inscricoes' || m.camp !== 'aberto') return erro('As inscrições desta modalidade estão encerradas.', 409);
  await expirarInscricoes(db, modId);
  const ja = await db.prepare("SELECT * FROM inscricao WHERE modalidade_id = ? AND cliente_id = ? AND status <> 'cancelada'").bind(modId, cli.id).first();
  if (ja) return json(await estadoInscricao(db, ja, m), 200);
  const c = await contagem(db, modId);
  if (m.vagas && c.pagas + c.pendentes >= m.vagas) return erro('Vagas esgotadas.', 409);
  const id = `ins-${id8()}${id8()}`, teste = await modoTeste(db), taxa = r2(m.taxa);
  const pagarSaldo = !!corpo?.pagar_com_saldo && taxa > 0;
  if (taxa <= 0 || teste) {
    await db.prepare("INSERT INTO inscricao (id, modalidade_id, cliente_id, nome, valor, status, forma, paga_em, operador) VALUES (?, ?, ?, ?, ?, 'paga', ?, datetime('now'), ?)").bind(id, modId, cli.id, cli.nome, taxa, taxa <= 0 ? 'gratis' : 'teste', taxa <= 0 ? 'gratis' : 'teste').run();
  } else if (pagarSaldo) {
    const u = await db.prepare('UPDATE cliente SET saldo = ROUND(saldo - ?, 2) WHERE id = ? AND saldo >= ?').bind(taxa, cli.id, taxa).run();
    if (!u?.meta?.changes) return erro('Saldo insuficiente. Pague por Pix ou recarregue a carteira.', 402);
    try {
      await db.batch([
        db.prepare("INSERT INTO inscricao (id, modalidade_id, cliente_id, nome, valor, status, forma, paga_em, operador) VALUES (?, ?, ?, ?, ?, 'paga', 'saldo', datetime('now'), 'saldo')").bind(id, modId, cli.id, cli.nome, taxa),
        db.prepare("INSERT INTO carteira_mov (cliente_id, valor, motivo, operador, obs) VALUES (?, ?, 'inscricao', 'saldo', ?)").bind(cli.id, -taxa, `inscrição ${m.nome}`.slice(0, 80))]);
    } catch { await db.prepare('UPDATE cliente SET saldo = ROUND(saldo + ?, 2) WHERE id = ?').bind(taxa, cli.id).run(); return erro('Não foi possível concluir a inscrição. Tente de novo.', 409); }
  } else {
    const pix = await lerPix(db); if (!pix.chave) return erro('O Pix ainda não foi liberado. Fale com o balcão.', 503);
    await db.prepare(`INSERT INTO inscricao (id, modalidade_id, cliente_id, nome, valor, status, expira_em) VALUES (?, ?, ?, ?, ?, 'pendente', datetime('now', '+${VALIDADE_MIN} minutes'))`).bind(id, modId, cli.id, cli.nome, taxa).run();
    await cobrarPix(db, env, request, { ref: id, valor: taxa, descricao: `Inscrição ${m.nome} Mukifo`.slice(0, 60), expiraMin: VALIDADE_MIN });   // gateway ativo, se houver
  }
  return json(await estadoInscricao(db, await db.prepare('SELECT * FROM inscricao WHERE id = ?').bind(id).first(), m), 201);
}

async function estadoInscricao(db, i, m) {
  let pix = null;
  if (i.status === 'pendente') { pix = await pixDaRef(db, i.id); const p = pix ? null : await lerPix(db); if (p?.chave) pix = gerarPix({ ...p, valor: i.valor, txid: `MKC${i.id.replace(/\W/g, '').slice(-20)}` }); }
  return { id: i.id, modalidade_id: i.modalidade_id, modalidade: m?.nome, status: i.status, valor: i.valor, forma: i.forma, expira_em: i.expira_em, colocacao: i.colocacao, pix };
}

async function minhasInscricoes(db, cli) {
  const { results } = await db.prepare(`SELECT i.*, m.nome AS modalidade, m.status AS mstatus, c.nome AS campeonato FROM inscricao i JOIN modalidade m ON m.id = i.modalidade_id JOIN campeonato c ON c.id = m.campeonato_id
    WHERE i.cliente_id = ? AND i.status <> 'cancelada' ORDER BY i.criada_em DESC LIMIT 20`).bind(cli.id).all();
  const out = [];
  for (const i of results) out.push({ ...(await estadoInscricao(db, i, { nome: i.modalidade })), campeonato: i.campeonato, mstatus: i.mstatus });
  return out;
}

// ---------- chave e placar (equipe) ----------
const embaralhar = (l) => { const a = [...l]; for (let i = a.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export async function sortear(db, modId) {
  const m = await db.prepare('SELECT * FROM modalidade WHERE id = ?').bind(modId).first();
  if (!m) return erro('Modalidade não encontrada.', 404);
  if (m.status === 'encerrada') return erro('Essa modalidade já terminou.', 409);
  if (m.status === 'andamento') {
    const j = await db.prepare("SELECT COUNT(*) AS n FROM partida WHERE modalidade_id = ? AND (status = 'em_jogo' OR (status = 'finalizada' AND a_id IS NOT NULL AND b_id IS NOT NULL))").bind(modId).first();
    if (j.n) return erro('Já há jogos em andamento ou finalizados: não dá para sortear de novo.', 409);
  }
  await expirarInscricoes(db, modId);
  const { results } = await db.prepare("SELECT id FROM inscricao WHERE modalidade_id = ? AND status = 'paga'").bind(modId).all();
  if (results.length < 2) return erro('Precisa de pelo menos 2 inscrições pagas para sortear a chave.', 409);
  const ordem = embaralhar(results.map((r) => r.id)), { rodadas, partidas } = gerarChave(ordem);
  const por = new Map(partidas.map((p) => [p.id, p]));
  for (const p of partidas) {   // folgas da 1ª rodada: quem não tem adversário já avança
    if (p.fase === 1 && p.chave === 'W' && (!p.a || !p.b)) { p.status = 'finalizada'; p.venc = p.a ?? p.b; const q = por.get(p.prox); if (q) q[p.proxLado] = p.venc; }
  }
  const idp = (x) => `${modId}:${x}`;
  const ops = [db.prepare('DELETE FROM partida WHERE modalidade_id = ?').bind(modId), db.prepare('UPDATE inscricao SET colocacao = NULL WHERE modalidade_id = ?').bind(modId)];
  for (const p of partidas) {
    const st = p.status === 'finalizada' ? 'finalizada' : p.a && p.b ? 'pronta' : 'aguardando';
    ops.push(db.prepare('INSERT INTO partida (id, modalidade_id, fase, pos, chave, a_id, b_id, vencedor_id, status, prox_id, prox_lado, perc_id, perc_lado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(idp(p.id), modId, p.fase, p.pos, p.chave, p.a, p.b, p.venc ?? null, st, p.prox ? idp(p.prox) : null, p.proxLado, p.percProx ? idp(p.percProx) : null, p.percLado));
  }
  ops.push(db.prepare("UPDATE modalidade SET status = 'andamento', rodadas = ? WHERE id = ?").bind(rodadas, modId));
  await db.batch(ops);
  return json(await detalheModalidade(db, modId, true), 201);
}

const placarOk = (v) => Number.isInteger(v) && v >= 0 && v <= 99;

export async function lancarPlacar(db, partidaId, c) {
  const p = await db.prepare('SELECT p.*, m.rodadas FROM partida p JOIN modalidade m ON m.id = p.modalidade_id WHERE p.id = ?').bind(partidaId).first();
  if (!p) return erro('Partida não encontrada.', 404);
  if (c.reabrir) return reabrir(db, p);
  if (p.status === 'finalizada') return erro('Essa partida já terminou. Use “Corrigir resultado”.', 409);
  if (!p.a_id || !p.b_id) return erro('Ainda faltam jogadores nessa partida.', 409);
  const pa = c.placar_a === undefined ? p.placar_a : Number(c.placar_a), pb = c.placar_b === undefined ? p.placar_b : Number(c.placar_b);
  if (!placarOk(pa) || !placarOk(pb)) return erro('Placar inválido (0 a 99).');
  const mesa = c.mesa === undefined ? p.mesa : (texto(c.mesa, 12) || null);
  if (!c.finalizar) {
    await db.prepare("UPDATE partida SET placar_a = ?, placar_b = ?, mesa = ?, status = 'em_jogo', atualizada_em = datetime('now') WHERE id = ?").bind(pa, pb, mesa, p.id).run();
    return json({ ok: true });
  }
  if (pa === pb) return erro('Sinuca não termina empatada: ajuste o placar.');
  const venc = pa > pb ? p.a_id : p.b_id, perd = pa > pb ? p.b_id : p.a_id;
  const ops = [db.prepare("UPDATE partida SET placar_a = ?, placar_b = ?, mesa = ?, vencedor_id = ?, status = 'finalizada', atualizada_em = datetime('now') WHERE id = ? AND status <> 'finalizada'").bind(pa, pb, mesa, venc, p.id)];
  const colocar = (insc, col) => ops.push(db.prepare('UPDATE inscricao SET colocacao = ? WHERE id = ?').bind(col, insc));
  const entrar = (alvo, lado, insc) => { if (alvo) ops.push(db.prepare(`UPDATE partida SET ${lado === 'a' ? 'a_id' : 'b_id'} = ?, atualizada_em = datetime('now') WHERE id = ?`).bind(insc, alvo)); };
  if (p.prox_id) entrar(p.prox_id, p.prox_lado, venc);
  if (p.perc_id) entrar(p.perc_id, p.perc_lado, perd);
  const R = p.rodadas;
  if (p.chave === 'T') { colocar(venc, 3); colocar(perd, 4); }
  else if (p.fase === R) { colocar(venc, 1); colocar(perd, 2); }
  else colocar(perd, colocacaoDoPerdedor(p.fase, R));
  await db.batch(ops);
  // quem acabou de ganhar vaga completa: partidas com os dois lados preenchidos ficam "prontas"
  await db.prepare("UPDATE partida SET status = 'pronta' WHERE modalidade_id = ? AND status = 'aguardando' AND a_id IS NOT NULL AND b_id IS NOT NULL").bind(p.modalidade_id).run();
  await fecharSeTerminou(db, p.modalidade_id);
  return json({ ok: true, vencedor_id: venc });
}

async function fecharSeTerminou(db, modId) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM partida WHERE modalidade_id = ? AND status <> 'finalizada'").bind(modId).first();
  if (r.n === 0) await db.prepare("UPDATE modalidade SET status = 'encerrada' WHERE id = ?").bind(modId).run();
}

/** Corrige um resultado enquanto a rodada seguinte ainda não começou. */
async function reabrir(db, p) {
  if (p.status !== 'finalizada') return erro('Essa partida não está finalizada.', 409);
  const seg = [p.prox_id, p.perc_id].filter(Boolean);
  for (const s of seg) { const q = await db.prepare('SELECT status FROM partida WHERE id = ?').bind(s).first(); if (q && (q.status === 'em_jogo' || q.status === 'finalizada')) return erro('A partida seguinte já começou: não dá para corrigir esta.', 409); }
  const ops = [db.prepare("UPDATE partida SET status = 'em_jogo', vencedor_id = NULL, atualizada_em = datetime('now') WHERE id = ?").bind(p.id)];
  const sair = (alvo, lado) => { if (alvo) ops.push(db.prepare(`UPDATE partida SET ${lado === 'a' ? 'a_id' : 'b_id'} = NULL, status = 'aguardando' WHERE id = ?`).bind(alvo)); };
  sair(p.prox_id, p.prox_lado); sair(p.perc_id, p.perc_lado);
  ops.push(db.prepare('UPDATE inscricao SET colocacao = NULL WHERE id IN (?, ?)').bind(p.a_id, p.b_id));
  ops.push(db.prepare("UPDATE modalidade SET status = 'andamento' WHERE id = ? AND status = 'encerrada'").bind(p.modalidade_id));
  await db.batch(ops);
  return json({ ok: true });
}

// ---------- rotas ----------
export async function rotearCampeonato(request, env, url) {
  const p = url.pathname, m = request.method, db = env.DB;
  if (p === '/api/campeonato' && m === 'GET') return json({ campeonatos: await listarCampeonatos(db) });
  if (p === '/api/campeonato/ranking' && m === 'GET') return json(await ranking(db, url.searchParams.get('modalidade')));
  let r;
  if (m === 'GET' && (r = p.match(/^\/api\/campeonato\/modalidades\/([\w-]+)$/))) { const d = await detalheModalidade(db, r[1], false); return d ? json(d) : erro('Modalidade não encontrada.', 404); }
  if (p === '/api/campeonato/minhas' && m === 'GET') { const cli = await clienteLogado(request, env); return cli ? json({ inscricoes: await minhasInscricoes(db, cli) }) : erro('Entre na sua conta.', 401); }
  if (m === 'POST' && (r = p.match(/^\/api\/campeonato\/modalidades\/([\w-]+)\/inscrever$/))) { const cli = await clienteLogado(request, env); return cli ? inscrever(db, cli, r[1], await corpoDe(request), env, request) : erro('Entre na sua conta para se inscrever.', 401); }
  if (m === 'GET' && (r = p.match(/^\/api\/campeonato\/inscricoes\/([\w-]+)$/))) {
    const cli = await clienteLogado(request, env); if (!cli) return erro('Entre na sua conta.', 401);
    const i = await db.prepare('SELECT * FROM inscricao WHERE id = ? AND cliente_id = ?').bind(r[1], cli.id).first(); return i ? json(await estadoInscricao(db, i, null)) : erro('Inscrição não encontrada.', 404);
  }
  if (!p.startsWith('/api/campeonato/gestao')) return null;

  const eu = await usuarioLogado(request, env);
  if (!eu) return erro('Entre com seu nome e senha.', 401);
  if (!eu.modulos.includes('campeonato')) return erro('Seu login não tem acesso ao campeonato. Peça ao superadmin.', 403);
  const nome = eu.nome;
  if (m === 'GET' && p === '/api/campeonato/gestao') return json({ campeonatos: await listarCampeonatos(db) });
  if (m === 'POST' && p === '/api/campeonato/gestao/campeonatos') {
    const c = await corpoDe(request), n = texto(c.nome, 60); if (!n) return erro('Dê um nome ao campeonato.');
    const id = `camp-${id8()}`; await db.prepare('INSERT INTO campeonato (id, nome, data, local) VALUES (?, ?, ?, ?)').bind(id, n, texto(c.data, 10) || null, texto(c.local, 60) || null).run(); return json({ id }, 201);
  }
  if (m === 'POST' && (r = p.match(/^\/api\/campeonato\/gestao\/campeonatos\/([\w-]+)\/(encerrar|reabrir)$/))) {
    await db.prepare('UPDATE campeonato SET status = ? WHERE id = ?').bind(r[2] === 'encerrar' ? 'encerrado' : 'aberto', r[1]).run(); return json({ ok: true });
  }
  if (m === 'POST' && (r = p.match(/^\/api\/campeonato\/gestao\/campeonatos\/([\w-]+)\/modalidades$/))) {
    const c = await corpoDe(request), n = texto(c.nome, 40), taxa = r2(Number(c.taxa ?? 0)), vagas = c.vagas ? Math.floor(Number(c.vagas)) : null;
    if (!n) return erro('Dê um nome à modalidade (ex.: Bola 8, Bola 9).');
    if (!Number.isFinite(taxa) || taxa < 0 || taxa > 1000) return erro('Taxa inválida.');
    if (vagas !== null && (!Number.isInteger(vagas) || vagas < 2 || vagas > 256)) return erro('Vagas: de 2 a 256.');
    const pct = Array.isArray(c.premio) ? c.premio.map(Number).filter((x) => Number.isFinite(x) && x >= 0).slice(0, 8) : [50, 25, 15];
    if (pct.reduce((a, b) => a + b, 0) > 100) return erro('Os prêmios somam mais de 100%.');
    const camp = await db.prepare('SELECT id FROM campeonato WHERE id = ?').bind(r[1]).first(); if (!camp) return erro('Campeonato não encontrado.', 404);
    const id = `mod-${id8()}`; await db.prepare('INSERT INTO modalidade (id, campeonato_id, nome, taxa, vagas, premio_pct) VALUES (?, ?, ?, ?, ?, ?)').bind(id, r[1], n, taxa, vagas, JSON.stringify(pct)).run();
    let convite = null;   // convite automático por WhatsApp (só se estiver ligado e configurado)
    try { const w = await estadoWhats(db, env); if (w.ativo && w.configurado && w.auto) convite = await enfileirar(db, id, `${env.URL_PUBLICA || url.origin}/campeonato.html`); } catch (e) { console.error('convite whats:', e.message); }
    return json({ id, convite }, 201);
  }
  if (m === 'GET' && (r = p.match(/^\/api\/campeonato\/gestao\/modalidades\/([\w-]+)$/))) { const d = await detalheModalidade(db, r[1], true); return d ? json(d) : erro('Modalidade não encontrada.', 404); }
  if (m === 'POST' && (r = p.match(/^\/api\/campeonato\/gestao\/modalidades\/([\w-]+)\/inscrever$/))) {   // inscrição no balcão (dinheiro/maquininha), com ou sem conta
    const c = await corpoDe(request), n = texto(c.nome, 40), mod = await db.prepare('SELECT * FROM modalidade WHERE id = ?').bind(r[1]).first();
    if (!mod) return erro('Modalidade não encontrada.', 404); if (mod.status !== 'inscricoes') return erro('As inscrições desta modalidade estão encerradas.', 409);
    if (!n) return erro('Informe o nome do jogador.');
    const cn = await contagem(db, r[1]); if (mod.vagas && cn.pagas + cn.pendentes >= mod.vagas) return erro('Vagas esgotadas.', 409);
    const id = `ins-${id8()}${id8()}`; await db.prepare("INSERT INTO inscricao (id, modalidade_id, nome, valor, status, forma, paga_em, operador) VALUES (?, ?, ?, ?, 'paga', 'balcao', datetime('now'), ?)").bind(id, r[1], n, mod.taxa, nome).run(); return json({ id }, 201);
  }
  if (m === 'POST' && (r = p.match(/^\/api\/campeonato\/gestao\/inscricoes\/([\w-]+)\/confirmar$/))) { const x = await confirmarInscricao(db, r[1], nome, 'pix'); return x.erro ? erro(x.erro, x.status) : json(x); }
  if (m === 'POST' && (r = p.match(/^\/api\/campeonato\/gestao\/inscricoes\/([\w-]+)\/cancelar$/))) {
    const i = await db.prepare('SELECT i.*, md.status AS mstatus, md.nome AS mnome FROM inscricao i JOIN modalidade md ON md.id = i.modalidade_id WHERE i.id = ?').bind(r[1]).first();
    if (!i) return erro('Inscrição não encontrada.', 404); if (i.mstatus !== 'inscricoes') return erro('A chave já foi sorteada: não dá para tirar o jogador.', 409);
    if (i.status === 'cancelada') return json({ ok: true });
    const u = await db.prepare("UPDATE inscricao SET status = 'cancelada' WHERE id = ? AND status <> 'cancelada'").bind(i.id).run(); if (!u?.meta?.changes) return json({ ok: true });
    if (i.status === 'paga' && i.forma === 'saldo' && i.cliente_id) {   // só o que saiu da carteira volta para a carteira
      await db.batch([db.prepare("INSERT INTO carteira_mov (cliente_id, valor, motivo, operador, obs) VALUES (?, ?, 'estorno', ?, ?)").bind(i.cliente_id, i.valor, nome, `inscrição cancelada ${i.mnome}`.slice(0, 80)),
        db.prepare('UPDATE cliente SET saldo = ROUND(saldo + ?, 2) WHERE id = ?').bind(i.valor, i.cliente_id)]);
      return json({ ok: true, reembolso: 'saldo' });
    }
    return json({ ok: true, reembolso: i.status === 'paga' && i.valor > 0 ? 'manual' : 'nenhum' });
  }
  if (m === 'GET' && p === '/api/campeonato/gestao/whats') return json(await estadoWhats(db, env));
  if (m === 'PUT' && p === '/api/campeonato/gestao/whats') {
    if (eu.papel !== 'superadmin') return erro('Só o superadmin liga ou desliga o WhatsApp.', 403);
    const x = await salvarConfigWhats(db, env, await corpoDe(request)); return x.erro ? erro(x.erro, x.status) : json({ ok: true });
  }
  if (m === 'POST' && (r = p.match(/^\/api\/campeonato\/gestao\/modalidades\/([\w-]+)\/convidar$/))) {   // convida agora todos os clientes que ainda não receberam
    const w = await estadoWhats(db, env); if (!w.configurado) return erro('Falta ligar a izapia: IZAPIA_API_KEY e IZAPIA_SID no Cloudflare.', 409); if (!w.ativo) return erro('O WhatsApp automático está desligado (só o superadmin liga).', 409);
    const x = await enfileirar(db, r[1], `${env.URL_PUBLICA || url.origin}/campeonato.html`); return x.erro ? erro(x.erro, x.status) : json(x);
  }
  if (m === 'POST' && p === '/api/campeonato/gestao/whats/recusa') {   // cliente pediu no balcão para não receber convites
    const c = await corpoDe(request), num = numeroWhats(c.celular); if (!num) return erro('Informe o celular com DDD.');
    const cli = await db.prepare('SELECT id, celular FROM cliente WHERE celular = ? OR celular = ?').bind(num, num.slice(2)).first(); if (!cli) return erro('Nenhum cliente com esse celular.', 404);
    await db.prepare('UPDATE cliente SET whats_recusou = 1 WHERE id = ?').bind(cli.id).run(); await registrarConsentimento(db, cli, false, 'balcao');
    return json({ ok: true });
  }
  if (m === 'POST' && (r = p.match(/^\/api\/campeonato\/gestao\/modalidades\/([\w-]+)\/sortear$/))) return sortear(db, r[1]);
  if (m === 'POST' && (r = p.match(/^\/api\/campeonato\/gestao\/partidas\/([\w:.-]+)\/placar$/))) return lancarPlacar(db, r[1], await corpoDe(request));
  return null;
}
