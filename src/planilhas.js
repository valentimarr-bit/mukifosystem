// Importar e exportar tudo em planilha (Excel). O navegador lê/gera o arquivo .xlsx; aqui o servidor só entende linhas.
// Regras: o arquivo é conferido por inteiro ANTES de gravar; se houver qualquer erro, nada é gravado.
// Célula em branco = "não mexer" (nos cadastros que já existem).
import { json } from './api.js';
import { registrarCompra } from './api.js';
import { usuarioLogado } from './auth.js';
import { normalizarNome } from './dominio/estoque.js';
import { validarDespesa } from './financeiro.js';
import { diaDoTurno } from './venda.js';

const erro = (msg, status = 400) => json({ erro: msg }, status);
const r2 = (x) => Math.round(x * 100) / 100;
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const vazio = (v) => v === undefined || v === null || String(v).trim() === '';
const txt = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
function num(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/R\$|\s/g, '');
  if (s === '') return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s); return Number.isFinite(n) ? n : NaN;
}
function bool(v, padrao = null) {
  if (vazio(v)) return padrao;
  const s = semAcento(v);
  if (['sim', 's', '1', 'true', 'x', 'verdadeiro', 'ativo', 'ativa'].includes(s)) return true;
  if (['nao', 'n', '0', 'false', 'falso', 'inativo', 'inativa'].includes(s)) return false;
  return undefined;
}
function data(v) {
  if (vazio(v)) return null;
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);   // número de data do Excel
  const s = String(v).trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
}
const ARRED = { inteirocima: 'inteiro_cima', inteiro: 'inteiro_cima', garrafaproxima: 'garrafa_proxima', garrafa: 'garrafa_proxima', meio: 'meio', meia: 'meio' };

const C = (chave, titulo, exemplo, ajuda = '') => ({ chave, titulo, exemplo, ajuda });
const nao = (e) => e;

// ---------------- definições ----------------
const DATASETS = {
  insumos: {
    nome: 'Insumos (ingredientes e bebidas)', super: false,
    descricao: 'Tudo o que se compra e se guarda em estoque. Linha nova cria, nome igual atualiza. Célula em branco não muda.',
    colunas: [C('nome', 'Nome', 'Vodka Smirnoff 1 L'), C('tipo', 'Tipo', 'Destilados'), C('embalagem', 'Embalagem', 'Garrafa 1 L', 'Unidade de ESTOQUE'), C('unidade_ficha', 'Unidade da ficha', 'ml'),
      C('conteudo', 'Conteúdo da embalagem', 1000, 'Quantas unidades da ficha cabem em 1 embalagem'), C('arredondamento', 'Arredondamento', 'inteiro_cima', 'inteiro_cima, garrafa_proxima ou meio'),
      C('fornecedor', 'Fornecedor', 'Distribuidora X'), C('preco_referencia', 'Preço de referência (R$)', 55), C('preco_unidade', 'Preço da última compra (R$)', ''),
      C('estoque_recomendado', 'Estoque recomendado', 6, 'Em embalagens; em branco = automático'), C('minimo_alerta', 'Avisar quando tiver', 2), C('producao_propria', 'Produção própria (sim/não)', 'não'), C('ativo', 'Ativo (sim/não)', 'sim')],
    async exportar(db) {
      const { results } = await db.prepare('SELECT i.*, f.nome AS fornecedor FROM insumo i LEFT JOIN fornecedor f ON f.id = i.fornecedor_id ORDER BY i.tipo, i.nome').all();
      return results.map((i) => ({ ...i, producao_propria: i.producao_propria ? 'sim' : 'não', ativo: i.ativo ? 'sim' : 'não' }));
    },
    async importar(db, linhas) {
      const [{ results: ins }, { results: fs }] = await Promise.all([db.prepare('SELECT id, nome FROM insumo').all(), db.prepare('SELECT nome FROM fornecedor').all()]);
      const existentes = new Map(ins.map((i) => [semAcento(i.nome), i])), forn = new Set(fs.map((f) => semAcento(f.nome))), vistos = new Set();
      const r = { stmts: [], criados: 0, atualizados: 0, erros: [], avisos: [] };
      linhas.forEach((l, k) => {
        const n = k + 2, e = (m) => r.erros.push({ linha: n, erro: m });
        const nome = txt(l.nome); if (!nome) return e('Falta o nome.');
        if (vistos.has(semAcento(nome))) return e(`O nome “${nome}” aparece mais de uma vez.`); vistos.add(semAcento(nome));
        const ex = existentes.get(semAcento(nome)), c = {};
        for (const k2 of ['conteudo', 'preco_referencia', 'preco_unidade', 'estoque_recomendado', 'minimo_alerta']) if (!vazio(l[k2])) { c[k2] = num(l[k2]); if (!(c[k2] >= 0) || (k2 === 'conteudo' && !(c[k2] > 0))) return e(`Número inválido em “${k2}”.`); }
        let arr; if (!vazio(l.arredondamento)) { arr = ARRED[semAcento(l.arredondamento)]; if (!arr) return e('Arredondamento deve ser inteiro_cima, garrafa_proxima ou meio.'); }
        const prod = bool(l.producao_propria), ativo = bool(l.ativo);
        if (prod === undefined || ativo === undefined) return e('Use sim ou não nas colunas de sim/não.');
        const fn = txt(l.fornecedor);
        if (fn && !forn.has(semAcento(fn))) { forn.add(semAcento(fn)); r.stmts.push(['INSERT OR IGNORE INTO fornecedor (nome) VALUES (?)', [fn]]); }
        const fsql = fn ? '(SELECT id FROM fornecedor WHERE nome = ? COLLATE NOCASE)' : null;
        if (ex) {
          const set = [], b = [];
          const add = (col, v, sql = '?') => { set.push(`${col} = ${sql}`); if (v !== undefined) b.push(v); };
          if (txt(l.tipo)) add('tipo', txt(l.tipo)); if (txt(l.embalagem)) add('embalagem', txt(l.embalagem)); if (txt(l.unidade_ficha)) add('unidade_ficha', txt(l.unidade_ficha));
          for (const [k2, v] of Object.entries(c)) add(k2, v); if (arr) add('arredondamento', arr); if (prod !== null) add('producao_propria', prod ? 1 : 0); if (ativo !== null) add('ativo', ativo ? 1 : 0);
          if (fsql) add('fornecedor_id', fn, fsql);
          if (!set.length) return; r.atualizados++; r.stmts.push([`UPDATE insumo SET ${set.join(', ')} WHERE id = ?`, [...b, ex.id]]);
        } else {
          r.criados++;
          r.stmts.push([`INSERT INTO insumo (nome, tipo, embalagem, unidade_ficha, conteudo, arredondamento, producao_propria, fornecedor_id, preco_unidade, preco_referencia, estoque_recomendado, minimo_alerta, ativo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ${fsql ?? 'NULL'}, ?, ?, ?, ?, ?)`, [nome, txt(l.tipo) || 'Outros', txt(l.embalagem) || 'un', txt(l.unidade_ficha) || 'un', c.conteudo ?? 1, arr ?? 'inteiro_cima', prod ? 1 : 0,
            ...(fsql ? [fn] : []), c.preco_unidade ?? null, c.preco_referencia ?? null, c.estoque_recomendado ?? null, c.minimo_alerta ?? null, ativo === false ? 0 : 1]]);
        }
      });
      return r;
    },
  },

  produtos: {
    nome: 'Produtos (cardápio)', super: false,
    descricao: 'O que se vende. O nome precisa ser igual ao do relatório de vendas. Em branco não muda.',
    colunas: [C('nome', 'Nome', 'CAIPIRINHA CACHAÇA'), C('categoria', 'Categoria', 'Drinks'), C('preco_venda', 'Preço de venda (R$)', 20), C('baixa_estoque', 'Dá baixa no estoque (sim/não)', 'sim'), C('ativo', 'Ativo (sim/não)', 'sim')],
    async exportar(db) {
      const { results } = await db.prepare('SELECT nome, categoria, preco_venda, baixa_estoque, ativo FROM produto WHERE id NOT IN (SELECT combo_id FROM combo_item) ORDER BY categoria, nome').all();
      return results.map((p) => ({ ...p, baixa_estoque: p.baixa_estoque ? 'sim' : 'não', ativo: p.ativo ? 'sim' : 'não' }));
    },
    async importar(db, linhas) {
      const { results } = await db.prepare('SELECT id, nome_normalizado AS n FROM produto').all();
      const ex = new Map(results.map((p) => [p.n, p.id])), vistos = new Set(), r = { stmts: [], criados: 0, atualizados: 0, erros: [], avisos: [] };
      linhas.forEach((l, k) => {
        const n = k + 2, e = (m) => r.erros.push({ linha: n, erro: m });
        const nome = txt(l.nome); if (nome.length < 2) return e('Falta o nome.');
        const norm = normalizarNome(nome); if (vistos.has(norm)) return e(`O produto “${nome}” aparece mais de uma vez.`); vistos.add(norm);
        const preco = vazio(l.preco_venda) ? null : num(l.preco_venda); if (preco !== null && !(preco >= 0 && preco < 100000)) return e('Preço inválido.');
        const baixa = bool(l.baixa_estoque), ativo = bool(l.ativo); if (baixa === undefined || ativo === undefined) return e('Use sim ou não.');
        if (ex.has(norm)) {
          const set = [], b = []; const add = (c, v) => { set.push(`${c} = ?`); b.push(v); };
          if (txt(l.categoria)) add('categoria', txt(l.categoria)); if (preco !== null) add('preco_venda', r2(preco)); if (baixa !== null) add('baixa_estoque', baixa ? 1 : 0); if (ativo !== null) add('ativo', ativo ? 1 : 0);
          if (set.length) { r.atualizados++; r.stmts.push([`UPDATE produto SET ${set.join(', ')} WHERE id = ?`, [...b, ex.get(norm)]]); }
        } else { r.criados++; r.stmts.push(['INSERT INTO produto (nome, nome_normalizado, categoria, preco_venda, baixa_estoque, ativo) VALUES (?, ?, ?, ?, ?, ?)', [nome, norm, txt(l.categoria) || null, preco === null ? null : r2(preco), baixa === false ? 0 : 1, ativo === false ? 0 : 1]]); }
      });
      return r;
    },
  },

  fichas: {
    nome: 'Fichas técnicas (receitas)', super: false,
    descricao: 'Uma linha por ingrediente de cada produto. A ficha de cada produto que aparecer aqui é SUBSTITUÍDA pelo que está na planilha. Produto e ingrediente precisam já existir.',
    colunas: [C('produto', 'Produto', 'CAIPIRINHA CACHAÇA'), C('insumo', 'Ingrediente', 'Cachaça 1 L'), C('quantidade', 'Quantidade', 50, 'Na unidade da ficha do ingrediente (ex.: ml)'), C('observacao', 'Observação', '')],
    async exportar(db) {
      const { results } = await db.prepare('SELECT p.nome AS produto, i.nome AS insumo, ft.quantidade, i.unidade_ficha AS unidade, ft.observacao FROM ficha_tecnica ft JOIN produto p ON p.id = ft.produto_id JOIN insumo i ON i.id = ft.insumo_id ORDER BY p.nome, ft.id').all();
      return results;
    },
    async importar(db, linhas) {
      const [{ results: ps }, { results: is }] = await Promise.all([db.prepare('SELECT id, nome_normalizado AS n FROM produto').all(), db.prepare('SELECT id, nome FROM insumo').all()]);
      const P = new Map(ps.map((p) => [p.n, p.id])), I = new Map(is.map((i) => [semAcento(i.nome), i.id])), r = { stmts: [], criados: 0, atualizados: 0, erros: [], avisos: [] };
      const grupos = new Map();
      linhas.forEach((l, k) => {
        const n = k + 2, e = (m) => r.erros.push({ linha: n, erro: m });
        const pid = P.get(normalizarNome(l.produto)); if (!pid) return e(`Produto “${txt(l.produto)}” não existe. Importe os produtos antes.`);
        const iid = I.get(semAcento(l.insumo)); if (!iid) return e(`Ingrediente “${txt(l.insumo)}” não existe. Importe os insumos antes.`);
        const q = num(l.quantidade); if (!(q > 0)) return e('A quantidade precisa ser maior que zero.');
        const g = grupos.get(pid) ?? new Map(); if (g.has(iid)) return e(`O ingrediente “${txt(l.insumo)}” aparece duas vezes no mesmo produto.`); g.set(iid, { q, obs: txt(l.observacao) || null }); grupos.set(pid, g);
      });
      for (const [pid, g] of grupos) { r.atualizados++; r.stmts.push(['DELETE FROM ficha_tecnica WHERE produto_id = ?', [pid]]); for (const [iid, v] of g) r.stmts.push(['INSERT INTO ficha_tecnica (produto_id, insumo_id, quantidade, observacao) VALUES (?, ?, ?, ?)', [pid, iid, v.q, v.obs]]); }
      if (r.atualizados) r.avisos.push(`${r.atualizados} produto(s) terão a ficha substituída.`);
      return r;
    },
  },

  combos: {
    nome: 'Combos', super: false,
    descricao: 'Uma linha por produto dentro do combo. Combo novo é criado; combo existente tem os itens substituídos.',
    colunas: [C('combo', 'Combo', 'KIT DOS GURI'), C('preco', 'Preço do combo (R$)', 28), C('produto', 'Produto que leva', 'CERVEJA LONG NECK'), C('quantidade', 'Quantidade', 2)],
    async exportar(db) {
      const { results } = await db.prepare('SELECT c.nome AS combo, c.preco_venda AS preco, p.nome AS produto, ci.quantidade FROM combo_item ci JOIN produto c ON c.id = ci.combo_id JOIN produto p ON p.id = ci.produto_id ORDER BY c.nome, p.nome').all();
      return results;
    },
    async importar(db, linhas) {
      const [{ results: ps }, { results: cs }, { results: fich }] = await Promise.all([db.prepare('SELECT id, nome_normalizado AS n FROM produto').all(), db.prepare('SELECT DISTINCT combo_id AS id FROM combo_item').all(), db.prepare('SELECT DISTINCT produto_id AS id FROM ficha_tecnica').all()]);
      const P = new Map(ps.map((p) => [p.n, p.id])), ehCombo = new Set(cs.map((c) => c.id)), temFicha = new Set(fich.map((f) => f.id));
      const r = { stmts: [], criados: 0, atualizados: 0, erros: [], avisos: [] }, grupos = new Map();
      linhas.forEach((l, k) => {
        const n = k + 2, e = (m) => r.erros.push({ linha: n, erro: m });
        const nome = txt(l.combo); if (nome.length < 2) return e('Falta o nome do combo.');
        const norm = normalizarNome(nome), cid = P.get(norm);
        if (cid && !ehCombo.has(cid) && temFicha.has(cid)) return e(`“${nome}” já é um produto com ficha técnica; use outro nome.`);
        const comp = P.get(normalizarNome(l.produto)); if (!comp) return e(`Produto “${txt(l.produto)}” não existe.`);
        if (comp === cid) return e('Um combo não pode conter ele mesmo.'); if (ehCombo.has(comp)) return e(`“${txt(l.produto)}” é outro combo; combo dentro de combo não pode.`);
        const q = num(l.quantidade); if (!Number.isInteger(q) || q < 1 || q > 50) return e('A quantidade precisa ser um número inteiro de 1 a 50.');
        const preco = vazio(l.preco) ? null : num(l.preco); if (preco !== null && !(preco > 0)) return e('Preço inválido.');
        const g = grupos.get(norm) ?? { nome, preco: null, itens: new Map(), existe: !!cid }; if (preco !== null) g.preco = r2(preco);
        if (g.itens.has(comp)) return e('Produto repetido dentro do mesmo combo.'); g.itens.set(comp, q); grupos.set(norm, g);
      });
      for (const [norm, g] of grupos) {
        if (!g.existe && g.preco == null) { r.erros.push({ linha: 0, erro: `O combo “${g.nome}” é novo: informe o preço.` }); continue; }
        if (!g.existe) { r.criados++; r.stmts.push(["INSERT INTO produto (nome, nome_normalizado, categoria, preco_venda, baixa_estoque, ativo) VALUES (?, ?, 'Promoções e kits', ?, 1, 1)", [g.nome, norm, g.preco]]); } else { r.atualizados++; if (g.preco != null) r.stmts.push(['UPDATE produto SET preco_venda = ?, ativo = 1 WHERE nome_normalizado = ?', [g.preco, norm]]); }
        r.stmts.push(['DELETE FROM combo_item WHERE combo_id = (SELECT id FROM produto WHERE nome_normalizado = ?)', [norm]]);
        for (const [comp, q] of g.itens) r.stmts.push(['INSERT INTO combo_item (combo_id, produto_id, quantidade) VALUES ((SELECT id FROM produto WHERE nome_normalizado = ?), ?, ?)', [norm, comp, q]]);
      }
      return r;
    },
  },

  contagem: {
    nome: 'Contagem de estoque (inicial ou do dia)', super: false,
    descricao: 'Preencha só a coluna “Contado”. Para cada item contado, o sistema acerta o estoque e guarda a diferença. Em branco = não contou.',
    colunas: [C('insumo', 'Item', 'Vodka Smirnoff 1 L'), C('embalagem', 'Embalagem', 'Garrafa 1 L', 'Só para você se orientar'), C('sistema', 'No sistema', 0, 'Só para você se orientar'), C('contado', 'Contado', 12, 'Em embalagens (aceita 0,5)')],
    async exportar(db) {
      const { results } = await db.prepare('SELECT i.nome AS insumo, i.embalagem, ROUND(COALESCE((SELECT SUM(quantidade) FROM movimento_estoque WHERE insumo_id = i.id), 0), 3) AS sistema, i.tipo FROM insumo i WHERE i.ativo = 1 ORDER BY i.tipo, i.nome').all();
      return results.map((x) => ({ ...x, contado: '' }));
    },
    async importar(db, linhas, eu) {
      const { results } = await db.prepare('SELECT i.id, i.nome, COALESCE(i.preco_unidade, i.preco_referencia) AS preco, COALESCE((SELECT SUM(quantidade) FROM movimento_estoque WHERE insumo_id = i.id), 0) AS atual FROM insumo i').all();
      const I = new Map(results.map((i) => [semAcento(i.nome), i])), vistos = new Set(), r = { stmts: [], criados: 0, atualizados: 0, erros: [], avisos: [] }, agora = new Date().toISOString();
      linhas.forEach((l, k) => {
        const n = k + 2, e = (m) => r.erros.push({ linha: n, erro: m });
        if (vazio(l.contado)) return;
        const i = I.get(semAcento(l.insumo)); if (!i) return e(`Item “${txt(l.insumo)}” não existe.`);
        if (vistos.has(i.id)) return e(`O item “${txt(l.insumo)}” aparece mais de uma vez.`); vistos.add(i.id);
        const c = num(l.contado); if (!(c >= 0)) return e('Quantidade contada inválida.');
        const dif = c - i.atual;
        r.stmts.push(["INSERT INTO contagem (data, momento, insumo_id, esperado, contado, usuario) VALUES (?, 'abertura', ?, ?, ?, ?)", [agora, i.id, i.atual, c, eu.nome]]);
        if (Math.abs(dif) > 1e-9) r.stmts.push(["INSERT INTO movimento_estoque (insumo_id, tipo, quantidade, custo, motivo, usuario) VALUES (?, 'diferenca_contagem', ?, ?, 'contagem por planilha', ?)", [i.id, dif, i.preco == null ? null : r2(dif * i.preco), eu.nome]]);
        r.atualizados++;
      });
      if (!r.atualizados && !r.erros.length) r.avisos.push('Nenhum item com “Contado” preenchido.');
      return r;
    },
  },

  fornecedores: {
    nome: 'Fornecedores', super: false, descricao: 'Quem vende para o bar.',
    colunas: [C('nome', 'Nome', 'Ceasa'), C('como_recebe', 'Como recebe o pedido', 'Presencial'), C('contato', 'Contato', ''), C('observacao', 'Observação', ''), C('ativo', 'Ativo (sim/não)', 'sim')],
    async exportar(db) { const { results } = await db.prepare('SELECT nome, como_recebe, contato, observacao, ativo FROM fornecedor ORDER BY nome').all(); return results.map((f) => ({ ...f, ativo: f.ativo ? 'sim' : 'não' })); },
    async importar(db, linhas) {
      const { results } = await db.prepare('SELECT id, nome FROM fornecedor').all(); const ex = new Map(results.map((f) => [semAcento(f.nome), f.id])), vistos = new Set();
      const r = { stmts: [], criados: 0, atualizados: 0, erros: [], avisos: [] };
      linhas.forEach((l, k) => {
        const e = (m) => r.erros.push({ linha: k + 2, erro: m }), nome = txt(l.nome); if (!nome) return e('Falta o nome.');
        if (vistos.has(semAcento(nome))) return e('Nome repetido.'); vistos.add(semAcento(nome)); const a = bool(l.ativo); if (a === undefined) return e('Use sim ou não.');
        if (ex.has(semAcento(nome))) { r.atualizados++; r.stmts.push(['UPDATE fornecedor SET como_recebe = COALESCE(?, como_recebe), contato = COALESCE(?, contato), observacao = COALESCE(?, observacao), ativo = COALESCE(?, ativo) WHERE id = ?', [txt(l.como_recebe) || null, txt(l.contato) || null, txt(l.observacao) || null, a === null ? null : a ? 1 : 0, ex.get(semAcento(nome))]]); }
        else { r.criados++; r.stmts.push(['INSERT INTO fornecedor (nome, como_recebe, contato, observacao, ativo) VALUES (?, ?, ?, ?, ?)', [nome, txt(l.como_recebe) || null, txt(l.contato) || null, txt(l.observacao) || null, a === false ? 0 : 1]]); }
      });
      return r;
    },
  },

  compras: {
    nome: 'Compras (entradas no estoque)', super: true,
    descricao: 'Uma linha por item comprado. Linhas com a mesma data e fornecedor viram uma compra só. Dá entrada no estoque e atualiza o preço.',
    colunas: [C('data', 'Data', '2026-11-24'), C('fornecedor', 'Fornecedor', 'Ceasa'), C('insumo', 'Item', 'Limão Taiti'), C('quantidade', 'Quantidade', 10, 'Em embalagens'), C('valor_pago', 'Valor pago (R$)', 45, 'Total do item, não o preço por unidade')],
    async exportar(db) {
      const { results } = await db.prepare('SELECT c.data, f.nome AS fornecedor, i.nome AS insumo, ic.quantidade, ic.valor_pago FROM item_compra ic JOIN compra c ON c.id = ic.compra_id JOIN insumo i ON i.id = ic.insumo_id LEFT JOIN fornecedor f ON f.id = c.fornecedor_id ORDER BY c.data DESC, c.id DESC LIMIT 20000').all();
      return results;
    },
    async importar(db, linhas, eu) {
      const [{ results: is }, { results: fs }] = await Promise.all([db.prepare('SELECT nome FROM insumo').all(), db.prepare('SELECT nome FROM fornecedor').all()]);
      const I = new Map(is.map((i) => [semAcento(i.nome), i.nome])), F = new Map(fs.map((f) => [semAcento(f.nome), f.nome])), r = { stmts: [], depois: [], criados: 0, atualizados: 0, erros: [], avisos: [] }, grupos = new Map();
      linhas.forEach((l, k) => {
        const n = k + 2, e = (m) => r.erros.push({ linha: n, erro: m });
        const d = data(l.data); if (!d) return e('Data inválida (use dia/mês/ano).');
        const insumo = I.get(semAcento(l.insumo)); if (!insumo) return e(`Item “${txt(l.insumo)}” não existe.`);
        const fn = txt(l.fornecedor), forn = fn ? F.get(semAcento(fn)) : null; if (fn && !forn) return e(`Fornecedor “${fn}” não existe. Importe os fornecedores antes.`);
        const q = num(l.quantidade); if (!(q > 0)) return e('Quantidade inválida.'); const v = vazio(l.valor_pago) ? null : num(l.valor_pago); if (v !== null && !(v >= 0)) return e('Valor inválido.');
        const chave = `${d}|${forn ?? ''}`; const g = grupos.get(chave) ?? { data: d, fornecedor: forn, itens: [] }; g.itens.push({ insumo, quantidade: q, valor_pago: v }); grupos.set(chave, g);
      });
      for (const g of grupos.values()) { r.criados++; r.depois.push(async () => { const x = await registrarCompra(db, { ...g, usuario: eu.nome }); if (x.erro) throw new Error(x.erro); }); }
      return r;
    },
  },

  despesas: {
    nome: 'Despesas e contas a pagar', super: true,
    descricao: 'Aluguel, luz, folha, fornecedores a prazo... Com “Código” preenchido atualiza essa despesa; em branco cria uma nova.',
    colunas: [C('id', 'Código', '', 'Deixe em branco para nova'), C('descricao', 'Descrição', 'Aluguel'), C('categoria', 'Categoria', 'Aluguel'), C('tipo', 'Tipo (fixa/variável)', 'fixa'), C('valor', 'Valor (R$)', 3500),
      C('vencimento', 'Vencimento', '2026-12-05'), C('status', 'Situação (aberta/paga)', 'aberta'), C('pago_em', 'Pago em', ''), C('forma', 'Forma de pagamento', 'pix'), C('fornecedor', 'Fornecedor', ''), C('recorrente', 'Repete todo mês (sim/não)', 'sim'), C('observacao', 'Observação', '')],
    async exportar(db) { const { results } = await db.prepare('SELECT * FROM despesa ORDER BY vencimento, id').all(); return results.map((d) => ({ ...d, tipo: d.tipo === 'fixa' ? 'fixa' : 'variável', recorrente: d.recorrente ? 'sim' : 'não' })); },
    async importar(db, linhas, eu) {
      const { results } = await db.prepare('SELECT id FROM despesa').all(); const ids = new Set(results.map((d) => d.id)), r = { stmts: [], criados: 0, atualizados: 0, erros: [], avisos: [] };
      linhas.forEach((l, k) => {
        const e = (m) => r.erros.push({ linha: k + 2, erro: m });
        const venc = data(l.vencimento); if (venc === undefined || venc === null) return e('Vencimento inválido (use dia/mês/ano).');
        const pago = data(l.pago_em); if (pago === undefined) return e('Data de pagamento inválida.');
        const valor = num(l.valor); const s = semAcento(l.status);
        const rec = bool(l.recorrente, false); if (rec === undefined) return e('Use sim ou não em “Repete todo mês”.');
        const v = validarDespesa({ descricao: l.descricao, categoria: l.categoria, tipo: semAcento(l.tipo).startsWith('fix') ? 'fixa' : 'variavel', valor, vencimento: venc, status: ['paga', 'pago', 'quitada'].includes(s) || (pago && s !== 'aberta') ? 'paga' : 'aberta', pago_em: pago, forma: l.forma, fornecedor: l.fornecedor, recorrente: rec ? 'mensal' : null, observacao: l.observacao });
        if (v.erro) return e(v.erro); const d = v.dados;
        if (!vazio(l.id)) {
          const id = num(l.id); if (!ids.has(id)) return e(`Código ${txt(l.id)} não existe.`);
          r.atualizados++; r.stmts.push(['UPDATE despesa SET descricao = ?, categoria = ?, tipo = ?, valor = ?, vencimento = ?, status = ?, pago_em = ?, forma = ?, fornecedor = ?, recorrente = ?, observacao = ? WHERE id = ?', [d.descricao, d.categoria, d.tipo, d.valor, d.vencimento, d.status, d.pago_em, d.forma, d.fornecedor, d.recorrente, d.observacao, id]]);
        } else { r.criados++; r.stmts.push(['INSERT INTO despesa (descricao, categoria, tipo, valor, vencimento, status, pago_em, forma, fornecedor, recorrente, observacao, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [d.descricao, d.categoria, d.tipo, d.valor, d.vencimento, d.status, d.pago_em, d.forma, d.fornecedor, d.recorrente, d.observacao, eu.nome]]); }
      });
      return r;
    },
  },

  taxas: {
    nome: 'Taxas e prazos de recebimento', super: true, descricao: 'O que cada forma de pagamento cobra e em quantos dias o dinheiro cai. As 4 formas já existem; edite os números.',
    colunas: [C('forma', 'Forma (pix/debito/credito/dinheiro)', 'credito'), C('percentual', 'Taxa (%)', 3.5), C('fixo', 'Taxa fixa por cobrança (R$)', 0), C('dias', 'Dias para receber', 30)],
    async exportar(db) { const { results } = await db.prepare('SELECT forma, percentual, fixo, dias FROM taxa_pagamento').all(); return results; },
    async importar(db, linhas) {
      const r = { stmts: [], criados: 0, atualizados: 0, erros: [], avisos: [] };
      linhas.forEach((l, k) => {
        const e = (m) => r.erros.push({ linha: k + 2, erro: m }), f = semAcento(l.forma).replace('cartaode', '');
        if (!['pix', 'debito', 'credito', 'dinheiro'].includes(f)) return e('Forma deve ser pix, debito, credito ou dinheiro.');
        const pc = num(l.percentual) ?? 0, fx = num(l.fixo) ?? 0, d = vazio(l.dias) ? 0 : num(l.dias);
        if (!(pc >= 0 && pc <= 100) || !(fx >= 0 && fx <= 100) || !Number.isInteger(d) || d < 0 || d > 365) return e('Confira os números (taxa de 0 a 100, dias inteiros).');
        r.atualizados++; r.stmts.push(['UPDATE taxa_pagamento SET percentual = ?, fixo = ?, dias = ? WHERE forma = ?', [pc, fx, d, f]]);
      });
      return r;
    },
  },

  vendas: {
    nome: 'Vendas (só para baixar)', super: true, somenteExportar: true, descricao: 'Pedidos do período (use os campos De/Até). Para análise no Excel.',
    colunas: [C('dia', 'Dia', ''), C('numero', 'Número', ''), C('origem', 'Origem', ''), C('status', 'Situação', ''), C('pagamento', 'Pagamento', ''), C('total', 'Total (R$)', ''), C('itens', 'Itens', '')],
    async exportar(db, url) {
      const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? ''), ate = ok(url?.searchParams.get('ate')) ? url.searchParams.get('ate') : diaDoTurno();
      const de = ok(url?.searchParams.get('de')) ? url.searchParams.get('de') : new Date(Date.parse(ate + 'T12:00:00Z') - 29 * 864e5).toISOString().slice(0, 10);
      const { results } = await db.prepare(`SELECT p.dia, p.numero, p.origem, p.status, p.pagamento, p.total,
        (SELECT GROUP_CONCAT(ip.quantidade || 'x ' || ip.nome, '; ') FROM item_pedido ip WHERE ip.pedido_id = p.id) AS itens FROM pedido p WHERE p.dia BETWEEN ? AND ? ORDER BY p.dia, p.criado_em LIMIT 20000`).bind(de, ate).all();
      return results;
    },
  },
};

export const catalogo = () => Object.entries(DATASETS).map(([id, d]) => ({ id, nome: d.nome, descricao: d.descricao, importavel: !d.somenteExportar, super: d.super, colunas: d.colunas.map(({ titulo, exemplo, ajuda }) => ({ titulo, exemplo, ajuda })) }));

/** Lê as linhas do navegador (chaves = títulos das colunas) e devolve objetos com as chaves internas. */
function mapear(def, linhas) {
  const mapa = new Map(); for (const c of def.colunas) { mapa.set(semAcento(c.titulo), c.chave); mapa.set(semAcento(c.chave), c.chave); }
  return linhas.map((l) => { const o = {}; for (const [k, v] of Object.entries(l ?? {})) { const ch = mapa.get(semAcento(k)); if (ch) o[ch] = v; } return o; });
}

async function aplicar(db, r) {
  const stmts = r.stmts.map(([sql, b]) => db.prepare(sql).bind(...b));
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  for (const f of r.depois ?? []) await f();
}

export async function rotearPlanilhas(request, env, url) {
  const eu = await usuarioLogado(request, env); if (!eu) return erro('Entre com seu nome e senha', 401);
  const db = env.DB, p = url.pathname;
  if (p === '/api/planilhas' && request.method === 'GET') return json({ planilhas: catalogo().filter((d) => !d.super || eu.papel === 'superadmin') });
  const k = p.match(/^\/api\/planilhas\/([a-z_]+)$/); if (!k) return null;
  const def = DATASETS[k[1]]; if (!def) return erro('Planilha não encontrada.', 404);
  if (def.super && eu.papel !== 'superadmin') return erro('Essa planilha é só do superadmin.', 403);
  if (request.method === 'GET') return json({ colunas: def.colunas.map((c) => c.titulo), linhas: await def.exportar(db, url), chaves: def.colunas.map((c) => c.chave) });
  if (request.method === 'POST') {
    if (def.somenteExportar) return erro('Essa planilha é só para baixar.');
    if (eu.papel !== 'superadmin') return erro('Só o superadmin importa planilhas.', 403);
    let c; try { c = await request.json(); } catch { return erro('Corpo da requisição não é JSON'); }
    const linhas = Array.isArray(c?.linhas) ? c.linhas : []; if (!linhas.length) return erro('A planilha está vazia.');
    if (linhas.length > 5000) return erro('Planilha grande demais (máximo 5.000 linhas por vez).');
    const r = await def.importar(db, mapear(def, linhas).filter((o) => Object.values(o).some((v) => !vazio(v))), eu);
    const resp = { criados: r.criados, atualizados: r.atualizados, erros: r.erros.slice(0, 100), total_erros: r.erros.length, avisos: r.avisos };
    if (r.erros.length) return json({ ok: false, simulado: true, ...resp });
    if (url.searchParams.get('simular') === '1') return json({ ok: true, simulado: true, ...resp });
    try { await aplicar(db, r); } catch (e) { return erro('Não consegui gravar tudo: ' + (e?.message ?? e), 500); }
    return json({ ok: true, simulado: false, ...resp });
  }
  return null;
}
