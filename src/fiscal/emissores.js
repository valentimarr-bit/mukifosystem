// Emissores de nota fiscal. Cada um segue o mesmo contrato, como os gateways de pagamento:
//   configurado(env) · emitir(env, ambiente, ref, nota) · consultar(env, ambiente, ref) · cancelar(env, ambiente, ref, justificativa)
// Retorno normalizado: { status: 'pendente'|'autorizada'|'rejeitada'|'cancelada'|'erro', numero, serie, chave, protocolo, url_danfe, url_xml, mensagem }
// O segredo do emissor vive só no Cloudflare (wrangler secret), nunca no banco.

const BASES = { focusnfe: { homologacao: 'https://homologacao.focusnfe.com.br', producao: 'https://api.focusnfe.com.br' } };

function normalizarFocus(base, http, j) {
  const abs = (u) => (u ? (String(u).startsWith('http') ? u : base + u) : null);
  const s = String(j?.status ?? '');
  let status = 'erro';
  if (s === 'autorizado') status = 'autorizada';
  else if (s === 'processando_autorizacao') status = 'pendente';
  else if (s === 'cancelado') status = 'cancelada';
  else if (s === 'erro_autorizacao' || s === 'denegado') status = 'rejeitada';
  else if (http === 202) status = 'pendente';
  const msg = j?.mensagem_sefaz || j?.mensagem || (Array.isArray(j?.erros) ? j.erros.map((e) => e.mensagem).join('; ') : null) || null;
  return { status, numero: j?.numero ?? null, serie: j?.serie ?? null, chave: j?.chave_nfe ?? null, protocolo: j?.protocolo ?? null, url_danfe: abs(j?.caminho_danfe ?? j?.url_danfe), url_xml: abs(j?.caminho_xml_nota_fiscal), mensagem: msg };
}

const focus = {
  nome: 'Focus NFe',
  configurado: (env) => !!env.FOCUSNFE_TOKEN,
  async chamar(env, ambiente, metodo, caminho, corpo) {
    const base = BASES.focusnfe[ambiente] ?? BASES.focusnfe.homologacao;
    const r = await fetch(base + caminho, { method: metodo, headers: { authorization: 'Basic ' + btoa(env.FOCUSNFE_TOKEN + ':'), 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    let j = {}; try { j = await r.json(); } catch { /* resposta vazia */ }
    return normalizarFocus(base, r.status, r.status >= 500 ? { status: 'erro', mensagem: 'O emissor está indisponível. Tente de novo em instantes.' } : j);
  },
  emitir(env, ambiente, ref, nota) { return this.chamar(env, ambiente, 'POST', `/v2/nfce?ref=${encodeURIComponent(ref)}`, nota); },
  consultar(env, ambiente, ref) { return this.chamar(env, ambiente, 'GET', `/v2/nfce/${encodeURIComponent(ref)}`); },
  cancelar(env, ambiente, ref, justificativa) { return this.chamar(env, ambiente, 'DELETE', `/v2/nfce/${encodeURIComponent(ref)}`, { justificativa }); },
};

export const EMISSORES = { focusnfe: focus };
export const emissorAtivo = (nome) => EMISSORES[nome] ?? null;
