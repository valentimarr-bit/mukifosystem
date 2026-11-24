// Nota fiscal de venda (NFC-e): configuração, dados fiscais dos produtos, emissão, consulta e cancelamento. Módulo "financeiro".
import { json } from './api.js';
import { usuarioLogado } from './auth.js';
import { cnpjValido, soDigitos } from './dominio/fiscal.js';
import { montarNfce, ncmValido, cfopValido, csosnValido } from './dominio/nfce.js';
import { emissorAtivo, EMISSORES } from './fiscal/emissores.js';
import { diaDoTurno } from './venda.js';

const erro = (m, s = 400) => json({ erro: m }, s);
const corpoDe = async (r) => { try { return (await r.json()) ?? {}; } catch { return {}; } };
const CHAVES = ['fiscal_emissor', 'fiscal_ambiente', 'fiscal_cnpj', 'fiscal_ncm_padrao', 'fiscal_cfop_padrao', 'fiscal_csosn_padrao', 'fiscal_origem_padrao'];

export async function configFiscal(db) {
  const { results } = await db.prepare(`SELECT chave, valor FROM configuracao WHERE chave IN (${CHAVES.map(() => '?').join(',')})`).bind(...CHAVES).all();
  const c = Object.fromEntries(results.map((r) => [r.chave, r.valor]));
  return { emissor: c.fiscal_emissor ?? 'desligado', ambiente: c.fiscal_ambiente === 'producao' ? 'producao' : 'homologacao', cnpj: c.fiscal_cnpj ?? '', ncm: c.fiscal_ncm_padrao ?? '', cfop: c.fiscal_cfop_padrao ?? '5102', csosn: c.fiscal_csosn_padrao ?? '102', origem: c.fiscal_origem_padrao ?? '0' };
}

async function salvarConfig(db, c) {
  const novo = {};
  if (c.emissor !== undefined) { if (c.emissor !== 'desligado' && !EMISSORES[c.emissor]) return erro('Emissor desconhecido.'); novo.fiscal_emissor = c.emissor; }
  if (c.ambiente !== undefined) { if (!['homologacao', 'producao'].includes(c.ambiente)) return erro('Ambiente inválido.'); novo.fiscal_ambiente = c.ambiente; }
  if (c.cnpj !== undefined) { const n = soDigitos(c.cnpj); if (n && !cnpjValido(n)) return erro('CNPJ inválido.'); novo.fiscal_cnpj = n; }
  if (c.ncm !== undefined) { if (c.ncm && !ncmValido(c.ncm)) return erro('NCM tem 8 números.'); novo.fiscal_ncm_padrao = c.ncm; }
  if (c.cfop !== undefined) { if (!cfopValido(c.cfop)) return erro('CFOP inválido (ex.: 5102).'); novo.fiscal_cfop_padrao = c.cfop; }
  if (c.csosn !== undefined) { if (!csosnValido(c.csosn)) return erro('CSOSN inválido (ex.: 102).'); novo.fiscal_csosn_padrao = c.csosn; }
  if (c.origem !== undefined) { if (!/^[0-8]$/.test(String(c.origem))) return erro('Origem de 0 a 8.'); novo.fiscal_origem_padrao = String(c.origem); }
  const ops = Object.entries(novo).map(([k, v]) => db.prepare('INSERT INTO configuracao (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor').bind(k, String(v)));
  if (ops.length) await db.batch(ops);
  return json({ ok: true });
}

const VIVA = "status IN ('pendente', 'autorizada')";
const aplicar = (db, id, r) => db.prepare("UPDATE nota_emitida SET status = ?, numero = COALESCE(?, numero), serie = COALESCE(?, serie), chave = COALESCE(?, chave), protocolo = COALESCE(?, protocolo), url_danfe = COALESCE(?, url_danfe), url_xml = COALESCE(?, url_xml), mensagem = ?, atualizado_em = datetime('now') WHERE id = ?")
  .bind(r.status, r.numero, r.serie, r.chave, r.protocolo, r.url_danfe, r.url_xml, r.mensagem, id).run();

/** Emite a NFC-e de um pedido pago. Idempotente: se já existe nota viva, devolve ela. */
export async function emitirParaPedido(db, env, pedidoId, usuario = null) {
  const cfg = await configFiscal(db), em = emissorAtivo(cfg.emissor);
  if (!em) return { erro: 'A emissão de nota está desligada. Escolha o emissor na configuração fiscal.', status: 409 };
  if (!em.configurado(env)) return { erro: 'Falta o token do emissor no Cloudflare (FOCUSNFE_TOKEN).', status: 503 };
  const pedido = await db.prepare('SELECT * FROM pedido WHERE id = ?').bind(pedidoId).first();
  if (!pedido) return { erro: 'Pedido não encontrado.', status: 404 };
  if (['cancelado', 'aguardando_pagamento', 'aberta'].includes(pedido.status)) return { erro: 'Só pedidos pagos recebem nota.', status: 409 };
  const viva = await db.prepare(`SELECT * FROM nota_emitida WHERE pedido_id = ? AND tipo = 'nfce' AND ${VIVA}`).bind(pedidoId).first();
  if (viva) return { nota: viva, repetida: true };
  const { results: itens } = await db.prepare(`SELECT i.produto_id, i.nome, i.quantidade, COALESCE(i.preco, p.preco_venda) AS preco, p.ncm, p.cfop, p.csosn, p.origem, p.unidade
    FROM item_pedido i LEFT JOIN produto p ON p.id = i.produto_id WHERE i.pedido_id = ?`).bind(pedidoId).all();
  const m = montarNfce({ pedido, itens, cfg });
  if (m.erros) return { erro: m.erros.join(' | '), status: 422, erros: m.erros };
  const ref = `mkf-${pedidoId}-${Date.now().toString(36)}`.slice(0, 60);
  let ins;
  try { ins = await db.prepare('INSERT INTO nota_emitida (pedido_id, ref, ambiente, valor, criado_por) VALUES (?, ?, ?, ?, ?) RETURNING id').bind(pedidoId, ref, cfg.ambiente, pedido.total, usuario).first(); }
  catch { return { erro: 'Esse pedido já tem uma nota em andamento.', status: 409 }; }
  let r; try { r = await em.emitir(env, cfg.ambiente, ref, m.nota); } catch { r = { status: 'erro', mensagem: 'Não consegui falar com o emissor.' }; }
  await aplicar(db, ins.id, r);
  return { nota: await db.prepare('SELECT * FROM nota_emitida WHERE id = ?').bind(ins.id).first() };
}

async function consultarNota(db, env, id) {
  const n = await db.prepare('SELECT * FROM nota_emitida WHERE id = ?').bind(id).first(); if (!n) return { erro: 'Nota não encontrada.', status: 404 };
  const em = emissorAtivo((await configFiscal(db)).emissor); if (!em || !em.configurado(env)) return { erro: 'Emissor não configurado.', status: 503 };
  if (!['pendente', 'erro'].includes(n.status)) return { nota: n };
  let r; try { r = await em.consultar(env, n.ambiente, n.ref); } catch { return { nota: n }; }
  if (r.status === 'erro' && !r.mensagem) return { nota: n };
  await aplicar(db, id, r);
  return { nota: await db.prepare('SELECT * FROM nota_emitida WHERE id = ?').bind(id).first() };
}

async function cancelarNota(db, env, id, justificativa) {
  const j = String(justificativa ?? '').trim();
  if (j.length < 15) return { erro: 'A justificativa precisa ter pelo menos 15 caracteres (exigência da SEFAZ).', status: 400 };
  const n = await db.prepare('SELECT * FROM nota_emitida WHERE id = ?').bind(id).first(); if (!n) return { erro: 'Nota não encontrada.', status: 404 };
  if (n.status !== 'autorizada') return { erro: 'Só nota autorizada pode ser cancelada.', status: 409 };
  const em = emissorAtivo((await configFiscal(db)).emissor); if (!em || !em.configurado(env)) return { erro: 'Emissor não configurado.', status: 503 };
  const r = await em.cancelar(env, n.ambiente, n.ref, j);
  if (r.status !== 'cancelada') return { erro: r.mensagem || 'A SEFAZ não aceitou o cancelamento (prazo de 30 minutos para NFC-e na maioria dos estados).', status: 422 };
  await aplicar(db, id, r);
  return { nota: await db.prepare('SELECT * FROM nota_emitida WHERE id = ?').bind(id).first() };
}

const saida = (r) => (r.erro ? json({ erro: r.erro, ...(r.erros ? { erros: r.erros } : {}) }, r.status ?? 400) : json({ nota: r.nota, repetida: !!r.repetida }));

export async function rotearFiscal(request, env, url) {
  const eu = await usuarioLogado(request, env);
  if (!eu) return erro('Entre com seu nome e senha.', 401);
  if (!eu.modulos?.includes('financeiro')) return erro('Seu login não tem acesso ao financeiro.', 403);
  const db = env.DB, p = url.pathname, m = request.method; let r;
  if (m === 'GET' && p === '/api/fiscal') {
    const cfg = await configFiscal(db), em = emissorAtivo(cfg.emissor);
    const { results: notas } = await db.prepare('SELECT n.*, p.numero AS pedido_numero, p.dia FROM nota_emitida n LEFT JOIN pedido p ON p.id = n.pedido_id ORDER BY n.id DESC LIMIT 100').all();
    const { results: produtos } = await db.prepare('SELECT id, nome, categoria, ncm, cfop, csosn, origem, unidade FROM produto WHERE ativo = 1 ORDER BY (ncm IS NULL), nome').all();
    return json({ config: cfg, emissores: Object.entries(EMISSORES).map(([id, e]) => ({ id, nome: e.nome })), token_ok: !!em?.configurado(env), notas, produtos, sem_ncm: produtos.filter((x) => !x.ncm).length });
  }
  if (m === 'PUT' && p === '/api/fiscal/config') return salvarConfig(db, await corpoDe(request));
  if (m === 'PUT' && (r = p.match(/^\/api\/fiscal\/produtos\/(\d+)$/))) {
    const c = await corpoDe(request), v = (x) => (x === '' || x == null ? null : String(x).trim());
    const ncm = v(c.ncm), cfop = v(c.cfop), csosn = v(c.csosn), origem = v(c.origem);
    if (ncm && !ncmValido(ncm)) return erro('NCM tem 8 números.'); if (cfop && !cfopValido(cfop)) return erro('CFOP inválido.'); if (csosn && !csosnValido(csosn)) return erro('CSOSN inválido.');
    if (origem && !/^[0-8]$/.test(origem)) return erro('Origem de 0 a 8.');
    await db.prepare('UPDATE produto SET ncm = ?, cfop = ?, csosn = ?, origem = ?, unidade = ? WHERE id = ?').bind(ncm, cfop, csosn, origem, (v(c.unidade) ?? '').toUpperCase().slice(0, 6) || null, Number(r[1])).run();
    return json({ ok: true });
  }
  if (m === 'POST' && p === '/api/fiscal/emitir') {
    const c = await corpoDe(request); let pid = String(c.pedido_id ?? '');
    if (!pid && c.numero) { const ped = await db.prepare('SELECT id FROM pedido WHERE numero = ? AND dia = ?').bind(String(c.numero).trim().toUpperCase(), /^\d{4}-\d{2}-\d{2}$/.test(c.dia ?? '') ? c.dia : diaDoTurno()).first(); if (!ped) return erro('Não achei esse pedido nesse dia.', 404); pid = ped.id; }
    return saida(await emitirParaPedido(db, env, pid, eu.nome));
  }
  if (m === 'POST' && (r = p.match(/^\/api\/fiscal\/notas\/(\d+)\/consultar$/))) return saida(await consultarNota(db, env, Number(r[1])));
  if (m === 'POST' && (r = p.match(/^\/api\/fiscal\/notas\/(\d+)\/cancelar$/))) return saida(await cancelarNota(db, env, Number(r[1]), (await corpoDe(request)).justificativa));
  return null;
}
