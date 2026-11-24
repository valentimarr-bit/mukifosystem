// Roteirização de cobrança: decide para qual maquininha vai cada cobrança. Funções puras (testáveis).
//   explicita  — a maquininha que o operador escolheu na tela (vale sempre, se estiver ativa)
//   modo       — 'padrao': a maquininha marcada como padrão | 'equilibrar': a que tem menos cobranças pendentes
//   maquininhas — [{ id, ativa, padrao }]    pendentes — Map(id → nº de cobranças pendentes)
export function escolherMaquininha({ explicita = null, modo = 'padrao', maquininhas, pendentes = new Map() }) {
  const ativas = maquininhas.filter((m) => m.ativa);
  if (!ativas.length) return { erro: 'Nenhuma maquininha ativa. Ative uma na aba Conta.' };
  if (explicita != null) {
    const m = ativas.find((x) => x.id === Number(explicita));
    return m ? { maquininha: m, motivo: 'escolhida' } : { erro: 'Essa maquininha não está disponível.' };
  }
  const padrao = ativas.find((m) => m.padrao) ?? ativas[0];
  if (modo === 'equilibrar') {
    const carga = (m) => pendentes.get(m.id) ?? 0;
    const menor = Math.min(...ativas.map(carga));
    const candidatas = ativas.filter((m) => carga(m) === menor);
    return { maquininha: candidatas.includes(padrao) ? padrao : candidatas[0], motivo: 'equilibrada' };
  }
  return { maquininha: padrao, motivo: 'padrão' };
}
