// Worker principal do Mukifo.
// Arquivos estáticos (public/) são servidos antes de chegar aqui; este código responde às rotas /api/*.
import { json, rotearApi } from './api.js';

const VERSAO = '0.2.0';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/saude') {
      let banco = 'ainda não configurado (fase 2)';
      if (env.DB) {
        try {
          const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM insumo').first();
          banco = `conectado (${r.n} insumos)`;
        } catch {
          banco = 'conectado, mas sem tabelas (rode as migrações)';
        }
      }
      return json({ ok: true, sistema: 'Mukifo', versao: VERSAO, banco, hora: new Date().toISOString() });
    }

    if (url.pathname.startsWith('/api/')) {
      try {
        return (await rotearApi(request, env, url)) ?? json({ erro: 'Rota não encontrada' }, 404);
      } catch (e) {
        console.error(e);
        return json({ erro: 'Erro interno', detalhe: String(e?.message ?? e) }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
