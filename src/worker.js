// Worker principal do Mukifo.
// Arquivos estáticos (public/) são servidos antes de chegar aqui;
// este código responde só às rotas de API.

const VERSAO = "0.1.0";

function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/saude") {
      return json({
        ok: true,
        sistema: "Mukifo",
        versao: VERSAO,
        banco: env.DB ? "conectado" : "ainda não configurado (fase 2)",
        hora: new Date().toISOString(),
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ erro: "Rota não encontrada" }, 404);
    }

    // Qualquer outra coisa: deixa os arquivos estáticos responderem.
    return env.ASSETS.fetch(request);
  },
};
