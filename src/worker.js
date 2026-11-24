// Worker principal do Mukifo.
// Arquivos estáticos (public/) são servidos antes de chegar aqui; este código responde às rotas /api/*.
import { sincronizar } from './canais.js';
import { json, rotearApi } from './api.js';
import { prepararBanco } from './banco/preparar.js';
import { identificarAtor, deveRegistrar, registrar } from './auditoria.js';

const VERSAO = '0.2.0';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/saude') {
      let banco = 'ainda não configurado (fase 2)';
      if (env.DB) {
        try {
          await prepararBanco(env.DB);
          const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM insumo').first();
          banco = `conectado (${r.n} insumos)`;
        } catch {
          banco = 'conectado, mas não consegui montar as tabelas (veja os logs)';
        }
      }
      return json({ ok: true, sistema: 'Mukifo', versao: VERSAO, banco, hora: new Date().toISOString() });
    }

    if (url.pathname.startsWith('/api/')) {
      try {
        if (env.DB) await prepararBanco(env.DB); // primeiro acesso monta as tabelas e carrega a planilha
        // auditoria: quem agiu e o que enviou são lidos ANTES (o logout apaga a sessão; o corpo só pode ser lido uma vez)
        const auditar = env.DB && deveRegistrar(request, url);
        let ator = null, corpo = null;
        if (auditar) {
          try { corpo = await request.clone().json(); } catch { /* sem corpo */ }
          ator = await identificarAtor(request, env, corpo);
        }
        const resp = (await rotearApi(request, env, url)) ?? json({ erro: 'Rota não encontrada' }, 404);
        if (auditar && resp.ok && /^\/api\/(auth\/(entrar|primeiro-acesso)|conta\/(cadastro|entrar|google|redefinir))$/.test(url.pathname)) {
          try {   // no login o ator só é conhecido na resposta: quem entrou conta como ele mesmo
            const r = await resp.clone().json();
            if (r.usuario) ator = { tipo: 'equipe', nome: r.usuario.nome, papel: r.usuario.papel };
            else if (r.cliente) ator = { tipo: 'cliente', nome: r.cliente.nome, papel: null };
          } catch { /* mantém o ator anterior */ }
        }
        if (auditar) {
          const tarefa = registrar(env, { ator, request, url, status: resp.status, corpo });
          if (ctx?.waitUntil) ctx.waitUntil(tarefa); else await tarefa;
        }
        return resp;
      } catch (e) {
        console.error(e);
        return json({ erro: 'Erro interno', detalhe: String(e?.message ?? e) }, 500);
      }
    }

    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Não encontrado', { status: 404 });
  },
  /** Todo minuto: busca pedidos novos do iFood/99Food mesmo que ninguém esteja com a Produção aberta. */
  async scheduled(event, env, ctx) {
    if (!env.DB) return;
    ctx.waitUntil((async () => { try { await prepararBanco(env.DB); await sincronizar(env.DB, env); } catch (e) { console.error('sincronizar canais:', e.message); } })());
  },
};
