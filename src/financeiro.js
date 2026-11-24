// Módulo financeiro: despesas e contas a pagar, taxas, caixa do turno, resultado do mês e fluxo de caixa.
// Só quem tem o módulo "financeiro" no painel de permissões (o superadmin sempre tem), exceto o caixa do turno (qualquer pessoa logada lança sangria/suprimento e fecha o caixa).
import { json } from './api.js';
import { usuarioLogado } from './auth.js';
import { diaDoTurno } from './venda.js';
import { periodo } from './desempenho.js';

const erro = (msg, status = 400) => json({ erro: msg }, status);
const r2 = (x) => Math.round((x ?? 0) * 100) / 100;
const FORMAS = ['pix', 'debito', 'credito', 'dinheiro'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const somarDias = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const VENDA = "p.status NOT IN ('cancelado', 'aberta', 'aguardando_pagamento')";

export function validarDespesa(c, parcial = false) {
  const d = {};
  const descricao = String(c.descricao ?? '').replace(/\s+/g, ' ').trim();
  if (descricao.length < 2) return { erro: 'Digite a descrição da despesa.' };
  d.descricao = descricao.slice(0, 120);
  d.categoria = String(c.categoria ?? '').trim().slice(0, 40) || 'Outras';
  d.tipo = c.tipo === 'fixa' ? 'fixa' : 'variavel';
  d.valor = r2(Number(c.valor));
  if (!Number.isFinite(d.valor) || d.valor <= 0 || d.valor > 10_000_000) return { erro: 'Digite o valor da despesa.' };
  if (!ISO.test(String(c.vencimento ?? '')) || Number.isNaN(Date.parse(c.vencimento))) return { erro: 'Digite a data de vencimento (dia/mês/ano).' };
  d.vencimento = c.vencimento;
  d.status = c.status === 'paga' ? 'paga' : 'aberta';
  d.pago_em = d.status === 'paga' ? (ISO.test(String(c.pago_em ?? '')) ? c.pago_em : c.vencimento) : null;
  d.forma = String(c.forma ?? '').trim().slice(0, 30) || null;
  d.fornecedor = String(c.fornecedor ?? '').trim().slice(0, 80) || null;
  d.recorrente = c.recorrente === 'mensal' ? 'mensal' : null;
  d.observacao = String(c.observacao ?? '').trim().slice(0, 300) || null;
  return { dados: d };
}

async function getTaxas(db) {
  const { results } = await db.prepare('SELECT forma, percentual, fixo, dias FROM taxa_pagamento ORDER BY CASE forma WHEN \'pix\' THEN 1 WHEN \'debito\' THEN 2 WHEN \'credito\' THEN 3 ELSE 4 END').all();
  return results;
}
const taxaDe = (taxas, forma) => taxas.find((t) => t.forma === forma) ?? { percentual: 0, fixo: 0, dias: 0 };

async function listarDespesas(db, url) {
  const q = url.searchParams, onde = [], b = [];
  if (ISO.test(q.get('de') ?? '')) { onde.push('vencimento >= ?'); b.push(q.get('de')); }
  if (ISO.test(q.get('ate') ?? '')) { onde.push('vencimento <= ?'); b.push(q.get('ate')); }
  if (['aberta', 'paga'].includes(q.get('status'))) { onde.push('status = ?'); b.push(q.get('status')); }
  const { results } = await db.prepare(`SELECT * FROM despesa ${onde.length ? 'WHERE ' + onde.join(' AND ') : ''} ORDER BY vencimento, id LIMIT 2000`).bind(...b).all();
  return json({ despesas: results, hoje: diaDoTurno() });
}

async function gerarMes(db, corpo, eu) {
  const mes = String(corpo?.mes ?? '');
  if (!/^\d{4}-\d{2}$/.test(mes)) return erro('Escolha o mês (AAAA-MM).');
  const [a, m] = mes.split('-').map(Number), ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const { results } = await db.prepare(`SELECT * FROM despesa WHERE recorrente = 'mensal' AND id IN (SELECT MAX(id) FROM despesa WHERE recorrente = 'mensal' GROUP BY descricao)`).all();
  const { results: ja } = await db.prepare('SELECT descricao FROM despesa WHERE vencimento LIKE ?').bind(mes + '-%').all();
  const jaTem = new Set(ja.map((x) => x.descricao));
  const novas = results.filter((d) => !jaTem.has(d.descricao));
  if (novas.length) await db.batch(novas.map((d) => db.prepare(
    `INSERT INTO despesa (descricao, categoria, tipo, valor, vencimento, status, forma, fornecedor, recorrente, observacao, criado_por) VALUES (?, ?, ?, ?, ?, 'aberta', ?, ?, 'mensal', ?, ?)`)
    .bind(d.descricao, d.categoria, d.tipo, d.valor, `${mes}-${String(Math.min(Number(d.vencimento.slice(8, 10)), ultimo)).padStart(2, '0')}`, d.forma, d.fornecedor, d.observacao, eu.nome)));
  return json({ ok: true, criadas: novas.length, ja_existiam: results.length - novas.length });
}

async function despesas(db, request, url, eu) {
  const m = request.method, p = url.pathname;
  if (m === 'GET' && p === '/api/financeiro/despesas') return listarDespesas(db, url);
  let corpo = {}; if (m === 'POST' || m === 'PUT') { try { corpo = await request.json(); } catch { return erro('Corpo da requisição não é JSON'); } }
  if (m === 'POST' && p === '/api/financeiro/despesas/gerar-mes') return gerarMes(db, corpo, eu);
  if (m === 'POST' && p === '/api/financeiro/despesas') {
    const v = validarDespesa(corpo); if (v.erro) return erro(v.erro); const d = v.dados;
    const r = await db.prepare(`INSERT INTO despesa (descricao, categoria, tipo, valor, vencimento, status, pago_em, forma, fornecedor, recorrente, observacao, criado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(d.descricao, d.categoria, d.tipo, d.valor, d.vencimento, d.status, d.pago_em, d.forma, d.fornecedor, d.recorrente, d.observacao, eu.nome).first();
    return json({ ok: true, id: r.id }, 201);
  }
  const k = p.match(/^\/api\/financeiro\/despesas\/(\d+)(\/pagar)?$/);
  if (!k) return null;
  const id = Number(k[1]);
  if (!(await db.prepare('SELECT 1 AS ok FROM despesa WHERE id = ?').bind(id).first())) return erro('Despesa não encontrada.', 404);
  if (m === 'POST' && k[2]) {
    const dia = ISO.test(String(corpo?.pago_em ?? '')) ? corpo.pago_em : diaDoTurno();
    await db.prepare("UPDATE despesa SET status = 'paga', pago_em = ?, forma = COALESCE(?, forma) WHERE id = ?").bind(dia, String(corpo?.forma ?? '').trim().slice(0, 30) || null, id).run();
    return json({ ok: true });
  }
  if (m === 'PUT' && !k[2]) {
    const v = validarDespesa(corpo); if (v.erro) return erro(v.erro); const d = v.dados;
    await db.prepare(`UPDATE despesa SET descricao = ?, categoria = ?, tipo = ?, valor = ?, vencimento = ?, status = ?, pago_em = ?, forma = ?, fornecedor = ?, recorrente = ?, observacao = ? WHERE id = ?`)
      .bind(d.descricao, d.categoria, d.tipo, d.valor, d.vencimento, d.status, d.pago_em, d.forma, d.fornecedor, d.recorrente, d.observacao, id).run();
    return json({ ok: true });
  }
  if (m === 'DELETE' && !k[2]) { await db.prepare('DELETE FROM despesa WHERE id = ?').bind(id).run(); return json({ ok: true }); }
  return null;
}

async function taxas(db, request) {
  if (request.method === 'GET') return json({ taxas: await getTaxas(db) });
  let c; try { c = await request.json(); } catch { return erro('Corpo da requisição não é JSON'); }
  const itens = Array.isArray(c?.taxas) ? c.taxas : [];
  for (const t of itens) {
    if (!FORMAS.includes(t.forma)) return erro('Forma de pagamento inválida.');
    const pc = Number(t.percentual), fx = Number(t.fixo ?? 0), d = Number(t.dias);
    if (!(pc >= 0 && pc <= 100) || !(fx >= 0 && fx <= 100) || !Number.isInteger(d) || d < 0 || d > 365) return erro('Confira os números das taxas (percentual de 0 a 100, dias inteiros).');
  }
  await db.batch(itens.map((t) => db.prepare('UPDATE taxa_pagamento SET percentual = ?, fixo = ?, dias = ? WHERE forma = ?').bind(Number(t.percentual), Number(t.fixo ?? 0), Number(t.dias), t.forma)));
  return json({ ok: true, taxas: await getTaxas(db) });
}

// ---- caixa do turno ----
async function lerCaixa(db, dia) {
  const [formas, movs, fech, ult] = await Promise.all([
    db.prepare(`SELECT c.forma, COUNT(*) AS n, COALESCE(SUM(c.valor), 0) AS total FROM cobranca c JOIN pedido p ON p.id = c.pedido_id WHERE c.status = 'paga' AND p.dia = ? GROUP BY c.forma`).bind(dia).all(),
    db.prepare('SELECT id, tipo, valor, motivo, usuario, criado_em FROM caixa_mov WHERE dia = ? ORDER BY id').bind(dia).all(),
    db.prepare('SELECT * FROM caixa_fechamento WHERE dia = ?').bind(dia).first(),
    db.prepare('SELECT contado_dinheiro FROM caixa_fechamento WHERE dia < ? ORDER BY dia DESC LIMIT 1').bind(dia).first()]);
  const por = Object.fromEntries(formas.results.map((f) => [f.forma, f]));
  const somaMov = (t) => r2(movs.results.filter((m) => m.tipo === t).reduce((s, m) => s + m.valor, 0));
  const fundo = fech?.fundo_inicial ?? null;
  const dinheiro = r2(por.dinheiro?.total ?? 0);
  const esperado = r2((fundo ?? ult?.contado_dinheiro ?? 0) + dinheiro + somaMov('suprimento') - somaMov('sangria'));
  return {
    dia, por_forma: FORMAS.map((f) => ({ forma: f, cobrancas: por[f]?.n ?? 0, total: r2(por[f]?.total ?? 0) })), total_vendido: r2(formas.results.reduce((s, f) => s + f.total, 0)),
    movimentos: movs.results, sangrias: somaMov('sangria'), suprimentos: somaMov('suprimento'),
    sugestao_fundo: ult?.contado_dinheiro ?? 0, fundo_inicial: fundo, esperado_dinheiro: esperado, fechamento: fech ?? null,
  };
}

async function caixa(db, request, url, eu) {
  const m = request.method, p = url.pathname;
  const dia = ISO.test(url.searchParams.get('dia') ?? '') ? url.searchParams.get('dia') : diaDoTurno();
  if (m === 'GET' && p === '/api/financeiro/caixa') return json(await lerCaixa(db, dia));
  let c = {}; try { c = await request.json(); } catch { return erro('Corpo da requisição não é JSON'); }
  const d = ISO.test(String(c?.dia ?? '')) ? c.dia : diaDoTurno();
  if (m === 'POST' && p === '/api/financeiro/caixa/mov') {
    const valor = r2(Number(c.valor));
    if (!['sangria', 'suprimento'].includes(c.tipo) || !(valor > 0 && valor < 1_000_000)) return erro('Escolha sangria ou suprimento e digite o valor.');
    if ((await db.prepare('SELECT 1 AS ok FROM caixa_fechamento WHERE dia = ?').bind(d).first())) return erro('O caixa desse dia já foi fechado.', 409);
    await db.prepare('INSERT INTO caixa_mov (dia, tipo, valor, motivo, usuario) VALUES (?, ?, ?, ?, ?)').bind(d, c.tipo, valor, String(c.motivo ?? '').trim().slice(0, 120) || null, eu.nome).run();
    return json({ ok: true, caixa: await lerCaixa(db, d) }, 201);
  }
  if (m === 'POST' && p === '/api/financeiro/caixa/fechar') {
    const fundo = r2(Number(c.fundo_inicial ?? 0)), contado = r2(Number(c.contado_dinheiro));
    if (!Number.isFinite(contado) || contado < 0 || !Number.isFinite(fundo) || fundo < 0) return erro('Digite quanto tem de dinheiro no caixa.');
    if ((await db.prepare('SELECT 1 AS ok FROM caixa_fechamento WHERE dia = ?').bind(d).first()) && eu.papel !== 'superadmin') return erro('Esse caixa já foi fechado. Só o superadmin refaz.', 409);
    const atual = await lerCaixa(db, d);
    const esperado = r2(fundo + (atual.por_forma.find((f) => f.forma === 'dinheiro')?.total ?? 0) + atual.suprimentos - atual.sangrias);
    await db.prepare(`INSERT INTO caixa_fechamento (dia, fundo_inicial, esperado_dinheiro, contado_dinheiro, diferenca, observacao, fechado_por, fechado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT (dia) DO UPDATE SET fundo_inicial = excluded.fundo_inicial, esperado_dinheiro = excluded.esperado_dinheiro,
      contado_dinheiro = excluded.contado_dinheiro, diferenca = excluded.diferenca, observacao = excluded.observacao, fechado_por = excluded.fechado_por, fechado_em = excluded.fechado_em`)
      .bind(d, fundo, esperado, contado, r2(contado - esperado), String(c.observacao ?? '').trim().slice(0, 300) || null, eu.nome).run();
    return json({ ok: true, caixa: await lerCaixa(db, d) });
  }
  return null;
}

// ---- resultado do mês e fluxo ----
async function resumo(db, url) {
  const mes = /^\d{4}-\d{2}$/.test(url.searchParams.get('mes') ?? '') ? url.searchParams.get('mes') : diaDoTurno().slice(0, 7);
  const [a, m] = mes.split('-').map(Number), de = `${mes}-01`, ate = `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const [per, tx, cob, desp, dias, ate_pagar] = await Promise.all([
    periodo(db, de, ate), getTaxas(db),
    db.prepare(`SELECT c.forma, COUNT(*) AS n, SUM(c.valor) AS v FROM cobranca c JOIN pedido p ON p.id = c.pedido_id WHERE c.status = 'paga' AND p.dia BETWEEN ? AND ? GROUP BY c.forma`).bind(de, ate).all(),
    db.prepare('SELECT categoria, tipo, status, SUM(valor) AS v FROM despesa WHERE vencimento BETWEEN ? AND ? GROUP BY categoria, tipo, status').bind(de, ate).all(),
    db.prepare(`SELECT COUNT(DISTINCT dia) AS n FROM pedido p WHERE ${VENDA} AND dia BETWEEN ? AND ?`).bind(de, ate).first(),
    db.prepare("SELECT COALESCE(SUM(valor), 0) AS v FROM despesa WHERE status = 'aberta' AND vencimento < ?").bind(diaDoTurno()).first()]);
  const taxas = r2(cob.results.reduce((s, c) => { const t = taxaDe(tx, c.forma); return s + c.v * t.percentual / 100 + c.n * t.fixo; }, 0));
  const porCat = new Map(); let fixas = 0, variaveis = 0, pagas = 0, abertas = 0;
  for (const d of desp.results) {
    const c = porCat.get(d.categoria) ?? { categoria: d.categoria, tipo: d.tipo, valor: 0 }; c.valor += d.v; porCat.set(d.categoria, c);
    if (d.tipo === 'fixa') fixas += d.v; else variaveis += d.v; if (d.status === 'paga') pagas += d.v; else abertas += d.v;
  }
  const fat = per.fat, despesas = r2(fixas + variaveis), resultado = r2(fat - taxas - per.cmv - despesas);
  const mc = fat > 0 ? (fat - taxas - per.cmv - variaveis) / fat : null;                    // margem de contribuição
  const equilibrio = mc && mc > 0 ? r2(fixas / mc) : null, diasAbertos = dias.n || null;
  return json({
    mes, de, ate, faturamento: r2(fat), taxas, cmv: per.cmv, cobertura_ficha_pct: per.cobertura_ficha_pct, lucro_bruto: r2(fat - taxas - per.cmv),
    despesas: { total: despesas, fixas: r2(fixas), variaveis: r2(variaveis), pagas: r2(pagas), em_aberto: r2(abertas), por_categoria: [...porCat.values()].map((c) => ({ ...c, valor: r2(c.valor) })).sort((x, y) => y.valor - x.valor) },
    resultado, margem_liquida_pct: fat > 0 ? Math.round((resultado / fat) * 1000) / 10 : null, margem_contribuicao_pct: mc == null ? null : Math.round(mc * 1000) / 10,
    equilibrio_mensal: equilibrio, dias_com_venda: dias.n, equilibrio_por_dia: equilibrio && diasAbertos ? r2(equilibrio / diasAbertos) : null, vencidas: r2(ate_pagar.v),
    aviso: 'Taxas contam só as vendas lançadas no Mukifo. O relatório importado do dia não informa a forma de pagamento.',
  });
}

async function fluxo(db) {
  const hoje = diaDoTurno(), fim = somarDias(hoje, 34), tx = await getTaxas(db);
  const [aPagar, venc, cob] = await Promise.all([
    db.prepare("SELECT id, descricao, categoria, valor, vencimento FROM despesa WHERE status = 'aberta' AND vencimento BETWEEN ? AND ? ORDER BY vencimento").bind(hoje, fim).all(),
    db.prepare("SELECT id, descricao, categoria, valor, vencimento FROM despesa WHERE status = 'aberta' AND vencimento < ? ORDER BY vencimento").bind(hoje).all(),
    db.prepare(`SELECT p.dia, c.forma, COUNT(*) AS n, SUM(c.valor) AS v FROM cobranca c JOIN pedido p ON p.id = c.pedido_id WHERE c.status = 'paga' AND p.dia >= ? GROUP BY p.dia, c.forma`).bind(somarDias(hoje, -400)).all()]);
  const semanas = Array.from({ length: 5 }, (_, i) => ({ semana: i + 1, de: somarDias(hoje, i * 7), ate: somarDias(hoje, i * 7 + 6), entradas: 0, saidas: 0 }));
  const sem = (dia) => semanas.find((s) => dia >= s.de && dia <= s.ate);
  const receber = [];
  for (const c of cob.results) {
    const t = taxaDe(tx, c.forma), quando = somarDias(c.dia, t.dias), liq = c.v - (c.v * t.percentual / 100 + c.n * t.fixo);
    if (quando >= hoje && quando <= fim) { const s = sem(quando); if (s) s.entradas += liq; receber.push({ dia_venda: c.dia, forma: c.forma, recebe_em: quando, liquido: r2(liq) }); }
  }
  for (const d of aPagar.results) { const s = sem(d.vencimento); if (s) s.saidas += d.valor; }
  let acum = 0;
  return json({
    hoje, semanas: semanas.map((s) => { acum += s.entradas - s.saidas; return { ...s, entradas: r2(s.entradas), saidas: r2(s.saidas), saldo: r2(s.entradas - s.saidas), acumulado: r2(acum) }; }),
    a_pagar: aPagar.results, vencidas: venc.results, vencidas_total: r2(venc.results.reduce((s, d) => s + d.valor, 0)), a_receber: receber.sort((x, y) => x.recebe_em.localeCompare(y.recebe_em)),
    aviso: 'A receber considera só as vendas lançadas no Mukifo, pelos prazos e taxas cadastrados.',
  });
}

export async function rotearFinanceiro(request, env, url) {
  const eu = await usuarioLogado(request, env);
  if (!eu) return erro('Entre com seu nome e senha', 401);
  const db = env.DB, p = url.pathname;
  if (p.startsWith('/api/financeiro/caixa')) return caixa(db, request, url, eu);
  if (!eu.modulos?.includes('financeiro')) return erro('Seu login não tem acesso ao financeiro.', 403);
  if (p.startsWith('/api/financeiro/despesas')) return despesas(db, request, url, eu);
  if (p === '/api/financeiro/taxas' && ['GET', 'PUT'].includes(request.method)) return taxas(db, request);
  if (p === '/api/financeiro/resumo' && request.method === 'GET') return resumo(db, url);
  if (p === '/api/financeiro/fluxo' && request.method === 'GET') return fluxo(db);
  return null;
}
