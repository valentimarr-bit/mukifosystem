// Rotas da API do Mukifo (Cloudflare D1 em env.DB).
import { usuarioLogado, rotearAuth } from './auth.js';
import { rotearFotos } from './fotos.js';
import { rotearProdutos } from './produtos.js';
import { rotearVenda } from './venda.js';
import { rotearCliente } from './cliente.js';
import { rotearCombos } from './combos.js';
import { getDesempenho } from './desempenho.js';
import { rotearFinanceiro } from './financeiro.js';
import { rotearPlanilhas } from './planilhas.js';
import { rotearFornecedores } from './fornecedores.js';
import { rotearConta, rotearClientes } from './clientes.js';
import { rotearProducao } from './producao.js';
import { moduloDaRota } from './dominio/modulos.js';
import {
  normalizarNome, painelEstoque, consumoPorVendas, cmv, produtosSemFicha,
} from './dominio/estoque.js';

export function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}
const erro = (msg, status = 400) => json({ erro: msg }, status);
const r2 = (x) => Math.round(x * 100) / 100;

// ---------------- leitura do banco ----------------

async function carregarInsumos(db) {
  const { results } = await db.prepare(
    `SELECT i.*, f.nome AS fornecedor FROM insumo i LEFT JOIN fornecedor f ON f.id = i.fornecedor_id WHERE i.ativo = 1 ORDER BY i.id`).all();
  return results.map((i) => ({ ...i, consumo_inteiro: !!i.consumo_inteiro, producao_propria: !!i.producao_propria }));
}

async function carregarProdutos(db) {
  const [{ results: prods }, { results: linhas }] = await Promise.all([
    db.prepare('SELECT * FROM produto WHERE ativo = 1 ORDER BY id').all(),
    db.prepare('SELECT ft.produto_id, ft.quantidade, ft.observacao, i.nome AS insumo FROM ficha_tecnica ft JOIN insumo i ON i.id = ft.insumo_id').all(),
  ]);
  const porProduto = new Map(prods.map((p) => [p.id, { ...p, baixa_estoque: !!p.baixa_estoque, ficha: [] }]));
  for (const l of linhas) porProduto.get(l.produto_id)?.ficha.push({ insumo: l.insumo, quantidade: l.quantidade, observacao: l.observacao });
  return [...porProduto.values()];
}

/** Vendas agrupadas por dia (todas as origens), no formato que mediasPorDia espera. */
async function carregarHistorico(db) {
  const [{ results }, { results: fora }] = await Promise.all([
    db.prepare(`SELECT p.dia, ip.nome AS produto, SUM(ip.quantidade) AS quantidade
                FROM item_pedido ip JOIN pedido p ON p.id = ip.pedido_id
                WHERE p.status NOT IN ('cancelado', 'aguardando_pagamento', 'aberta')
                GROUP BY p.dia, ip.nome ORDER BY p.dia`).all(),
    db.prepare('SELECT dia, motivo FROM dia_fora_da_media').all(),
  ]);
  const motivo = new Map(fora.map((f) => [f.dia, f.motivo]));
  const dias = new Map();
  for (const r of results) {
    if (!dias.has(r.dia)) dias.set(r.dia, { dia: r.dia, fora_da_media: motivo.get(r.dia) ?? null, itens: [] });
    dias.get(r.dia).itens.push({ produto: r.produto, quantidade: r.quantidade });
  }
  return [...dias.values()];
}

async function estoqueAtual(db) {
  const { results } = await db.prepare(
    'SELECT i.nome, COALESCE(SUM(m.quantidade), 0) AS q FROM insumo i LEFT JOIN movimento_estoque m ON m.insumo_id = i.id GROUP BY i.id').all();
  return new Map(results.map((r) => [r.nome, r.q]));
}

async function folga(db) {
  const r = await db.prepare("SELECT valor FROM configuracao WHERE chave = 'folga_minimo'").first();
  return r ? Number(r.valor) : 0.2;
}

const diaCompra = (url) => (url.searchParams.get('dia') === 'segunda' ? 'segunda' : 'quinta');
const precoDe = (i) => i.preco_unidade ?? i.preco_referencia ?? null;

// ---------------- rotas de leitura ----------------

async function getEstoque(db, url) {
  const dia = diaCompra(url);
  const [insumos, produtos, historico, atual, f] = await Promise.all([
    carregarInsumos(db), carregarProdutos(db), carregarHistorico(db), estoqueAtual(db), folga(db)]);
  const painel = painelEstoque({ insumos, produtos, historico, atual, dia, folga: f });
  const porNome = new Map(insumos.map((i) => [i.nome, i]));
  return json({
    dia, folga: f,
    itens: painel.map((l) => {
      const i = porNome.get(l.insumo);
      return {
        insumo_id: i.id, insumo: l.insumo, tipo: i.tipo, embalagem: i.embalagem, atual: r2(l.atual),
        minimo_alerta: i.minimo_alerta ?? null, alerta: i.minimo_alerta != null && r2(l.atual) <= i.minimo_alerta,
        minimo_segunda: l.minimo_segunda, minimo_quinta: l.minimo_quinta, auto_segunda: l.auto_segunda, auto_quinta: l.auto_quinta,
        estoque_recomendado_segunda: i.estoque_recomendado_segunda ?? null, estoque_recomendado_quinta: i.estoque_recomendado_quinta ?? null, sugestao: l.sugestao, situacao: l.situacao,
        fornecedor: i.fornecedor, producao_propria: i.producao_propria,
      };
    }),
  });
}

/** Calcula a lista de compras sugerida para o dia, agrupada por fornecedor. */
async function calcularLista(db, dia) {
  const [insumos, produtos, historico, atual, f] = await Promise.all([
    carregarInsumos(db), carregarProdutos(db), carregarHistorico(db), estoqueAtual(db), folga(db)]);
  const painel = painelEstoque({ insumos, produtos, historico, atual, dia, folga: f });
  const porNome = new Map(insumos.map((i) => [i.nome, i]));
  const grupos = new Map();
  const producao = [];
  for (const l of painel) {
    if (!(l.sugestao > 0)) continue;
    const i = porNome.get(l.insumo);
    if (i.producao_propria) { producao.push({ insumo_id: i.id, insumo: l.insumo, quantidade: l.sugestao, embalagem: i.embalagem }); continue; }
    const fo = i.fornecedor ?? 'Sem fornecedor';
    if (!grupos.has(fo)) grupos.set(fo, { fornecedor: fo, itens: [], total_estimado: 0, tem_preco_estimado: false });
    const g = grupos.get(fo);
    const preco = precoDe(i);
    g.itens.push({ insumo_id: i.id, insumo: l.insumo, quantidade: l.sugestao, embalagem: i.embalagem, preco_unidade: preco,
      tem: r2(l.atual), recomendado: dia === 'segunda' ? l.minimo_segunda : l.minimo_quinta, recomendado_manual: l.recomendado_manual });
    if (preco != null) g.total_estimado = r2(g.total_estimado + preco * l.sugestao);
    if (i.preco_unidade == null) g.tem_preco_estimado = true;
  }
  const { results: forn } = await db.prepare('SELECT nome, como_recebe FROM fornecedor').all();
  const como = new Map(forn.map((x) => [x.nome, x.como_recebe]));
  const lista = [...grupos.values()].map((g) => ({ ...g, como_recebe: como.get(g.fornecedor) ?? null })).sort(ordemFornecedor);
  return { dia, fornecedores: lista, producao, total_estimado: r2(lista.reduce((t, g) => t + g.total_estimado, 0)) };
}
// Hortifruti/Ceasa vai por último, como na planilha.
const ordemFornecedor = (a, b) => (a.fornecedor === 'Ceasa') - (b.fornecedor === 'Ceasa') || a.fornecedor.localeCompare(b.fornecedor, 'pt-BR');

async function getListaCompras(db, url) {
  return json({ ...(await calcularLista(db, diaCompra(url))), gerado_em: new Date().toISOString() });
}

async function getProdutos(db) {
  const [insumos, produtos] = await Promise.all([carregarInsumos(db), carregarProdutos(db)]);
  const porNome = new Map(insumos.map((i) => [i.nome, i]));
  const precos = new Map(insumos.map((i) => [i.nome, precoDe(i)]));
  return json(produtos.map((p) => {
    const c = cmv(p, porNome, precos);
    const lucro = p.preco_venda != null ? p.preco_venda - c : null;
    return {
      id: p.id, produto: p.nome, categoria: p.categoria ?? null, preco_venda: p.preco_venda, cmv: r2(c), lucro: lucro == null ? null : r2(lucro),
      lucro_pct: lucro == null || !p.preco_venda ? null : Math.round((lucro / p.preco_venda) * 1000) / 10,
      tem_ficha: p.ficha.length > 0 || !p.baixa_estoque, ficha: p.ficha,
    };
  }));
}

// ---------------- rotas de escrita (exigem token) ----------------

const autorizado = async (request, env) => !!(await usuarioLogado(request, env));

/** Lê um relatório de vendas no formato do sistema: Produto,UN,Estoque,Qtd. vendida,Total vendas */
export function lerRelatorioCSV(texto) {
  const itens = [];
  for (const linha of texto.split(/\r?\n/).slice(1)) {
    if (!linha.trim()) continue;
    const campos = [];
    let atual = '', aspas = false;
    for (const ch of linha) {
      if (ch === '"') aspas = !aspas;
      else if (ch === ',' && !aspas) { campos.push(atual); atual = ''; } else atual += ch;
    }
    campos.push(atual);
    if (campos.length < 5 || !campos[0].trim()) continue;
    const quantidade = Number(campos[3].replace(/\./g, ''));
    const total = Number(campos[4].replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(quantidade)) continue;
    itens.push({ produto: campos[0].trim(), quantidade, total: Number.isFinite(total) ? total : 0 });
  }
  return itens;
}

/** POST /api/vendas/relatorio  { dia: 'YYYY-MM-DD', csv: '...' } — importa o relatório do dia e dá baixa no estoque. */
async function postRelatorio(db, body) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body?.dia ?? '')) return erro('Informe o dia no formato AAAA-MM-DD');
  const itens = lerRelatorioCSV(body.csv ?? '');
  if (!itens.length) return erro('Não encontrei nenhuma linha de venda no relatório');
  const id = `rel-${body.dia}`;
  const doBalcao = await db.prepare("SELECT COUNT(*) AS n FROM pedido WHERE origem IN ('balcao', 'celular') AND dia = ? AND status NOT IN ('cancelado', 'aberta', 'aguardando_pagamento')").bind(body.dia).first();
  if (doBalcao.n && !body.forcar) return erro(`Esse dia já tem ${doBalcao.n} venda(s) lançadas na tela de venda do Mukifo. Importar o relatório também contaria tudo em dobro no estoque.`, 409);
  if (await db.prepare('SELECT 1 FROM pedido WHERE id = ?').bind(id).first()) return erro(`O relatório de ${body.dia} já foi importado`, 409);

  const [insumos, produtos] = await Promise.all([carregarInsumos(db), carregarProdutos(db)]);
  const idProduto = new Map(produtos.map((p) => [p.nome_normalizado, p.id]));
  const vendidos = new Map();
  for (const it of itens) vendidos.set(normalizarNome(it.produto), (vendidos.get(normalizarNome(it.produto)) ?? 0) + it.quantidade);
  const baixa = consumoPorVendas(insumos, produtos, vendidos);

  const stmts = [db.prepare(`INSERT INTO pedido (id, numero, dia, origem, status, total) VALUES (?, 'REL', ?, 'relatorio', 'entregue', ?)`)
    .bind(id, body.dia, r2(itens.reduce((s, i) => s + i.total, 0)))];
  for (const it of itens) {
    stmts.push(db.prepare('INSERT INTO item_pedido (pedido_id, produto_id, nome, quantidade, preco) VALUES (?, ?, ?, ?, ?)')
      .bind(id, idProduto.get(normalizarNome(it.produto)) ?? null, it.produto, it.quantidade, it.quantidade ? r2(it.total / it.quantidade) : null));
  }
  for (const i of insumos) {
    const q = baixa.get(i.nome);
    if (q > 0) stmts.push(db.prepare(`INSERT INTO movimento_estoque (insumo_id, tipo, quantidade, motivo, referencia) VALUES (?, 'venda', ?, 'relatório do dia', ?)`).bind(i.id, -q, id));
  }
  await db.batch(stmts);
  return json({ ok: true, dia: body.dia, linhas: itens.length, sem_ficha: produtosSemFicha(produtos, vendidos) }, 201);
}

/** POST /api/contagem  { momento: 'fechamento'|'abertura', usuario, itens: [{insumo, contado}] } */
async function postContagem(db, body) {
  const itens = body?.itens ?? [];
  if (!itens.length) return erro('Nenhum item contado');
  const insumos = new Map((await carregarInsumos(db)).map((i) => [i.nome, i]));
  const atual = await estoqueAtual(db);
  const data = new Date().toISOString();
  const momento = body.momento === 'abertura' ? 'abertura' : 'fechamento';
  const stmts = [];
  const diferencas = [];
  for (const { insumo, contado } of itens) {
    const i = insumos.get(insumo);
    if (!i || !Number.isFinite(Number(contado))) return erro(`Item inválido: ${insumo}`);
    const esperado = atual.get(insumo) ?? 0;
    const dif = Number(contado) - esperado;
    stmts.push(db.prepare('INSERT INTO contagem (data, momento, insumo_id, esperado, contado, usuario) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(data, momento, i.id, esperado, Number(contado), body.usuario ?? null));
    if (Math.abs(dif) > 1e-9) {
      stmts.push(db.prepare(`INSERT INTO movimento_estoque (insumo_id, tipo, quantidade, custo, motivo, usuario) VALUES (?, 'diferenca_contagem', ?, ?, ?, ?)`)
        .bind(i.id, dif, precoDe(i) == null ? null : r2(dif * precoDe(i)), `contagem de ${momento}`, body.usuario ?? null));
      diferencas.push({ insumo, esperado: r2(esperado), contado: Number(contado), diferenca: r2(dif), valor: precoDe(i) == null ? null : r2(dif * precoDe(i)) });
    }
  }
  await db.batch(stmts);
  return json({ ok: true, itens: itens.length, diferencas }, 201);
}

/** Registra uma compra: entrada no estoque e atualização do preço. Devolve {erro} ou {compra_id, total}. */
export async function registrarCompra(db, { fornecedor, data, usuario, itens }) {
  const insumos = new Map((await carregarInsumos(db)).map((i) => [i.nome, i]));
  for (const it of itens) if (!insumos.has(it.insumo) || !(Number(it.quantidade) > 0)) return { erro: `Item inválido: ${it.insumo}` };
  const forn = fornecedor ? await db.prepare('SELECT id FROM fornecedor WHERE nome = ?').bind(fornecedor).first() : null;
  const total = r2(itens.reduce((t, i) => t + (Number(i.valor_pago) || 0), 0));
  const compra = await db.prepare('INSERT INTO compra (fornecedor_id, data, total, registrado_por) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(forn?.id ?? null, data ?? new Date().toISOString().slice(0, 10), total, usuario ?? null).first();
  const stmts = [];
  for (const it of itens) {
    const i = insumos.get(it.insumo);
    const q = Number(it.quantidade);
    const valor = Number(it.valor_pago) || null;
    stmts.push(db.prepare('INSERT INTO item_compra (compra_id, insumo_id, quantidade, valor_pago) VALUES (?, ?, ?, ?)').bind(compra.id, i.id, q, valor));
    stmts.push(db.prepare('INSERT INTO movimento_estoque (insumo_id, tipo, quantidade, custo, referencia, usuario) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(i.id, i.producao_propria ? 'producao' : 'compra', q, valor, `compra-${compra.id}`, usuario ?? null));
    if (valor) stmts.push(db.prepare('UPDATE insumo SET preco_unidade = ? WHERE id = ?').bind(r2(valor / q), i.id));
  }
  await db.batch(stmts);
  return { compra_id: compra.id, total };
}

/** POST /api/compras  { fornecedor, data?, itens: [{insumo, quantidade, valor_pago}] } */
async function postCompra(db, body) {
  const itens = body?.itens ?? [];
  if (!itens.length) return erro('Nenhum item na compra');
  const r = await registrarCompra(db, { ...body, itens });
  return r.erro ? erro(r.erro) : json({ ok: true, ...r }, 201);
}

// ---------------- lista de compras no celular ----------------

async function lerLista(db, id) {
  const lista = await db.prepare('SELECT * FROM lista_compras WHERE id = ?').bind(id).first();
  if (!lista) return null;
  const { results } = await db.prepare(
    `SELECT il.*, i.nome AS insumo, i.embalagem, COALESCE(i.preco_unidade, i.preco_referencia) AS preco_unidade
     FROM item_lista il JOIN insumo i ON i.id = il.insumo_id WHERE il.lista_id = ? ORDER BY il.ordem, il.id`).bind(id).all();
  const grupos = new Map();
  for (const it of results) {
    const f = it.fornecedor ?? 'Sem fornecedor';
    if (!grupos.has(f)) grupos.set(f, { fornecedor: f, itens: [] });
    grupos.get(f).itens.push({ ...it, comprado: !!it.comprado });
  }
  const itens = results.length;
  const comprados = results.filter((i) => i.comprado).length;
  return { ...lista, itens_total: itens, itens_comprados: comprados, fornecedores: [...grupos.values()].sort(ordemFornecedor) };
}

async function getListaAtual(db) {
  const r = await db.prepare("SELECT id FROM lista_compras WHERE status = 'aberta' ORDER BY id DESC LIMIT 1").first();
  return json({ lista: r ? await lerLista(db, r.id) : null });
}

/** POST /api/listas { dia, usuario? } — gera a lista a partir da sugestão (cancela a lista aberta anterior). */
async function postLista(db, body) {
  const dia = body?.dia === 'segunda' ? 'segunda' : 'quinta';
  const calc = await calcularLista(db, dia);
  await db.prepare("UPDATE lista_compras SET status = 'cancelada' WHERE status = 'aberta'").run();
  const l = await db.prepare('INSERT INTO lista_compras (dia_compra, usuario) VALUES (?, ?) RETURNING id').bind(dia, body?.usuario ?? null).first();
  const stmts = [];
  let ordem = 0;
  for (const g of calc.fornecedores) for (const it of g.itens) {
    stmts.push(db.prepare('INSERT INTO item_lista (lista_id, insumo_id, fornecedor, ordem, quantidade_sugerida) VALUES (?, ?, ?, ?, ?)')
      .bind(l.id, it.insumo_id, g.fornecedor, ordem++, it.quantidade));
  }
  if (stmts.length) await db.batch(stmts);
  return json({ lista: await lerLista(db, l.id) }, 201);
}

/** POST /api/listas/:id/itens { insumo, quantidade } — adiciona um item esquecido. */
async function postItemLista(db, id, body) {
  const lista = await db.prepare("SELECT status FROM lista_compras WHERE id = ?").bind(id).first();
  if (!lista) return erro('Lista não encontrada', 404);
  if (lista.status !== 'aberta') return erro('Esta lista já foi fechada', 409);
  const i = await db.prepare(
    'SELECT i.id, f.nome AS fornecedor FROM insumo i LEFT JOIN fornecedor f ON f.id = i.fornecedor_id WHERE i.nome = ?').bind(body?.insumo ?? '').first();
  const q = Number(body?.quantidade);
  if (!i || !(q > 0)) return erro('Escolha um item e a quantidade');
  await db.prepare(`INSERT INTO item_lista (lista_id, insumo_id, fornecedor, ordem, quantidade_sugerida) VALUES (?, ?, ?, 9999, ?)
                    ON CONFLICT (lista_id, insumo_id) DO UPDATE SET quantidade_sugerida = excluded.quantidade_sugerida`)
    .bind(id, i.id, i.fornecedor ?? 'Sem fornecedor', q).run();
  return json({ lista: await lerLista(db, id) }, 201);
}

/** PATCH /api/listas/:id/itens/:item { comprado?, quantidade_comprada?, valor_pago? } */
async function patchItemLista(db, id, itemId, body) {
  const it = await db.prepare(
    'SELECT il.*, l.status FROM item_lista il JOIN lista_compras l ON l.id = il.lista_id WHERE il.id = ? AND il.lista_id = ?').bind(itemId, id).first();
  if (!it) return erro('Item não encontrado', 404);
  if (it.status !== 'aberta') return erro('Esta lista já foi fechada', 409);
  const comprado = body.comprado === undefined ? !!it.comprado : !!body.comprado;
  const num = (v, atual) => (v === undefined ? atual : v === null || v === '' ? null : Number(v));
  const qc = num(body.quantidade_comprada, it.quantidade_comprada);
  const vp = num(body.valor_pago, it.valor_pago);
  if ((qc != null && !(qc >= 0)) || (vp != null && !(vp >= 0))) return erro('Número inválido');
  await db.prepare('UPDATE item_lista SET comprado = ?, comprado_em = ?, quantidade_comprada = ?, valor_pago = ? WHERE id = ?')
    .bind(comprado ? 1 : 0, comprado ? (it.comprado_em ?? new Date().toISOString()) : null, qc, vp, itemId).run();
  return json({ ok: true });
}

/** POST /api/listas/:id/finalizar — o que foi marcado entra no estoque como compra (uma por fornecedor). */
async function finalizarLista(db, id, body) {
  const lista = await lerLista(db, id);
  if (!lista) return erro('Lista não encontrada', 404);
  if (lista.status !== 'aberta') return erro('Esta lista já foi fechada', 409);
  const compras = [];
  for (const g of lista.fornecedores) {
    const itens = g.itens.filter((i) => i.comprado && (i.quantidade_comprada ?? i.quantidade_sugerida) > 0)
      .map((i) => ({ insumo: i.insumo, quantidade: i.quantidade_comprada ?? i.quantidade_sugerida, valor_pago: i.valor_pago }));
    if (!itens.length) continue;
    const r = await registrarCompra(db, { fornecedor: g.fornecedor, usuario: body?.usuario, itens });
    if (r.erro) return erro(r.erro);
    compras.push({ fornecedor: g.fornecedor, itens: itens.length, ...r });
  }
  await db.prepare("UPDATE lista_compras SET status = 'finalizada', finalizada_em = datetime('now') WHERE id = ?").bind(id).run();
  const faltaram = lista.fornecedores.flatMap((g) => g.itens.filter((i) => !i.comprado).map((i) => i.insumo));
  return json({ ok: true, compras, faltaram });
}

/** PUT /api/alertas { itens: [{ insumo_id, minimo_alerta }] } — define (ou limpa, com null) o nível de alerta de cada item. */
async function putAlertas(db, body) {
  const itens = Array.isArray(body?.itens) ? body.itens : null;
  if (!itens?.length) return erro('Nenhum item para salvar.');
  const stmts = [];
  for (const it of itens) {
    const id = Number(it.insumo_id);
    let v = it.minimo_alerta;
    if (v === '' || v === undefined) v = null;
    if (v !== null) { v = Number(v); if (!Number.isFinite(v) || v < 0) return erro('O nível de alerta precisa ser um número maior ou igual a zero.'); }
    if (!Number.isInteger(id)) return erro('Item inválido.');
    stmts.push(db.prepare('UPDATE insumo SET minimo_alerta = ? WHERE id = ?').bind(v, id));
  }
  await db.batch(stmts);
  return json({ ok: true, salvos: stmts.length });
}

/** PUT /api/recomendados { itens: [{ insumo_id, segunda?, quinta?, estoque_recomendado? }] } — quanto o bar quer ter de cada item
 *  em cada dia de compra (null = automático). `estoque_recomendado` sozinho vale para os dois dias. */
async function putRecomendados(db, body) {
  const itens = Array.isArray(body?.itens) ? body.itens : null;
  if (!itens?.length) return erro('Nenhum item para salvar.');
  const stmts = [];
  const ler = (v) => { if (v === '' || v === undefined || v === null) return null; v = Number(v); return Number.isFinite(v) && v >= 0 && v <= 100000 ? v : NaN; };
  for (const it of itens) {
    const id = Number(it.insumo_id);
    if (!Number.isInteger(id)) return erro('Item inválido.');
    const set = [], b = [];
    for (const [campo, col] of [['segunda', 'estoque_recomendado_segunda'], ['quinta', 'estoque_recomendado_quinta']]) {
      const bruto = campo in it ? it[campo] : 'estoque_recomendado' in it ? it.estoque_recomendado : undefined;
      if (bruto === undefined) continue;
      const v = ler(bruto); if (Number.isNaN(v)) return erro('O estoque recomendado precisa ser um número maior ou igual a zero.');
      set.push(`${col} = ?`); b.push(v);
    }
    if (set.length) stmts.push(db.prepare(`UPDATE insumo SET ${set.join(', ')} WHERE id = ?`).bind(...b, id));
  }
  if (!stmts.length) return erro('Nenhum item para salvar.');
  await db.batch(stmts);
  return json({ ok: true, salvos: stmts.length });
}

// ---------------- roteador ----------------

export async function rotearApi(request, env, url) {
  const db = env.DB;
  if (!db) return erro('Banco de dados ainda não configurado (fase 2: ver README)', 503);
  const m = request.method;
  const p = url.pathname;
  if (p.startsWith('/api/auth/') || p === '/api/usuarios' || p === '/api/modulos' || p.startsWith('/api/usuarios/')) return rotearAuth(request, env, url);
  const modulo = moduloDaRota(p);
  if (modulo) {   // painel de permissões: o servidor também barra, não só esconde o botão
    const eu = await usuarioLogado(request, env);
    if (eu && !eu.modulos.includes(modulo)) return erro('Seu login não tem acesso a esta parte. Peça ao superadmin.', 403);
  }
  if (p.startsWith('/api/fotos')) return rotearFotos(request, env, url);
  if (p.startsWith('/api/venda/')) return rotearVenda(request, env, url);
  if (p.startsWith('/api/cliente/')) return rotearCliente(request, env, url);
  if (p.startsWith('/api/financeiro/')) return rotearFinanceiro(request, env, url);
  if (p.startsWith('/api/conta/')) return rotearConta(request, env, url);
  if (p === '/api/clientes' || p.startsWith('/api/clientes/')) return rotearClientes(request, env, url);
  if (p === '/api/producao' || p.startsWith('/api/producao/')) return rotearProducao(request, env, url);
  if (p === '/api/fornecedores' || p.startsWith('/api/fornecedores/')) return rotearFornecedores(request, env, url);
  if (p === '/api/planilhas' || p.startsWith('/api/planilhas/')) return rotearPlanilhas(request, env, url);
  if (p === '/api/desempenho' && request.method === 'GET') return getDesempenho(request, env, url);
  if (p === '/api/combos' || p.startsWith('/api/combos/')) return rotearCombos(request, env, url);
  if (m === 'GET' && p === '/api/estoque') return getEstoque(db, url);
  if (m === 'GET' && p === '/api/lista-compras') return getListaCompras(db, url);
  if (m === 'GET' && p === '/api/produtos') return getProdutos(db);
  if (p === '/api/produtos' || p.startsWith('/api/produtos/')) return rotearProdutos(request, env, url);
  if (m === 'GET' && p === '/api/insumos') {
    const { results } = await db.prepare('SELECT id, nome, embalagem, unidade_ficha FROM insumo WHERE ativo = 1 ORDER BY nome').all();
    return json(results);
  }

  if (p.startsWith('/api/listas')) {
    if (!(await autorizado(request, env))) return erro('Entre com seu nome e senha', 401);
    let body = {};
    if (m === 'POST' || m === 'PATCH') { try { body = await request.json(); } catch { body = {}; } }
    let k;
    if (m === 'GET' && p === '/api/listas/atual') return getListaAtual(db);
    if (m === 'POST' && p === '/api/listas') return postLista(db, body);
    if (m === 'POST' && (k = p.match(/^\/api\/listas\/(\d+)\/itens$/))) return postItemLista(db, Number(k[1]), body);
    if (m === 'PATCH' && (k = p.match(/^\/api\/listas\/(\d+)\/itens\/(\d+)$/))) return patchItemLista(db, Number(k[1]), Number(k[2]), body);
    if (m === 'POST' && (k = p.match(/^\/api\/listas\/(\d+)\/finalizar$/))) return finalizarLista(db, Number(k[1]), body);
    return null;
  }
  if (m === 'PUT' && p === '/api/alertas') {
    if (!(await autorizado(request, env))) return erro('Entre com seu nome e senha', 401);
    let body; try { body = await request.json(); } catch { return erro('Corpo da requisição não é JSON'); }
    return putAlertas(db, body);
  }
  if (request.method === 'PUT' && p === '/api/recomendados') {
    if (!(await autorizado(request, env))) return erro('Entre com seu nome e senha', 401);
    let body; try { body = await request.json(); } catch { return erro('Corpo da requisição não é JSON'); }
    return putRecomendados(db, body);
  }
  if (m === 'POST' && ['/api/vendas/relatorio', '/api/contagem', '/api/compras'].includes(p)) {
    if (!(await autorizado(request, env))) return erro('Entre com seu nome e senha', 401);
    let body;
    try { body = await request.json(); } catch { return erro('Corpo da requisição não é JSON'); }
    if (p === '/api/vendas/relatorio') return postRelatorio(db, body);
    if (p === '/api/contagem') return postContagem(db, body);
    return postCompra(db, body);
  }
  return null;
}
