// Auditoria: grava quem fez o quê (toda chamada que muda algo, e todo login) e deixa o superadmin consultar.
import { json } from './api.js';
import { usuarioLogado, hashToken } from './auth.js';

const erro = (m, s = 400) => json({ erro: m }, s);
const RETENCAO_DIAS = 180;

// Rótulos em português por rota. Primeira que casar vence.
const ROTULOS = [
  ['POST', /^\/api\/auth\/entrar$/, 'Entrou no sistema'], ['POST', /^\/api\/auth\/sair$/, 'Saiu do sistema'], ['POST', /^\/api\/auth\/primeiro-acesso$/, 'Primeiro acesso (criou o superadmin)'],
  ['POST', /^\/api\/auth\/trocar-senha$/, 'Trocou a própria senha'], ['POST', /^\/api\/auth\/passar-cargo$/, 'Passou o cargo de superadmin'],
  ['POST', /^\/api\/usuarios$/, 'Criou um login'], ['PUT', /^\/api\/usuarios\/\d+\/modulos$/, 'Mudou as permissões de um login'], ['PUT', /^\/api\/usuarios\//, 'Alterou um login'], ['DELETE', /^\/api\/usuarios\//, 'Removeu um login'],
  ['POST', /^\/api\/venda\/comandas$/, 'Abriu uma venda'], ['POST', /^\/api\/venda\/comandas\/[\w-]+\/itens$/, 'Mexeu nos itens da venda'], ['POST', /^\/api\/venda\/comandas\/[\w-]+\/cobrar$/, 'Cobrou a venda'],
  ['POST', /^\/api\/venda\/comandas\/[\w-]+\/cliente$/, 'Ligou a venda a um cliente'], ['DELETE', /^\/api\/venda\/comandas\//, 'Descartou a venda'], ['POST', /^\/api\/venda\/comandas\/[\w-]+\/cancelar$/, 'Cancelou a venda'],
  ['POST', /^\/api\/venda\/cobrancas\/[\w-]+\/confirmar$/, 'Confirmou um pagamento'], ['POST', /^\/api\/venda\/cobrancas\/[\w-]+\/cancelar$/, 'Cancelou uma cobrança'],
  ['POST', /^\/api\/venda\/retirada$/, 'Conferiu/entregou pelo QR'], ['PUT', /^\/api\/venda\/pix$/, 'Mudou a chave Pix'], ['PUT', /^\/api\/venda\/trava$/, 'Ligou/desligou a trava de estoque'], ['PUT', /^\/api\/venda\/roteamento$/, 'Mudou o roteamento das maquininhas'], ['PUT', /^\/api\/venda\/maquininhas\//, 'Alterou uma maquininha'],
  ['POST', /^\/api\/producao\/[\w-]+\/preparo$/, 'Moveu pedido na produção'],
  ['PUT', /^\/api\/teste$/, 'Ligou/desligou o modo teste'], ['PUT', /^\/api\/visual$/, 'Salvou o visual padrão da casa'],
  ['POST', /^\/api\/listas$/, 'Gerou lista de compras'], ['POST', /^\/api\/listas\/\d+\/limpar$/, 'Limpou a lista de compras'], ['POST', /^\/api\/listas\/\d+\/finalizar$/, 'Finalizou a compra'], ['POST', /^\/api\/listas\/\d+\/itens$/, 'Adicionou item à lista'], ['PATCH', /^\/api\/listas\//, 'Marcou/editou item da lista'],
  ['PUT', /^\/api\/recomendados/, 'Mudou o estoque recomendado'], ['PUT', /^\/api\/alertas/, 'Mudou nível de aviso'], ['POST', /^\/api\/contagem/, 'Fez contagem de estoque'], ['POST', /^\/api\/compras/, 'Registrou compra'], ['POST', /^\/api\/relatorio/, 'Importou relatório de vendas'], ['POST', /^\/api\/perdas?/, 'Registrou perda'],
  ['POST', /^\/api\/produtos/, 'Criou produto'], ['PUT', /^\/api\/produtos\//, 'Editou produto'], ['DELETE', /^\/api\/produtos\//, 'Removeu produto'], ['POST', /^\/api\/combos/, 'Criou combo'], ['PUT', /^\/api\/combos\//, 'Editou combo'], ['DELETE', /^\/api\/combos\//, 'Removeu combo'],
  ['POST', /^\/api\/fotos/, 'Enviou foto'], ['PUT', /^\/api\/fotos/, 'Alterou foto'], ['DELETE', /^\/api\/fotos/, 'Removeu foto'],
  ['POST', /^\/api\/fornecedores/, 'Criou fornecedor'], ['PUT', /^\/api\/fornecedores\//, 'Editou fornecedor'], ['DELETE', /^\/api\/fornecedores\//, 'Removeu fornecedor'],
  ['POST', /^\/api\/clientes\/[\w-]+\/codigo-senha$/, 'Gerou código de recuperação de senha de cliente'], ['POST', /^\/api\/clientes\/[\w-]+\/pontos$/, 'Ajustou pontos de cliente'], ['PUT', /^\/api\/clientes\//, 'Editou cliente'],
  ['POST', /^\/api\/financeiro\//, 'Lançou no financeiro'], ['PUT', /^\/api\/financeiro\//, 'Alterou no financeiro'], ['DELETE', /^\/api\/financeiro\//, 'Removeu no financeiro'], ['POST', /^\/api\/planilhas\//, 'Importou planilha Excel'],
  ['POST', /^\/api\/cliente\/pedidos$/, 'Fez um pedido pelo app'], ['POST', /^\/api\/conta\/cadastro$/, 'Criou conta de cliente'], ['POST', /^\/api\/conta\/entrar$/, 'Cliente entrou na conta'], ['POST', /^\/api\/conta\/google$/, 'Cliente entrou com Google'],
  ['POST', /^\/api\/conta\/esqueci$/, 'Cliente pediu código de senha'], ['POST', /^\/api\/conta\/redefinir$/, 'Cliente criou senha nova'], ['PUT', /^\/api\/conta\/eu$/, 'Cliente mudou o próprio nome'],
];
const rotuloDe = (m, p) => ROTULOS.find(([mm, re]) => mm === m && re.test(p))?.[2] ?? `${m} ${p.replace('/api/', '')}`;
const IGNORAR = [/^\/api\/auditoria/, /^\/api\/cliente\/pedidos\/[\w-]+\/push$/, /^\/api\/cliente\/pagamento\/webhook$/];
const SEGREDO = /senha|token|codigo|chave|credential|secret|authorization|p256dh|auth$|endpoint|imagem|foto|base64|dados/i;   // nada sensível (nem fotos em base64) vai para o registro

function resumir(v, nivel = 0) {
  if (v == null) return v;
  if (typeof v === 'string') return v.length > 80 ? v.slice(0, 80) + '…' : v;
  if (typeof v !== 'object') return v;
  if (nivel > 2) return '…';
  if (Array.isArray(v)) return v.length > 8 ? [...v.slice(0, 8).map((x) => resumir(x, nivel + 1)), `+${v.length - 8} itens`] : v.map((x) => resumir(x, nivel + 1));
  const o = {}; for (const [k, x] of Object.entries(v)) o[k] = SEGREDO.test(k) ? '(oculto)' : resumir(x, nivel + 1); return o;
}

/** Quem está agindo? Equipe (Bearer), cliente (X-Sessao-Cliente) ou visitante. Chamar ANTES de rotear: o logout apaga a sessão. */
export async function identificarAtor(request, env, corpoLogin) {
  const eu = await usuarioLogado(request, env).catch(() => null);
  if (eu) return { tipo: 'equipe', nome: eu.nome, papel: eu.papel };
  const t = request.headers.get('X-Sessao-Cliente');
  if (t && env.DB) {
    const c = await env.DB.prepare("SELECT c.nome FROM cliente_sessao s JOIN cliente c ON c.id = s.cliente_id WHERE s.token_hash = ? AND s.expira_em > datetime('now')").bind(await hashToken(t)).first().catch(() => null);
    if (c) return { tipo: 'cliente', nome: c.nome, papel: null };
  }
  const tentativa = corpoLogin?.nome ?? corpoLogin?.login;   // login com senha errada: registra quem tentou entrar
  return { tipo: 'visitante', nome: tentativa ? String(tentativa).slice(0, 40) : 'visitante', papel: null };
}

export function deveRegistrar(request, url) {
  return url.pathname.startsWith('/api/') && request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS' && !IGNORAR.some((re) => re.test(url.pathname));
}

export async function registrar(env, { ator, request, url, status, corpo }) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') ?? '';
    const h = ip ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mukifo-ip|' + ip)))].slice(0, 3).map((b) => b.toString(16).padStart(2, '0')).join('') : null;
    let resumo = null;
    if (corpo && typeof corpo === 'object') { resumo = JSON.stringify(resumir(corpo)); if (resumo.length > 600) resumo = resumo.slice(0, 600) + '…'; }
    await env.DB.prepare('INSERT INTO auditoria (ator_tipo, ator_nome, papel, acao, metodo, rota, status, resumo, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(ator.tipo, ator.nome, ator.papel, rotuloDe(request.method, url.pathname), request.method, url.pathname, status, resumo, h).run();
    if (Math.random() < 0.02) await env.DB.prepare(`DELETE FROM auditoria WHERE quando < datetime('now', '-${RETENCAO_DIAS} days')`).run();
  } catch (e) { console.error('auditoria', e); }   // nunca derruba a operação por causa do registro
}

/** GET /api/auditoria?pessoa=&de=&ate=&q=&tipo=&so_erros=1&limite= — só superadmin. */
export async function rotearAuditoria(request, env, url) {
  const eu = await usuarioLogado(request, env);
  if (!eu) return erro('Entre com seu nome e senha', 401);
  if (eu.papel !== 'superadmin') return erro('Só o superadmin vê o registro de atividades.', 403);
  if (request.method !== 'GET' || url.pathname !== '/api/auditoria') return null;
  const db = env.DB, s = url.searchParams, ok = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x ?? '');
  const onde = [], b = [];
  if (s.get('pessoa')) { onde.push('ator_nome = ?'); b.push(s.get('pessoa')); }
  if (['equipe', 'cliente', 'visitante'].includes(s.get('tipo'))) { onde.push('ator_tipo = ?'); b.push(s.get('tipo')); }
  if (ok(s.get('de'))) { onde.push("date(datetime(quando, '-3 hours')) >= ?"); b.push(s.get('de')); }
  if (ok(s.get('ate'))) { onde.push("date(datetime(quando, '-3 hours')) <= ?"); b.push(s.get('ate')); }
  if (s.get('so_erros') === '1') onde.push('status >= 400');
  const q = (s.get('q') ?? '').trim().toLowerCase().replace(/[%_]/g, '');
  if (q) { onde.push("(LOWER(acao) LIKE ? OR LOWER(COALESCE(resumo, '')) LIKE ? OR LOWER(rota) LIKE ?)"); b.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const lim = Math.min(Math.max(parseInt(s.get('limite') ?? '200', 10) || 200, 1), 1000);
  const W = onde.length ? 'WHERE ' + onde.join(' AND ') : '';
  const [{ results: registros }, { results: pessoas }, tot] = await Promise.all([
    db.prepare(`SELECT id, quando, ator_tipo, ator_nome, papel, acao, metodo, rota, status, resumo, ip FROM auditoria ${W} ORDER BY id DESC LIMIT ${lim}`).bind(...b).all(),
    db.prepare(`SELECT ator_nome AS nome, CASE WHEN SUM(ator_tipo = 'equipe') > 0 THEN 'equipe' WHEN SUM(ator_tipo = 'cliente') > 0 THEN 'cliente' ELSE 'visitante' END AS tipo, COUNT(*) AS acoes, MAX(quando) AS ultima, SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS erros,
                MAX(CASE WHEN acao = 'Entrou no sistema' AND status < 400 THEN quando END) AS ultimo_login FROM auditoria GROUP BY ator_nome ORDER BY ultima DESC LIMIT 200`).all(),
    db.prepare(`SELECT COUNT(*) AS n FROM auditoria ${W}`).bind(...b).first()]);
  return json({ total: tot.n, mostrando: registros.length, retencao_dias: RETENCAO_DIAS, registros: registros.map((r) => ({ ...r, resumo: r.resumo ? (() => { try { return JSON.parse(r.resumo); } catch { return r.resumo; } })() : null })), pessoas });
}
