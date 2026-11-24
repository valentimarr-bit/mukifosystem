// Módulo de venda: cardápio por categoria, comandas, cobranças (com roteirização por maquininha) e baixa do estoque.
import { json } from './api.js';
import { usuarioLogado } from './auth.js';
import { ordenarCategorias } from './dominio/categorias.js';
import { escolherMaquininha } from './pagamentos/roteador.js';
import { validarRetirada, listarRetiradas, lerPix, salvarPix } from './cliente.js';
import { conferirEstoque, disponibilidade, travaLigada } from './trava.js';
import { enviarCobranca, naviConfigurado } from './pagamentos/navi.js';

const erro = (msg, status = 400) => json({ erro: msg }, status);
const r2 = (x) => Math.round(x * 100) / 100;
const FORMAS = ['pix', 'debito', 'credito', 'dinheiro'];
const ABERTAS = ['aberta', 'aguardando_pagamento'];

/** O "dia" do bar vira às 6h (horário de Brasília): vendas da 1h da manhã de sábado contam para sexta. */
export { lerComanda, conferirQuitacao, getCardapio, r2, id8, erro };
export function diaDoTurno(agora = new Date()) {
  return new Date(agora.getTime() - (3 + 6) * 3600e3).toISOString().slice(0, 10);
}
const id8 = () => [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('');

async function lerComanda(db, id) {
  const p = await db.prepare('SELECT id, numero, dia, origem, mesa, nome_cliente, status, pagamento, total, operador, criado_em, pago_em FROM pedido WHERE id = ? AND origem IN (?, ?)').bind(id, 'balcao', 'celular').first();
  if (!p) return null;
  const [{ results: itens }, { results: cobrancas }] = await Promise.all([
    db.prepare('SELECT id, produto_id, nome, quantidade, preco FROM item_pedido WHERE pedido_id = ? ORDER BY id').bind(id).all(),
    db.prepare(`SELECT c.id, c.forma, c.valor, c.status, c.maquininha_id, m.nome AS maquininha, c.criada_em, c.paga_em
                FROM cobranca c LEFT JOIN maquininha m ON m.id = c.maquininha_id WHERE c.pedido_id = ? ORDER BY c.criada_em, c.id`).bind(id).all()]);
  const pago = r2(cobrancas.filter((c) => c.status === 'paga').reduce((s, c) => s + c.valor, 0));
  const pendente = r2(cobrancas.filter((c) => c.status === 'pendente').reduce((s, c) => s + c.valor, 0));
  return { ...p, itens, cobrancas, pago, pendente, restante: r2(Math.max(0, p.total - pago - pendente)) };
}

async function recalcular(db, pedidoId) {
  const t = await db.prepare('SELECT COALESCE(SUM(quantidade * preco), 0) AS total FROM item_pedido WHERE pedido_id = ?').bind(pedidoId).first();
  await db.prepare('UPDATE pedido SET total = ? WHERE id = ?').bind(r2(t.total), pedidoId).run();
  return r2(t.total);
}

/** Baixa do estoque pela ficha técnica dos itens da comanda (sem arredondar para cima: é uma venda só). */
async function darBaixa(db, pedidoId) {
  if (await db.prepare("SELECT 1 AS ok FROM movimento_estoque WHERE tipo = 'venda' AND referencia = ?").bind(pedidoId).first()) return;
  // Produto comum baixa pela própria ficha; combo baixa pela ficha de cada produto que o compõe.
  const { results } = await db.prepare(
    `SELECT insumo_id, SUM(q) AS q FROM (
       SELECT ft.insumo_id, ft.quantidade * ip.quantidade / i.conteudo AS q
       FROM item_pedido ip JOIN ficha_tecnica ft ON ft.produto_id = ip.produto_id JOIN insumo i ON i.id = ft.insumo_id WHERE ip.pedido_id = ?
       UNION ALL
       SELECT ft.insumo_id, ft.quantidade * ip.quantidade * ci.quantidade / i.conteudo
       FROM item_pedido ip JOIN combo_item ci ON ci.combo_id = ip.produto_id JOIN ficha_tecnica ft ON ft.produto_id = ci.produto_id JOIN insumo i ON i.id = ft.insumo_id WHERE ip.pedido_id = ?
     ) GROUP BY insumo_id`).bind(pedidoId, pedidoId).all();
  if (!results.length) return;
  await db.batch(results.filter((r) => r.q > 0).map((r) =>
    db.prepare(`INSERT INTO movimento_estoque (insumo_id, tipo, quantidade, motivo, referencia) VALUES (?, 'venda', ?, 'venda no balcão', ?)`).bind(r.insumo_id, -r.q, pedidoId)));
}

/** Se o que foi pago cobre o total, fecha a venda (e dá baixa no estoque). */
async function conferirQuitacao(db, pedidoId, operador) {
  const c = await lerComanda(db, pedidoId);
  if (!c || !ABERTAS.includes(c.status)) return c;
  if (c.total > 0 && c.pago + 0.005 >= c.total) {
    const formas = [...new Set(c.cobrancas.filter((x) => x.status === 'paga').map((x) => x.forma))];
    const ultima = [...c.cobrancas].reverse().find((x) => x.status === 'paga' && x.maquininha);
    await db.prepare(`UPDATE pedido SET status = ?, pagamento = ?, pago_em = datetime('now'), terminal = ?, operador = COALESCE(operador, ?) WHERE id = ?`)
      .bind(c.origem === 'celular' ? 'recebido' : 'entregue', formas.length === 1 ? formas[0] : 'misto', ultima?.maquininha ?? null, operador, pedidoId).run();
    await darBaixa(db, pedidoId);
  } else if (c.status === 'aguardando_pagamento' && !c.cobrancas.some((x) => x.status === 'pendente')) {
    await db.prepare("UPDATE pedido SET status = 'aberta' WHERE id = ?").bind(pedidoId).run();
  }
  return lerComanda(db, pedidoId);
}

async function getCardapio(db) {
  const { results } = await db.prepare(
    `SELECT id, nome, categoria, preco_venda AS preco FROM produto WHERE ativo = 1 AND preco_venda IS NOT NULL ORDER BY nome`).all();
  const disp = await disponibilidade(db, results.map((p) => p.id));
  const porCat = new Map();
  for (const p of results) {
    const c = p.categoria ?? 'Outros';
    if (!porCat.has(c)) porCat.set(c, []);
    const r = disp.get(p.id);   // quantas dá para vender; só informado quando é pouco (não expõe o estoque todo)
    porCat.get(c).push({ id: p.id, nome: p.nome, preco: p.preco, restam: r != null && r <= 20 ? r : null });
  }
  const r = json({ categorias: ordenarCategorias(porCat.keys()).map((nome) => ({ nome, produtos: porCat.get(nome) })) });
  r.headers.set('cache-control', 'public, max-age=5, s-maxage=10');   // o cardápio é lido por todo cliente; 5 s alivia o banco (a trava no servidor continua valendo)
  return r;
}

async function maquininhasEModo(db) {
  const [{ results }, cfg] = await Promise.all([
    db.prepare('SELECT id, nome, serie, provedor, ativa, padrao FROM maquininha ORDER BY id').all(),
    db.prepare("SELECT valor FROM configuracao WHERE chave = 'roteamento'").first()]);
  return { maquininhas: results.map((m) => ({ ...m, ativa: !!m.ativa, padrao: !!m.padrao })), modo: cfg?.valor === 'equilibrar' ? 'equilibrar' : 'padrao' };
}

async function novaComanda(db, corpo, operador) {
  const mesa = String(corpo?.mesa ?? '').trim().slice(0, 40) || null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const dia = diaDoTurno();
    const r = await db.prepare("SELECT COALESCE(MAX(CAST(numero AS INTEGER)), 0) AS n FROM pedido WHERE dia = ? AND origem = 'balcao'").bind(dia).first();
    const numero = String(r.n + 1), id = `bal-${dia}-${numero}-${id8()}`;
    try {
      await db.prepare("INSERT INTO pedido (id, numero, dia, origem, status, mesa, operador, total) VALUES (?, ?, ?, 'balcao', 'aberta', ?, ?, 0)").bind(id, numero, dia, mesa, operador).run();
      return json({ comanda: await lerComanda(db, id) }, 201);
    } catch { /* número repetido por pedidos simultâneos: tenta de novo */ }
  }
  return erro('Não consegui abrir a comanda. Tente de novo.', 409);
}

async function mudarItem(db, id, corpo) {
  const c = await lerComanda(db, id);
  if (!c) return erro('Comanda não encontrada.', 404);
  if (!ABERTAS.includes(c.status)) return erro('Essa comanda já foi fechada.', 409);
  const delta = Number(corpo?.delta);
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 99) return erro('Quantidade inválida.');
  const p = await db.prepare('SELECT id, nome, preco_venda FROM produto WHERE id = ? AND ativo = 1').bind(Number(corpo?.produto_id)).first();
  if (!p || p.preco_venda == null) return erro('Produto não encontrado ou sem preço.', 404);
  const linha = c.itens.find((i) => i.produto_id === p.id);
  if (delta > 0) {
    const demanda = new Map(c.itens.map((i) => [i.produto_id, i.quantidade]));
    demanda.set(p.id, (linha?.quantidade ?? 0) + delta);
    const falta = await conferirEstoque(db, demanda, { exceto: id, nomes: new Map([[p.id, p.nome]]) });
    if (falta) return erro(falta.erro, 409);
  }
  if (linha) {
    const q = linha.quantidade + delta;
    await (q > 0 ? db.prepare('UPDATE item_pedido SET quantidade = ? WHERE id = ?').bind(q, linha.id)
                 : db.prepare('DELETE FROM item_pedido WHERE id = ?').bind(linha.id)).run();
  } else if (delta > 0) {
    await db.prepare('INSERT INTO item_pedido (pedido_id, produto_id, nome, quantidade, preco) VALUES (?, ?, ?, ?, ?)').bind(id, p.id, p.nome, delta, p.preco_venda).run();
  }
  const total = await recalcular(db, id);
  if (c.pago > total + 0.005 || (c.pago + c.pendente > total + 0.005 && c.pendente > 0)) {
    // desfaz: não deixa o total ficar abaixo do que já foi cobrado
    if (linha) await db.prepare('UPDATE item_pedido SET quantidade = ? WHERE id = ?').bind(linha.quantidade, linha.id).run();
    else await db.prepare('DELETE FROM item_pedido WHERE pedido_id = ? AND produto_id = ?').bind(id, p.id).run();
    await recalcular(db, id);
    return erro('Esse valor já foi cobrado. Cancele a cobrança pendente antes de tirar itens.', 409);
  }
  return json({ comanda: await lerComanda(db, id) });
}

async function cobrar(db, env, id, corpo, eu) {
  const c = await lerComanda(db, id);
  if (!c) return erro('Comanda não encontrada.', 404);
  if (!ABERTAS.includes(c.status)) return erro('Essa comanda já foi fechada.', 409);
  const forma = String(corpo?.forma ?? '');
  if (!FORMAS.includes(forma)) return erro('Escolha a forma de pagamento.');
  if (c.total <= 0) return erro('A comanda está vazia.');
  const valor = corpo?.valor === undefined || corpo?.valor === null || corpo?.valor === '' ? c.restante : r2(Number(corpo.valor));
  if (!Number.isFinite(valor) || valor <= 0) return erro('Valor inválido.');
  if (valor > c.restante + 0.005) return erro(`O valor passa do que falta cobrar (R$ ${c.restante.toFixed(2).replace('.', ',')}).`);

  let maquininha = null, motivo = null;
  if (forma !== 'dinheiro') {
    const { maquininhas, modo } = await maquininhasEModo(db);
    const { results } = await db.prepare("SELECT maquininha_id, COUNT(*) AS n FROM cobranca WHERE status = 'pendente' AND maquininha_id IS NOT NULL GROUP BY maquininha_id").all();
    const e = escolherMaquininha({ explicita: corpo?.maquininha_id ?? null, modo, maquininhas, pendentes: new Map(results.map((r) => [r.maquininha_id, r.n])) });
    if (e.erro) return erro(e.erro, 409);
    maquininha = e.maquininha; motivo = e.motivo;
  }
  const cid = `cob-${id8()}${id8()}`;
  const paga = forma === 'dinheiro';
  await db.batch([
    db.prepare(`INSERT INTO cobranca (id, pedido_id, maquininha_id, forma, valor, status, operador, paga_em) VALUES (?, ?, ?, ?, ?, ?, ?, ${paga ? "datetime('now')" : 'NULL'})`)
      .bind(cid, id, maquininha?.id ?? null, forma, valor, paga ? 'paga' : 'pendente', eu.nome),
    db.prepare("UPDATE pedido SET status = 'aguardando_pagamento' WHERE id = ? AND status = 'aberta'").bind(id),
  ]);
  const envio = maquininha ? await enviarCobranca(env, { id: cid, forma, valor, pedido: id }, maquininha) : { modo: 'manual' };
  const comanda = await conferirQuitacao(db, id, eu.nome);
  return json({ ok: true, cobranca_id: cid, maquininha: maquininha?.nome ?? null, motivo, envio, naviConfigurado: naviConfigurado(env), comanda }, 201);
}

async function mudarCobranca(db, cid, acao, eu) {
  const c = await db.prepare('SELECT id, pedido_id, status FROM cobranca WHERE id = ?').bind(cid).first();
  if (!c) return erro('Cobrança não encontrada.', 404);
  if (c.status !== 'pendente') return erro(c.status === 'paga' ? 'Essa cobrança já foi paga.' : 'Essa cobrança já foi cancelada.', 409);
  if (acao === 'confirmar') await db.prepare("UPDATE cobranca SET status = 'paga', paga_em = datetime('now'), operador = ? WHERE id = ?").bind(eu.nome, cid).run();
  else await db.prepare("UPDATE cobranca SET status = 'cancelada' WHERE id = ?").bind(cid).run();
  return json({ ok: true, comanda: await conferirQuitacao(db, c.pedido_id, eu.nome) });
}

async function cancelarComanda(db, id) {
  const c = await lerComanda(db, id);
  if (!c) return erro('Comanda não encontrada.', 404);
  if (!ABERTAS.includes(c.status)) return erro('Essa comanda já foi fechada.', 409);
  if (c.pago > 0) return erro('Já houve pagamento nessa comanda; não dá para cancelar.', 409);
  await db.batch([
    db.prepare("UPDATE cobranca SET status = 'cancelada' WHERE pedido_id = ? AND status = 'pendente'").bind(id),
    db.prepare("UPDATE pedido SET status = 'cancelado' WHERE id = ?").bind(id),
  ]);
  return json({ ok: true });
}

async function resumo(db, url) {
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('dia') ?? '') ? url.searchParams.get('dia') : diaDoTurno();
  const [vendas, formas, maqs] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM pedido WHERE origem IN ('balcao','celular') AND dia = ? AND status IN ('entregue','recebido','preparando','pronto')").bind(dia).first(),
    db.prepare(`SELECT c.forma, COUNT(*) AS n, SUM(c.valor) AS total FROM cobranca c JOIN pedido p ON p.id = c.pedido_id
                WHERE p.origem IN ('balcao','celular') AND p.dia = ? AND c.status = 'paga' GROUP BY c.forma ORDER BY total DESC`).bind(dia).all(),
    db.prepare(`SELECT COALESCE(m.nome, 'Dinheiro (sem maquininha)') AS maquininha, COUNT(*) AS n, SUM(c.valor) AS total
                FROM cobranca c JOIN pedido p ON p.id = c.pedido_id LEFT JOIN maquininha m ON m.id = c.maquininha_id
                WHERE p.origem IN ('balcao','celular') AND p.dia = ? AND c.status = 'paga' GROUP BY m.id ORDER BY total DESC`).bind(dia).all()]);
  return json({ dia, vendas: vendas.n, total: r2(vendas.total), por_forma: formas.results, por_maquininha: maqs.results });
}

async function configurarMaquininha(db, id, corpo) {
  const m = await db.prepare('SELECT id FROM maquininha WHERE id = ?').bind(id).first();
  if (!m) return erro('Maquininha não encontrada.', 404);
  const nome = String(corpo?.nome ?? '').trim();
  if (nome.length < 2) return erro('Digite o nome da maquininha.');
  const stmts = [];
  if (corpo.padrao) stmts.push(db.prepare('UPDATE maquininha SET padrao = 0').bind());
  stmts.push(db.prepare('UPDATE maquininha SET nome = ?, serie = ?, ativa = ?, padrao = ? WHERE id = ?')
    .bind(nome, String(corpo?.serie ?? '').trim() || null, corpo.ativa === false ? 0 : 1, corpo.padrao ? 1 : 0, id));
  try { await db.batch(stmts); } catch { return erro('Já existe uma maquininha com esse nome.', 409); }
  return json({ ok: true, ...(await maquininhasEModo(db)) });
}

export async function rotearVenda(request, env, url) {
  const db = env.DB, m = request.method, p = url.pathname;
  if (m === 'GET' && p === '/api/venda/cardapio') return getCardapio(db);
  const eu = await usuarioLogado(request, env);
  if (!eu) return erro('Entre com seu nome e senha', 401);
  let corpo = {};
  if (m === 'POST' || m === 'PUT' || m === 'PATCH') { try { corpo = await request.json(); } catch { corpo = {}; } }
  let k;

  if (m === 'GET' && p === '/api/venda/maquininhas') return json(await maquininhasEModo(db));
  if (m === 'GET' && p === '/api/venda/resumo') return resumo(db, url);
  if (m === 'PUT' && p === '/api/venda/roteamento') {
    if (eu.papel !== 'superadmin') return erro('Só o superadmin muda o roteamento.', 403);
    if (!['padrao', 'equilibrar'].includes(corpo?.modo)) return erro('Modo inválido.');
    await db.prepare("INSERT INTO configuracao (chave, valor) VALUES ('roteamento', ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor").bind(corpo.modo).run();
    return json({ ok: true, ...(await maquininhasEModo(db)) });
  }
  if (m === 'PUT' && (k = p.match(/^\/api\/venda\/maquininhas\/(\d+)$/))) {
    if (eu.papel !== 'superadmin') return erro('Só o superadmin muda as maquininhas.', 403);
    return configurarMaquininha(db, Number(k[1]), corpo);
  }

  if (m === 'GET' && p === '/api/venda/trava') return json({ ativa: await travaLigada(db) });
  if (m === 'PUT' && p === '/api/venda/trava') {
    if (eu.papel !== 'superadmin') return erro('Só o superadmin liga ou desliga a trava de estoque.', 403);
    await db.prepare("INSERT INTO configuracao (chave, valor) VALUES ('travar_estoque', ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor").bind(corpo?.ativa === false ? 'nao' : 'sim').run();
    return json({ ok: true, ativa: await travaLigada(db) });
  }
  if (m === 'GET' && p === '/api/venda/retiradas') return listarRetiradas(db);
  if (m === 'POST' && p === '/api/venda/retirada') return validarRetirada(db, corpo, eu);
  if (m === 'PUT' && p === '/api/venda/pix') {
    if (eu.papel !== 'superadmin') return erro('Só o superadmin muda os dados do Pix.', 403);
    return salvarPix(db, corpo);
  }
  if (m === 'GET' && p === '/api/venda/pix') return json(await lerPix(db));
  if (m === 'GET' && p === '/api/venda/comandas') {
    const { results } = await db.prepare(
      `SELECT p.id, p.numero, p.mesa, p.status, p.total, p.criado_em, (SELECT COUNT(*) FROM item_pedido WHERE pedido_id = p.id) AS itens
       FROM pedido p WHERE p.origem = 'balcao' AND p.status IN ('aberta', 'aguardando_pagamento') ORDER BY p.criado_em, p.id`).all();
    return json({ comandas: results });
  }
  if (m === 'POST' && p === '/api/venda/comandas') return novaComanda(db, corpo, eu.nome);
  if (m === 'GET' && (k = p.match(/^\/api\/venda\/comandas\/([\w-]+)$/))) {
    const c = await lerComanda(db, k[1]);
    return c ? json({ comanda: c }) : erro('Comanda não encontrada.', 404);
  }
  if (m === 'POST' && (k = p.match(/^\/api\/venda\/comandas\/([\w-]+)\/(itens|cobrar|cancelar)$/))) {
    if (k[2] === 'itens') return mudarItem(db, k[1], corpo);
    if (k[2] === 'cobrar') return cobrar(db, env, k[1], corpo, eu);
    return cancelarComanda(db, k[1]);
  }
  if (m === 'POST' && (k = p.match(/^\/api\/venda\/cobrancas\/([\w-]+)\/(confirmar|cancelar)$/))) return mudarCobranca(db, k[1], k[2], eu);
  return null;
}
