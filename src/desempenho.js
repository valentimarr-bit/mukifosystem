// Desempenho: indicadores e relatórios do bar, calculados do que já está no sistema. Exige login.
import { json } from './api.js';
import { usuarioLogado } from './auth.js';
import { diaDoTurno } from './venda.js';
import { normalizarNome } from './dominio/estoque.js';

const r2 = (x) => Math.round((x ?? 0) * 100) / 100;
const VENDA = "p.status NOT IN ('cancelado', 'aberta', 'aguardando_pagamento')";
const somarDias = (iso, n) => new Date(new Date(iso + 'T12:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);

async function periodo(db, de, ate) {
  const q = (sql, ...b) => db.prepare(sql).bind(...b).all().then((r) => r.results);
  const um = (sql, ...b) => db.prepare(sql).bind(...b).first();
  const [tot, dias, hora, formas, maqs, origens, itens, canc, perdas, compras, custos, produtos] = await Promise.all([
    um(`SELECT COALESCE(SUM(CASE WHEN origem <> 'relatorio' THEN 1 ELSE 0 END), 0) AS vendas, COALESCE(SUM(total), 0) AS fat,
           COALESCE(SUM(CASE WHEN origem <> 'relatorio' THEN total END), 0) AS fat_reais,
           COALESCE((SELECT SUM(ip.quantidade) FROM item_pedido ip JOIN pedido q ON q.id = ip.pedido_id WHERE q.origem <> 'relatorio' AND q.status NOT IN ('cancelado', 'aberta', 'aguardando_pagamento') AND q.dia BETWEEN ? AND ?), 0) AS itens
           FROM pedido p WHERE ${VENDA} AND dia BETWEEN ? AND ?`, de, ate, de, ate),
    q(`SELECT dia, COUNT(*) AS vendas, SUM(total) AS fat FROM pedido p WHERE ${VENDA} AND dia BETWEEN ? AND ? GROUP BY dia ORDER BY dia`, de, ate),
    q(`SELECT CAST(strftime('%H', datetime(pago_em, '-3 hours')) AS INTEGER) AS hora, COUNT(*) AS vendas, SUM(total) AS fat FROM pedido p
       WHERE ${VENDA} AND origem IN ('balcao', 'celular') AND pago_em IS NOT NULL AND dia BETWEEN ? AND ? GROUP BY hora ORDER BY hora`, de, ate),
    q(`SELECT COALESCE(pagamento, 'sem informação') AS forma, COUNT(*) AS vendas, SUM(total) AS fat FROM pedido p WHERE ${VENDA} AND dia BETWEEN ? AND ? GROUP BY forma ORDER BY fat DESC`, de, ate),
    q(`SELECT COALESCE(m.nome, 'Sem maquininha (dinheiro/Pix)') AS maquininha, COUNT(*) AS cobrancas, SUM(c.valor) AS total FROM cobranca c
       JOIN pedido p ON p.id = c.pedido_id LEFT JOIN maquininha m ON m.id = c.maquininha_id WHERE c.status = 'paga' AND p.dia BETWEEN ? AND ? GROUP BY m.id ORDER BY total DESC`, de, ate),
    q(`SELECT origem, COUNT(*) AS vendas, SUM(total) AS fat FROM pedido p WHERE ${VENDA} AND dia BETWEEN ? AND ? GROUP BY origem ORDER BY fat DESC`, de, ate),
    q(`SELECT ip.produto_id, ip.nome, SUM(ip.quantidade) AS qtd, SUM(ip.quantidade * ip.preco) AS fat FROM item_pedido ip JOIN pedido p ON p.id = ip.pedido_id
       WHERE ${VENDA} AND p.dia BETWEEN ? AND ? GROUP BY ip.produto_id, ip.nome`, de, ate),
    um("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS valor FROM pedido p WHERE p.status = 'cancelado' AND p.total > 0 AND dia BETWEEN ? AND ?", de, ate),
    um(`SELECT COALESCE(SUM(CASE WHEN tipo = 'perda' THEN -custo END), 0) AS perdas,
               COALESCE(SUM(CASE WHEN tipo = 'diferenca_contagem' AND custo < 0 THEN -custo END), 0) AS sumiu,
               COALESCE(SUM(CASE WHEN tipo = 'diferenca_contagem' AND custo > 0 THEN custo END), 0) AS sobrou
        FROM movimento_estoque WHERE date(datetime(criado_em, '-3 hours')) BETWEEN ? AND ?`, de, ate),
    um('SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS n FROM compra WHERE data BETWEEN ? AND ?', de, ate),
    q(`SELECT p.id, p.nome_normalizado AS norm,
        (SELECT COALESCE(SUM(ft.quantidade / i.conteudo * COALESCE(i.preco_unidade, i.preco_referencia, 0)), 0) FROM ficha_tecnica ft JOIN insumo i ON i.id = ft.insumo_id WHERE ft.produto_id = p.id)
        + (SELECT COALESCE(SUM(ci.quantidade * (SELECT COALESCE(SUM(ft.quantidade / i.conteudo * COALESCE(i.preco_unidade, i.preco_referencia, 0)), 0) FROM ficha_tecnica ft JOIN insumo i ON i.id = ft.insumo_id WHERE ft.produto_id = ci.produto_id)), 0) FROM combo_item ci WHERE ci.combo_id = p.id) AS cmv
        FROM produto p`),
    q('SELECT id, nome, categoria FROM produto'),
  ]);

  const porId = new Map(custos.map((c) => [c.id, c.cmv])), porNome = new Map(custos.map((c) => [c.norm, c]));
  const cat = new Map(produtos.map((p) => [p.id, p.categoria ?? 'Outros']));
  const agg = new Map(); let cmvTotal = 0, fatComCusto = 0;
  for (const it of itens) {
    const c = it.produto_id != null ? { id: it.produto_id, cmv: porId.get(it.produto_id) } : porNome.get(normalizarNome(it.nome));
    const custo = c?.cmv != null && c.cmv > 0 ? c.cmv * it.qtd : null;
    if (custo != null) { cmvTotal += custo; fatComCusto += it.fat; }
    const k = normalizarNome(it.nome), a = agg.get(k) ?? { nome: it.nome, categoria: cat.get(c?.id) ?? 'Outros', qtd: 0, fat: 0, cmv: 0, semFicha: custo == null };
    a.qtd += it.qtd; a.fat += it.fat; a.cmv += custo ?? 0; agg.set(k, a);
  }
  const prods = [...agg.values()].map((a) => ({ ...a, fat: r2(a.fat), cmv: r2(a.cmv), lucro: a.semFicha ? null : r2(a.fat - a.cmv) }));
  const porCat = new Map(); for (const a of prods) { const c = porCat.get(a.categoria) ?? { categoria: a.categoria, qtd: 0, fat: 0 }; c.qtd += a.qtd; c.fat += a.fat; porCat.set(a.categoria, c); }
  const fat = r2(tot.fat);
  return {
    fat, vendas: tot.vendas, ticket: tot.vendas ? r2(tot.fat_reais / tot.vendas) : 0,   // relatório importado é 1 linha por dia: não entra em vendas/ticket
    itens_por_venda: tot.vendas ? r2(tot.itens / tot.vendas) : 0,
    cmv: r2(cmvTotal), lucro_bruto: r2(fatComCusto - cmvTotal), margem_pct: fatComCusto ? Math.round(((fatComCusto - cmvTotal) / fatComCusto) * 1000) / 10 : null,
    cobertura_ficha_pct: fat ? Math.round((fatComCusto / fat) * 100) : null,
    dias: dias.map((d) => ({ ...d, fat: r2(d.fat) })), hora: hora.map((h) => ({ ...h, fat: r2(h.fat) })),
    formas: formas.map((f) => ({ ...f, fat: r2(f.fat) })), maquininhas: maqs.map((m) => ({ ...m, total: r2(m.total) })), origens: origens.map((o) => ({ ...o, fat: r2(o.fat) })),
    top_qtd: [...prods].sort((a, b) => b.qtd - a.qtd).slice(0, 10), top_lucro: prods.filter((a) => a.lucro != null).sort((a, b) => b.lucro - a.lucro).slice(0, 10),
    margem_baixa: prods.filter((a) => a.lucro != null && a.fat > 0 && a.lucro / a.fat < 0.5 && a.qtd >= 3).sort((a, b) => a.lucro / a.fat - b.lucro / b.fat).slice(0, 8),
    sem_ficha: prods.filter((a) => a.semFicha).sort((a, b) => b.fat - a.fat).slice(0, 8),
    categorias: [...porCat.values()].map((c) => ({ ...c, fat: r2(c.fat) })).sort((a, b) => b.fat - a.fat),
    cancelamentos: { qtd: canc.n, valor: r2(canc.valor) }, perdas: r2(perdas.perdas), diferenca_sumiu: r2(perdas.sumiu), diferenca_sobrou: r2(perdas.sobrou),
    compras: { total: r2(compras.total), qtd: compras.n },
  };
}

export async function getDesempenho(request, env, url) {
  if (!(await usuarioLogado(request, env))) return json({ erro: 'Entre com seu nome e senha' }, 401);
  const db = env.DB, ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '');
  let ate = ok(url.searchParams.get('ate')) ? url.searchParams.get('ate') : diaDoTurno();
  let de = ok(url.searchParams.get('de')) ? url.searchParams.get('de') : somarDias(ate, -6);
  if (de > ate) [de, ate] = [ate, de];
  const n = Math.round((new Date(ate) - new Date(de)) / 864e5) + 1;
  if (n > 366) return json({ erro: 'Escolha no máximo 1 ano.' }, 400);
  const antesAte = somarDias(de, -1), antesDe = somarDias(de, -n);
  const [atual, anterior, alertas, esgot] = await Promise.all([
    periodo(db, de, ate), periodo(db, antesDe, antesAte),
    db.prepare(`SELECT COUNT(*) AS n FROM insumo i WHERE ativo = 1 AND minimo_alerta IS NOT NULL AND COALESCE((SELECT SUM(quantidade) FROM movimento_estoque WHERE insumo_id = i.id), 0) <= minimo_alerta`).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM insumo i WHERE ativo = 1 AND (EXISTS (SELECT 1 FROM movimento_estoque WHERE insumo_id = i.id AND tipo <> 'venda') OR EXISTS (SELECT 1 FROM contagem WHERE insumo_id = i.id))
                AND COALESCE((SELECT SUM(quantidade) FROM movimento_estoque WHERE insumo_id = i.id), 0) <= 0`).first(),
  ]);
  const dow = new Map(); for (const d of atual.dias) { const w = new Date(d.dia + 'T12:00:00Z').getUTCDay(); const x = dow.get(w) ?? { dia: DIAS_SEMANA[w], dias: 0, fat: 0 }; x.dias++; x.fat += d.fat; dow.set(w, x); }
  return json({
    de, ate, dias_no_periodo: n, anterior: { de: antesDe, ate: antesAte, fat: anterior.fat, vendas: anterior.vendas, ticket: anterior.ticket },
    variacao: { fat_pct: pct(atual.fat, anterior.fat), vendas_pct: pct(atual.vendas, anterior.vendas), ticket_pct: pct(atual.ticket, anterior.ticket) },
    ...atual, media_por_dia_semana: [...dow.values()].map((x) => ({ dia: x.dia, media: r2(x.fat / x.dias), dias: x.dias })),
    estoque: { itens_em_alerta: alertas.n, itens_esgotados: esgot.n },
  });
}
