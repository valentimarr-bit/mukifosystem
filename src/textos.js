// Textos dos avisos ao cliente, conforme o que ele pediu.
// itens: [{ nome, quantidade, pronta }] — pronta = produto de pronta entrega (não passa pela produção).
const lista = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1]);

export function textosPedido(itens, numero = '') {
  const prod = itens.filter((i) => !i.pronta), prontos = itens.filter((i) => i.pronta);
  const nomes = [...new Set(prod.map((i) => i.nome))];
  // um único produto em produção → pelo nome ("Seu Gin Tônica"); mais de um → "Seu pedido"
  const quem = nomes.length === 1 ? `Seu ${nomes[0]}` : 'Seu pedido';
  const balcao = prontos.length ? ` Já pode buscar no balcão: ${lista([...new Set(prontos.map((i) => i.nome))])}.` : '';
  const soPronto = !prod.length;
  return {
    preparando: { titulo: `${quem} começou a ser preparado! 🍹`, corpo: `Pedido ${numero}: já estamos preparando.${balcao}`.trim(), curto: 'Já já fica pronto.' + balcao, emoji: '🍹', manchete: `${quem.toUpperCase()} COMEÇOU A SER PREPARADO!` },
    pronto: { titulo: soPronto || !prontos.length ? `${quem} está pronto! 🎉` : `${quem} está pronto! 🎉`, corpo: `Pedido ${numero}: retire no balcão mostrando o QR.`, curto: 'Retire no balcão mostrando o QR.', emoji: '🎉', manchete: `${quem.toUpperCase()} ESTÁ PRONTO!` },
  };
}
