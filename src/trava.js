// Trava de estoque: não deixa vender (balcão ou app) mais do que existe. Só vale para ingredientes que já foram
// contados ou que já receberam entrada (compra, ajuste, produção). Vendas sozinhas não contam: um ingrediente nunca contado
// não trava, senão nada venderia antes da primeira contagem.
// Itens em comandas abertas e pedidos do app ainda não pagos ficam "reservados" para ninguém vender o mesmo duas vezes.
const EPS = 1e-6;
const arred = (x) => Math.floor(x + EPS);

export async function travaLigada(db) {
  const c = await db.prepare("SELECT valor FROM configuracao WHERE chave = 'travar_estoque'").first();
  return (c?.valor ?? 'sim') !== 'nao';
}

async function base(db) {
  const [ins, own, comb] = await Promise.all([
    db.prepare(`SELECT i.id, i.nome, COALESCE((SELECT SUM(quantidade) FROM movimento_estoque WHERE insumo_id = i.id), 0) AS saldo,
                (EXISTS (SELECT 1 FROM movimento_estoque WHERE insumo_id = i.id AND tipo <> 'venda') OR EXISTS (SELECT 1 FROM contagem WHERE insumo_id = i.id)) AS rastreado FROM insumo i`).all(),
    db.prepare('SELECT ft.produto_id, ft.insumo_id, ft.quantidade / i.conteudo AS q FROM ficha_tecnica ft JOIN insumo i ON i.id = ft.insumo_id').all(),
    db.prepare(`SELECT ci.combo_id AS produto_id, ft.insumo_id, ci.quantidade * ft.quantidade / i.conteudo AS q
                FROM combo_item ci JOIN ficha_tecnica ft ON ft.produto_id = ci.produto_id JOIN insumo i ON i.id = ft.insumo_id`).all()]);
  const insumos = new Map(ins.results.map((i) => [i.id, i]));
  const req = new Map();                                   // produto -> (insumo -> embalagens por unidade vendida)
  for (const r of [...own.results, ...comb.results]) {
    if (!req.has(r.produto_id)) req.set(r.produto_id, new Map());
    const m = req.get(r.produto_id); m.set(r.insumo_id, (m.get(r.insumo_id) ?? 0) + r.q);
  }
  return { insumos, req };
}

/** Quanto cada produto já está comprometido em comandas abertas e pedidos do app aguardando pagamento. */
async function reservado(db, excetoPedido = null) {
  const { results } = await db.prepare(
    `SELECT ip.produto_id, SUM(ip.quantidade) AS q FROM item_pedido ip JOIN pedido p ON p.id = ip.pedido_id
     WHERE p.status IN ('aberta', 'aguardando_pagamento') AND p.id IS NOT ?
       AND (p.origem = 'balcao' OR (p.origem = 'celular' AND p.expira_em >= datetime('now')))
     GROUP BY ip.produto_id`).bind(excetoPedido).all();
  return new Map(results.map((r) => [r.produto_id, r.q]));
}

function consumo(b, demanda) {                              // produto->qtd  ==>  insumo->embalagens
  const c = new Map();
  for (const [p, q] of demanda) for (const [i, u] of b.req.get(p) ?? []) c.set(i, (c.get(i) ?? 0) + u * q);
  return c;
}

/** Quantas unidades do produto ainda dá para vender, considerando o que já está comprometido. null = sem limite. */
function restam(b, produtoId, comprometido) {
  let min = null;
  for (const [i, u] of b.req.get(produtoId) ?? []) {
    const ins = b.insumos.get(i);
    if (!ins?.rastreado || u <= 0) continue;
    const n = arred(Math.max(0, ins.saldo - (comprometido.get(i) ?? 0)) / u);
    min = min == null ? n : Math.min(min, n);
  }
  return min;
}

/** Para o cardápio: produto -> quantas ainda dá para vender (só quem tem limite). */
export async function disponibilidade(db, produtoIds) {
  if (!(await travaLigada(db))) return new Map();
  const [b, res] = await Promise.all([base(db), reservado(db)]);
  const comp = consumo(b, res), out = new Map();
  for (const id of produtoIds) { const r = restam(b, id, comp); if (r != null) out.set(id, r); }
  return out;
}

/**
 * Confere se o pedido inteiro (produto->quantidade) cabe no estoque.
 * Devolve null se tudo certo, ou { erro } com uma mensagem simples.
 */
export async function conferirEstoque(db, demanda, { exceto = null, nomes = new Map() } = {}) {
  if (!(await travaLigada(db))) return null;
  const [b, res] = await Promise.all([base(db), reservado(db, exceto)]);
  const outros = consumo(b, res), meu = consumo(b, demanda);
  for (const [i, usado] of meu) {
    const ins = b.insumos.get(i);
    if (!ins?.rastreado) continue;
    if (usado > ins.saldo - (outros.get(i) ?? 0) + EPS) {
      const culpado = [...demanda.keys()].find((p) => b.req.get(p)?.has(i));
      const outrosItens = new Map([...demanda].filter(([p]) => p !== culpado));
      const quanto = restam(b, culpado, new Map([...consumo(b, outrosItens)].map(([k, v]) => [k, v + (outros.get(k) ?? 0)])));
      const nome = nomes.get(culpado) ?? 'esse item';
      return { erro: quanto > 0 ? `Sem estoque suficiente de ${ins.nome}: só dá para vender mais ${quanto} de “${nome}”.` : `Sem estoque de ${ins.nome}: “${nome}” está esgotado.` };
    }
  }
  return null;
}
