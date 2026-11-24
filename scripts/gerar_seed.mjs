// Gera seed/seed.sql a partir de seed/planilha.json (saída de scripts/extrair_planilha.py).
// Uso: node scripts/gerar_seed.mjs
// Depois: npx wrangler d1 execute mukifo --remote --file seed/seed.sql   (ou --local)
import { readFileSync, writeFileSync } from 'node:fs';
import { normalizarNome } from '../src/dominio/estoque.js';

const raiz = new URL('../', import.meta.url);
const d = JSON.parse(readFileSync(new URL('seed/planilha.json', raiz), 'utf-8'));

const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? '1' : '0') : `'${String(v).replace(/'/g, "''")}'`);
const linhas = ['-- Gerado por scripts/gerar_seed.mjs a partir da planilha antiga. Não editar à mão.', 'PRAGMA foreign_keys = ON;'];

// Limpa na ordem certa (o seed pode ser rodado de novo).
for (const t of ['item_pedido', 'pedido', 'ficha_tecnica', 'produto_componente', 'produto', 'movimento_estoque', 'contagem',
  'item_compra', 'compra', 'insumo', 'fornecedor', 'dia_fora_da_media']) linhas.push(`DELETE FROM ${t};`);

d.fornecedores.forEach((f, k) => linhas.push(
  `INSERT INTO fornecedor (id, nome, como_recebe, observacao) VALUES (${k + 1}, ${q(f.nome)}, ${q(f.como_recebe)}, ${q(f.observacao)});`));
const idForn = new Map(d.fornecedores.map((f, k) => [f.nome, k + 1]));

d.insumos.forEach((i, k) => linhas.push(
  'INSERT INTO insumo (id, nome, tipo, embalagem, unidade_ficha, conteudo, arredondamento, consumo_inteiro, producao_propria, ' +
  'fornecedor_id, outros_fornecedores, preco_referencia, consumo_sabado_ref) VALUES ' +
  `(${k + 1}, ${q(i.nome)}, ${q(i.tipo)}, ${q(i.embalagem)}, ${q(i.unidade_ficha)}, ${i.conteudo}, ${q(i.arredondamento)}, ` +
  `${q(i.consumo_inteiro)}, ${q(i.producao_propria)}, ${q(idForn.get(i.fornecedor) ?? null)}, ` +
  `${q(i.outros_fornecedores.join('; ') || null)}, ${q(i.preco_referencia)}, ${i.consumo_sabado_ref});`));
const idIns = new Map(d.insumos.map((i, k) => [i.nome, k + 1]));

// Produtos: os que têm ficha + os que aparecem nas vendas sem ficha.
const produtos = new Map();
for (const p of d.produtos) produtos.set(normalizarNome(p.nome), { nome: p.nome, preco: p.preco_venda, baixa: p.baixa_estoque, ficha: p.ficha });
for (const dia of [...d.historico, { itens: d.sabado_referencia }]) {
  for (const it of dia.itens) {
    const n = normalizarNome(it.produto);
    if (!produtos.has(n)) produtos.set(n, { nome: it.produto.trim(), preco: it.quantidade ? Math.round((it.total / it.quantidade) * 100) / 100 : null, baixa: true, ficha: [] });
  }
}
let pid = 0;
const idProd = new Map();
for (const [n, p] of produtos) {
  idProd.set(n, ++pid);
  linhas.push(`INSERT INTO produto (id, nome, nome_normalizado, preco_venda, baixa_estoque) VALUES (${pid}, ${q(p.nome)}, ${q(n)}, ${q(p.preco)}, ${q(p.baixa)});`);
  for (const l of p.ficha) {
    linhas.push(`INSERT INTO ficha_tecnica (produto_id, insumo_id, quantidade, observacao) VALUES (${pid}, ${idIns.get(l.insumo)}, ${l.quantidade}, ${q(l.observacao || null)});`);
  }
}

// Histórico: um "pedido" por dia, com origem 'relatorio'.
for (const dia of d.historico) {
  const id = `rel-${dia.dia}`;
  const total = dia.itens.reduce((s, i) => s + i.total, 0);
  linhas.push(`INSERT INTO pedido (id, numero, dia, origem, status, total, criado_em) VALUES (${q(id)}, 'REL', ${q(dia.dia)}, 'relatorio', 'entregue', ${Math.round(total * 100) / 100}, ${q(dia.dia + ' 23:59:00')});`);
  for (const it of dia.itens) {
    linhas.push(`INSERT INTO item_pedido (pedido_id, produto_id, nome, quantidade, preco) VALUES (${q(id)}, ${idProd.get(normalizarNome(it.produto))}, ${q(it.produto.trim())}, ${it.quantidade}, ${q(it.quantidade ? Math.round((it.total / it.quantidade) * 100) / 100 : null)});`);
  }
  if (dia.fora_da_media) linhas.push(`INSERT INTO dia_fora_da_media (dia, motivo) VALUES (${q(dia.dia)}, ${q(dia.fora_da_media)});`);
}
linhas.push(`INSERT OR REPLACE INTO configuracao (chave, valor) VALUES ('folga_minimo', '${d.folga_minimo}');`);

writeFileSync(new URL('seed/seed.sql', raiz), linhas.join('\n') + '\n');
console.log(`ok: ${d.fornecedores.length} fornecedores, ${d.insumos.length} insumos, ${produtos.size} produtos, ${d.historico.length} dias -> seed/seed.sql (${linhas.length} linhas)`);
