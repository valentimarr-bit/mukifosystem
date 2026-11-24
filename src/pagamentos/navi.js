// Ligação com o Navi (sistema das maquininhas smart). AINDA NÃO IMPLEMENTADA: falta a documentação/API do Navi.
// Enquanto isso a cobrança fica "pendente" e o operador confirma "Recebido" na tela de venda (modo manual).
// Quando houver acesso: preencher enviarCobranca (cria a cobrança na maquininha escolhida) e ligar o aviso de
// pagamento (webhook ou consulta) a POST /api/venda/cobrancas/:id/confirmar. Segredos: NAVI_API_URL e NAVI_TOKEN.
export const naviConfigurado = (env) => !!(env.NAVI_API_URL && env.NAVI_TOKEN);

export async function enviarCobranca(env, cobranca, maquininha) {
  if (!naviConfigurado(env)) return { modo: 'manual' };
  return { modo: 'manual', aviso: 'Integração com o Navi ainda não implementada; confirme o recebimento na tela.' };
}
