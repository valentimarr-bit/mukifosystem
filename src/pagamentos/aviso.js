// Rotas de pagamentos: aviso (webhook) dos gateways, escolha do gateway ativo e tabela comparativa.
import { json } from '../api.js';
import { erro, conferirQuitacao } from '../venda.js';
import { usuarioLogado } from '../auth.js';
import { GATEWAYS, MANUAL, gatewayAtivo } from './gateways.js';
import { confirmarRecarga } from '../carteira.js';
import { confirmarInscricao } from '../campeonato.js';
import { COMPARATIVO, simular } from '../dominio/comparativo.js';
import { entradaPix, monitorPix } from '../pixmonitor.js';

/** Dá baixa no que a referência representa. Cada confirmação é idempotente (aviso repetido não credita duas vezes). */
export async function confirmarPorRef(db, ref, gw) {
  if (ref.startsWith('rec-')) { const r = await confirmarRecarga(db, ref, gw); return r.erro ? { ignorado: r.erro } : { ok: true }; }
  if (ref.startsWith('ins-')) { const r = await confirmarInscricao(db, ref, gw, 'pix'); return r.erro ? { ignorado: r.erro } : { ok: true }; }
  if (ref.startsWith('cob-')) {
    const c = await db.prepare('SELECT id, pedido_id, status FROM cobranca WHERE id = ?').bind(ref).first();
    if (!c) return { ignorado: 'cobrança não encontrada' };
    if (c.status === 'paga') return { ok: true };
    if (c.status !== 'pendente') return { ignorado: 'pedido já cancelado ou vencido: devolva o valor ao cliente' };
    await db.prepare("UPDATE cobranca SET status = 'paga', paga_em = datetime('now'), operador = ? WHERE id = ? AND status = 'pendente'").bind(gw, c.id).run();
    await conferirQuitacao(db, c.pedido_id, gw);
    return { ok: true };
  }
  return { ignorado: 'referência desconhecida' };
}

async function aviso(request, env, id) {
  if (id === 'pix-monitor') return entradaPix(request, env);
  const g = GATEWAYS[id]; if (!g) return erro('Gateway desconhecido.', 404);
  if (!g.configurado(env)) return erro('Gateway não configurado.', 503);
  const db = env.DB, bruto = await request.text();
  const a = await g.identificarAviso(env, request, bruto);
  if (a.erro) return erro(a.erro, a.status ?? 400);
  if (a.ignorar) return json({ ok: true, ignorado: 'evento sem pagamento' });
  let info; try { info = await g.consultar(env, a); } catch (e) { console.error('consulta ao gateway:', e.message); return erro('Não consegui consultar o gateway agora.', 502); }   // 5xx → o gateway tenta de novo
  if (!info.pago) return json({ ok: true, pendente: true });
  const px = await db.prepare('SELECT gateway, valor FROM pix_externo WHERE ref = ?').bind(info.ref).first();
  if (!px || px.gateway !== g.id) return json({ ok: true, ignorado: 'referência desconhecida' });
  if (Math.abs(px.valor - info.valor) > 0.005) { console.error(`valor divergente em ${info.ref}: cobrado ${px.valor}, pago ${info.valor}`); return erro('Valor pago diferente do cobrado.', 409); }
  return json(await confirmarPorRef(db, info.ref, g.id));
}

export async function rotearPagamentos(request, env, url) {
  const p = url.pathname, m = request.method;
  let r;
  if (m === 'POST' && (r = p.match(/^\/api\/pagamentos\/aviso\/([\w-]+)$/))) return aviso(request, env, r[1]);
  const eu = await usuarioLogado(request, env);
  if (!eu) return erro('Entre com seu nome e senha.', 401);
  if (p.startsWith('/api/pagamentos/monitor')) return monitorPix(request, env, url, eu);
  if (p === '/api/pagamentos/gateway' && m === 'GET') {
    const ativo = await gatewayAtivo(env.DB, env);
    return json({ ativo: ativo.id, url_aviso: `${env.URL_PUBLICA || url.origin}/api/pagamentos/aviso/`,
      gateways: [{ id: MANUAL.id, nome: MANUAL.nome, segredos: [], configurado: true }, ...Object.values(GATEWAYS).map((g) => ({ id: g.id, nome: g.nome, segredos: g.segredos, configurado: g.configurado(env) }))] });
  }
  if (p === '/api/pagamentos/gateway' && m === 'PUT') {
    if (eu.papel !== 'superadmin') return erro('Só o superadmin troca o gateway.', 403);
    let c = {}; try { c = await request.json(); } catch { /* vazio */ }
    const g = c.gateway === 'manual' ? MANUAL : GATEWAYS[c.gateway];
    if (!g) return erro('Gateway desconhecido.');
    if (!g.configurado(env)) return erro(`Falta cadastrar o segredo na Cloudflare: ${g.segredos.join(', ')}.`, 409);
    await env.DB.prepare("INSERT INTO configuracao (chave, valor) VALUES ('gateway_pix', ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor").bind(g.id).run();
    return json({ ok: true, ativo: g.id });
  }
  if (p === '/api/pagamentos/comparativo' && m === 'GET') {
    const q = url.searchParams;
    return json({ gateways: COMPARATIVO, simulacao: simular({ ticket: q.get('ticket') ?? 40, pix_qtd: q.get('pix_qtd') ?? 500, debito_qtd: q.get('debito_qtd') ?? 0, credito_qtd: q.get('credito_qtd') ?? 0 }) });
  }
  return null;
}
