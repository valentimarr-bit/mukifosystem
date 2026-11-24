// Monta a NFC-e (nota do consumidor) a partir de um pedido pago. Função pura: não fala com ninguém, só valida e devolve os dados.
const r2 = (x) => Math.round(x * 100) / 100;
const FORMA = { dinheiro: '01', credito: '03', debito: '04', pix: '17' };   // tabela de meios de pagamento da NF-e; o resto vai como 99 (outros)

export const ncmValido = (v) => /^\d{8}$/.test(String(v ?? ''));
export const cfopValido = (v) => /^[5-7]\d{3}$/.test(String(v ?? ''));
export const csosnValido = (v) => /^(101|102|103|201|202|203|300|400|500|900)$/.test(String(v ?? ''));

/** Resolve os dados fiscais de cada item: o do produto, ou o padrão da empresa. */
export function montarNfce({ pedido, itens, cfg, agora = new Date() }) {
  const faltas = [], lista = [];
  if (!cfg.cnpj) return { erros: ['Informe o CNPJ da empresa na configuração fiscal.'] };
  if (!pedido.pagamento && !pedido.pago_em) return { erros: ['O pedido ainda não foi pago.'] };
  if (!itens.length) return { erros: ['O pedido não tem itens.'] };
  let soma = 0;
  itens.forEach((it, i) => {
    const ncm = it.ncm || cfg.ncm, cfop = it.cfop || cfg.cfop, csosn = it.csosn || cfg.csosn, origem = it.origem ?? cfg.origem ?? '0';
    const preco = Number(it.preco ?? it.preco_venda ?? 0), qtd = Number(it.quantidade);
    const motivo = [];
    if (!ncmValido(ncm)) motivo.push('NCM');
    if (!cfopValido(cfop)) motivo.push('CFOP');
    if (!csosnValido(csosn)) motivo.push('CSOSN');
    if (!(preco > 0)) motivo.push('preço');
    if (!(qtd > 0)) motivo.push('quantidade');
    if (motivo.length) { faltas.push(`${it.nome}: falta ${motivo.join(', ')}`); return; }
    const bruto = r2(qtd * preco); soma += bruto;
    lista.push({ numero_item: i + 1, codigo_produto: String(it.produto_id ?? `I${i + 1}`), descricao: String(it.nome).slice(0, 120), codigo_ncm: ncm, cfop, unidade_comercial: it.unidade || 'UN', quantidade_comercial: qtd, valor_unitario_comercial: preco, valor_bruto: bruto,
      unidade_tributavel: it.unidade || 'UN', quantidade_tributavel: qtd, valor_unitario_tributavel: preco, icms_origem: String(origem), icms_situacao_tributaria: csosn, inclui_no_total: 1 });
  });
  if (faltas.length) return { erros: faltas };
  soma = r2(soma);
  if (Math.abs(soma - r2(pedido.total)) > 0.01) return { erros: [`A soma dos itens (R$ ${soma.toFixed(2)}) não bate com o total do pedido (R$ ${r2(pedido.total).toFixed(2)}). Ajuste antes de emitir.`] };
  return { nota: {
    natureza_operacao: 'Venda ao consumidor', data_emissao: agora.toISOString(), cnpj_emitente: cfg.cnpj, presenca_comprador: 1, modalidade_frete: 9, local_destino: 1, consumidor_final: 1,
    itens: lista, formas_pagamento: [{ forma_pagamento: FORMA[pedido.pagamento] ?? '99', valor_pagamento: soma }],
  } };
}
