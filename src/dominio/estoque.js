// Regras de cálculo do estoque do Mukifo — as mesmas da planilha antiga (legado/planilha).
// Funções puras: recebem dados, devolvem números. Testadas contra a planilha em test/estoque.test.js.
//
// Unidades:
//  - ficha técnica: unidade_ficha do insumo (ml, g, un, kg, maço...)
//  - estoque: embalagem (garrafa, lata, kg...). 1 embalagem = `conteudo` unidades de ficha.

/** Dias de funcionamento, na ordem usada em todas as listas de 6 posições. */
export const DIAS = ['terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
/** getUTCDay() de cada posição de DIAS (0 = domingo). */
const DIA_SEMANA = [2, 3, 4, 5, 6, 0];
/** Quanto cada dia vende, em "sábados", quando não há histórico daquele dia. */
export const PESO_REFERENCIA = [1 / 3, 1 / 3, 1 / 3, 1, 1, 1 / 3];
/** Dias cobertos por cada compra (índices em DIAS). */
export const COBERTURA = { segunda: [0, 1], quinta: [2, 3, 4, 5] };

const EPS = 1e-9; // tolerância para não arredondar 2,0000000001 para 3
const tetoSeguro = (x) => Math.ceil(x - EPS) + 0; // + 0 transforma -0 em 0
/** ROUND do Excel: metade arredonda para longe do zero. */
const arredondarExcel = (x) => Math.sign(x) * Math.round(Math.abs(x) + EPS);

/** Nome do produto como o sistema de vendas manda, normalizado para comparar (sem caixa, aspas e espaços extras). */
export function normalizarNome(nome) {
  return String(nome ?? '').replace(/"/g, '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
}

/** Posição em DIAS de uma data 'YYYY-MM-DD' (ou -1 para segunda-feira). */
export function posicaoDoDia(diaISO) {
  return DIA_SEMANA.indexOf(new Date(diaISO + 'T12:00:00Z').getUTCDay());
}

/**
 * Média de unidades vendidas por produto em cada dia da semana.
 * @param {{dia:string, fora_da_media?:string|null, itens:{produto:string, quantidade:number}[]}[]} historico
 * @returns {{diasValidos:number[], medias:Map<string, (number|null)[]>}} médias por nome normalizado
 */
export function mediasPorDia(historico) {
  const diasValidos = [0, 0, 0, 0, 0, 0];
  const somas = new Map();
  for (const dia of historico) {
    if (dia.fora_da_media) continue;
    const k = posicaoDoDia(dia.dia);
    if (k < 0) continue;
    diasValidos[k]++;
    for (const it of dia.itens) {
      const nome = normalizarNome(it.produto);
      if (!somas.has(nome)) somas.set(nome, [0, 0, 0, 0, 0, 0]);
      somas.get(nome)[k] += it.quantidade;
    }
  }
  const medias = new Map();
  for (const [nome, s] of somas) medias.set(nome, s.map((v, k) => (diasValidos[k] ? v / diasValidos[k] : null)));
  return { diasValidos, medias };
}

/**
 * Consumo médio de cada insumo em cada dia da semana, em unidades de estoque (garrafas, kg...).
 * Dia sem histórico usa a referência: consumo de um sábado × PESO_REFERENCIA.
 * @param {object[]} insumos  {nome, conteudo, consumo_sabado_ref}
 * @param {object[]} produtos {nome, ficha:[{insumo, quantidade}]}
 * @returns {Map<string, number[]>}
 */
export function consumoPorDia(insumos, produtos, { diasValidos, medias }) {
  const porInsumo = new Map(insumos.map((i) => [i.nome, [0, 0, 0, 0, 0, 0]]));
  for (const p of produtos) {
    const m = medias.get(normalizarNome(p.nome));
    if (!m) continue;
    for (const linha of p.ficha) {
      const acc = porInsumo.get(linha.insumo);
      if (!acc) continue;
      for (let k = 0; k < 6; k++) acc[k] += linha.quantidade * (m[k] ?? 0);
    }
  }
  const out = new Map();
  for (const i of insumos) {
    const acc = porInsumo.get(i.nome);
    out.set(i.nome, acc.map((v, k) => (diasValidos[k] === 0 ? i.consumo_sabado_ref * PESO_REFERENCIA[k] : v / i.conteudo)));
  }
  return out;
}

/** Estoque mínimo para a compra de `dia` ('segunda' | 'quinta'). */
export function estoqueMinimo(insumo, consumoDia, dia, folga = 0.2) {
  const meio = insumo.arredondamento === 'meio';
  const passo = meio ? 2 : 1;
  const soma = COBERTURA[dia].reduce((s, k) => s + consumoDia[k], 0);
  return Math.max(meio ? 0.5 : 1, tetoSeguro(soma * (1 + folga) * passo) / passo);
}

/** Quanto comprar para chegar ao mínimo, com o arredondamento do item. */
export function sugestaoCompra(insumo, minimo, atual) {
  const falta = Math.max(0, minimo - atual);
  if (insumo.arredondamento === 'meio') return tetoSeguro(falta * 2) / 2;
  if (insumo.arredondamento === 'garrafa_proxima') return arredondarExcel(falta);
  return tetoSeguro(falta);
}

/** Situação do item na tela de estoque. */
export function situacao(atual, sugestao) {
  if (atual <= 0) return 'SEM ESTOQUE';
  return sugestao > 0 ? 'COMPRAR' : 'OK';
}

/**
 * Consumo de cada insumo pelas vendas (ficha técnica × quantidade vendida), em unidades de estoque.
 * @param {Map<string, number>} vendidos quantidade vendida por nome normalizado
 */
export function consumoPorVendas(insumos, produtos, vendidos) {
  const ficha = new Map(insumos.map((i) => [i.nome, 0]));
  for (const p of produtos) {
    const q = vendidos.get(normalizarNome(p.nome)) ?? 0;
    if (!q) continue;
    for (const l of p.ficha) if (ficha.has(l.insumo)) ficha.set(l.insumo, ficha.get(l.insumo) + l.quantidade * q);
  }
  const out = new Map();
  for (const i of insumos) {
    const un = ficha.get(i.nome) / i.conteudo;
    out.set(i.nome, i.consumo_inteiro ? tetoSeguro(un) : un);
  }
  return out;
}

/** CMV (custo dos ingredientes) de um produto. precos: R$ por embalagem, por nome de insumo. */
export function cmv(produto, insumosPorNome, precos) {
  let total = 0;
  for (const l of produto.ficha) {
    const i = insumosPorNome.get(l.insumo);
    const preco = precos.get(l.insumo);
    if (!i || preco == null) continue;
    total += (l.quantidade / i.conteudo) * preco;
  }
  return total;
}

/** Produtos vendidos que não têm ficha técnica (não dão baixa no estoque). */
export function produtosSemFicha(produtos, vendidos) {
  const comFicha = new Set(produtos.filter((p) => p.ficha.length || p.baixa_estoque === false).map((p) => normalizarNome(p.nome)));
  return [...vendidos.entries()].filter(([n, q]) => q > 0 && !comFicha.has(n)).map(([n, q]) => ({ produto: n, quantidade: q }));
}

/**
 * Painel completo do estoque — o que a aba Estoque da planilha mostrava.
 * @param {object} p
 * @param {object[]} p.insumos
 * @param {object[]} p.produtos
 * @param {object[]} p.historico
 * @param {Map<string, number>} p.atual estoque atual por insumo (unidades de estoque)
 * @param {'segunda'|'quinta'} p.dia dia da compra
 * @param {number} [p.folga]
 */
export function painelEstoque({ insumos, produtos, historico, atual, dia, folga = 0.2 }) {
  const consumo = consumoPorDia(insumos, produtos, mediasPorDia(historico));
  return insumos.map((i) => {
    const c = consumo.get(i.nome);
    const auto_segunda = estoqueMinimo(i, c, 'segunda', folga);
    const auto_quinta = estoqueMinimo(i, c, 'quinta', folga);
    // Se o gerente definiu o estoque recomendado, ele manda; senão vale o cálculo pelas vendas.
    const manual = i.estoque_recomendado != null && Number.isFinite(Number(i.estoque_recomendado));
    const minimo_segunda = manual ? Number(i.estoque_recomendado) : auto_segunda;
    const minimo_quinta = manual ? Number(i.estoque_recomendado) : auto_quinta;
    const a = atual.get(i.nome) ?? 0;
    const sugestao = sugestaoCompra(i, dia === 'segunda' ? minimo_segunda : minimo_quinta, a);
    return { insumo: i.nome, atual: a, minimo_segunda, minimo_quinta, auto_segunda, auto_quinta, recomendado_manual: manual, sugestao, situacao: situacao(a, sugestao), consumo_dia: c };
  });
}
