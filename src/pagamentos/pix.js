// Pix "copia e cola" (BR Code estático) com valor e identificador do pedido. Só gera o código; a confirmação do pagamento é outra etapa.
const campo = (id, v) => id + String(v.length).padStart(2, '0') + v;
const limpar = (s, n) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().slice(0, n);

export function crc16(texto) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function gerarPix({ chave, nome, cidade, valor, txid }) {
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', String(chave).trim());
  const corpo = campo('00', '01') + campo('26', conta) + campo('52', '0000') + campo('53', '986')
    + campo('54', Number(valor).toFixed(2)) + campo('58', 'BR') + campo('59', limpar(nome || 'MUKIFO', 25) || 'MUKIFO')
    + campo('60', limpar(cidade || 'PORTO ALEGRE', 15) || 'PORTO ALEGRE')
    + campo('62', campo('05', limpar(txid || '***', 25).replace(/ /g, '') || '***')) + '6304';
  return corpo + crc16(corpo);
}
