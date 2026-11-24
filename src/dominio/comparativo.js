// Tabela comparativa de gateways e simulador de custo. Os números vêm de páginas oficiais e de comparadores (conferidos em nov/2026):
// podem mudar e variam por contrato. Confirme na sua conta antes de decidir. `null` = não encontrei o valor.
export const COMPARATIVO = [
  { id: 'manual', nome: 'Pix da chave do bar (manual)', integra: 'pronto', pix_pct: 0, pix_fixo: 0, debito_pct: null, debito_fixo: 0, credito_pct: null, credito_fixo: 0, mensal: 0,
    nota: 'Sem gateway: o cliente paga na chave e a equipe confirma no balcão. Bancos PJ podem cobrar tarifa no recebimento.', fonte: 'Banco do bar' },
  { id: 'mercadopago', nome: 'Mercado Pago', integra: 'pronto', pix_pct: 0.99, pix_fixo: 0, debito_pct: null, debito_fixo: 0, credito_pct: 3.98, credito_fixo: 0, mensal: 0,
    nota: 'Pix 0,99% no checkout online; no QR/maquininha a página fala em 0,49% (e 0% em outro trecho). Crédito de 3,98% a 4,98% conforme o prazo. Sem mensalidade. Tem Point e Tap.', fonte: 'mercadopago.com.br' },
  { id: 'woovi', nome: 'Woovi (OpenPix)', integra: 'pronto', pix_pct: 0.8, pix_fixo: 0, debito_pct: null, debito_fixo: 0, credito_pct: null, credito_fixo: 0, mensal: 0,
    nota: 'Só Pix. 0,8% segundo relatos de usuários; sem tabela oficial encontrada.', fonte: 'relatos (GitHub do Banco Central)' },
  { id: 'abacatepay', nome: 'AbacatePay', integra: 'modelo', pix_pct: 0, pix_fixo: 0.8, debito_pct: null, debito_fixo: 0, credito_pct: 3.5, credito_fixo: 0.6, mensal: 0,
    nota: 'Pix a R$ 0,80 fixo. Só compensa acima de ~R$ 80 por Pix.', fonte: 'fontes de terceiros' },
  { id: 'asaas', nome: 'Asaas', integra: 'modelo', pix_pct: 0, pix_fixo: 1.99, debito_pct: 1.89, debito_fixo: 0.35, credito_pct: 2.99, credito_fixo: 0.49, mensal: 0,
    nota: 'Pix R$ 1,99 por recebimento (R$ 0,99 nos 3 primeiros meses). Há transações grátis por mês só por chave ou QR estático.', fonte: 'asaas.com/precos-e-taxas' },
  { id: 'getnet', nome: 'Getnet (e-commerce / link)', integra: 'modelo', pix_pct: 0, pix_fixo: 0, debito_pct: 1.9, debito_fixo: 0, credito_pct: 2.8, credito_fixo: 0, mensal: 28,
    nota: 'Pix sem taxa por transação, mas Pix/boleto no e-commerce exigem convênio com o Santander e o pacote básico custa R$ 28/mês (60 transações de cartão). Maquininha: débito a partir de 0,85% e crédito à vista a partir de 2,69% (varia por plano).', fonte: 'site.getnet.com.br e comparadores' },
  { id: 'infinitepay', nome: 'InfinitePay', integra: 'modelo', pix_pct: 0, pix_fixo: 0, debito_pct: 0.75, debito_fixo: 0, credito_pct: null, credito_fixo: 0, mensal: 0,
    nota: 'Pix com taxa zero no checkout, com API de link e webhook; confirme limites e regras de uso na conta.', fonte: 'infinitepay.io' },
];

const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
const r2 = (v) => Math.round(v * 100) / 100;

/** Custo mensal por gateway. `ticket` em R$; quantidades por mês. Cartão fica `null` quando a taxa não foi encontrada. */
export function simular({ ticket, pix_qtd, debito_qtd = 0, credito_qtd = 0 }, lista = COMPARATIVO) {
  const t = num(ticket), p = num(pix_qtd), d = num(debito_qtd), c = num(credito_qtd);
  return lista.map((g) => {
    const pix = r2(p * (t * g.pix_pct / 100 + g.pix_fixo));
    const deb = d && g.debito_pct == null ? null : r2(d * (t * (g.debito_pct ?? 0) / 100 + g.debito_fixo));
    const cre = c && g.credito_pct == null ? null : r2(c * (t * (g.credito_pct ?? 0) / 100 + g.credito_fixo));
    return { id: g.id, nome: g.nome, pix, debito: deb, credito: cre, mensal: g.mensal, total: r2(pix + (deb ?? 0) + (cre ?? 0) + g.mensal), completo: deb !== null && cre !== null };
  }).sort((a, b) => a.total - b.total);
}
