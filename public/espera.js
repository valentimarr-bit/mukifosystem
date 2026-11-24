// Estimativa de espera mostrada na hora de pedir. Usada pelo app do cliente, pela venda e pelos testes.
// 1) Se hoje já saíram pedidos (>= 3), vale a média do dia (pago → pronto, últimos pedidos).
// 2) Senão, usa o tempo padrão de cada produto: o mais demorado + 1 min por drink a mais.
(function (g) {
  const MIN_AMOSTRA = 3;
  function estimar(espera, itens) {   // itens: [{ tempo, q }]; tempo vazio = padrão geral
    const e = espera || {}, padrao = Number(e.padrao_min) > 0 ? Number(e.padrao_min) : 5;
    if (e.media_min != null && (e.amostra || 0) >= MIN_AMOSTRA) return { minutos: Math.max(1, Math.round(e.media_min)), origem: 'media_do_dia' };
    const lista = (itens || []).filter((i) => i.q > 0); if (!lista.length) return null;
    const maior = Math.max(...lista.map((i) => (Number(i.tempo) > 0 ? Number(i.tempo) : padrao))), unidades = lista.reduce((s, i) => s + i.q, 0);
    return { minutos: Math.max(1, Math.round(maior + (unidades - 1))), origem: 'padrao_produto' };
  }
  const texto = (r) => (!r ? '' : r.origem === 'media_do_dia' ? `⏱ Espera média hoje: ~${r.minutos} min` : `⏱ Tempo estimado: ~${r.minutos} min`);
  const api = { estimar, texto, MIN_AMOSTRA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else g.Espera = api;
})(typeof window !== 'undefined' ? window : globalThis);
