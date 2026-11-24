// Abas "Financeiro" e "Planilhas" da gestão.
window.Financeiro = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const brl = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dBr = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
  const num = (v) => Number(String(v).replace(/\./g, '').replace(',', '.'));
  const api = async (url, corpo, metodo) => {
    const m = metodo || (corpo ? 'POST' : 'GET');
    const r = await fetch(url, { method: m, body: m !== 'GET' && m !== 'DELETE' ? JSON.stringify(corpo || {}) : undefined, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + Mukifo.token() } });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status); return j;
  };
  let sup = false, mes = new Date().toISOString().slice(0, 7), sub = 'caixa';
  const msg = (t, ruim) => { const e = $('#fnMsg'); if (e) { e.textContent = t; e.className = ruim ? 'neg' : 'mut'; } };

  async function iniciar(eSuper) {
    sup = eSuper; const raiz = $('#financeiro');
    raiz.innerHTML = `<div class="bar" id="fnSub"></div><p id="fnMsg" class="mut"></p><div id="fnCorpo"></div>`;
    const abas = [['caixa', 'Caixa do turno'], ...(sup ? [['resumo', 'Resultado do mês'], ['despesas', 'Contas a pagar'], ['fluxo', 'Fluxo de caixa'], ['taxas', 'Taxas']] : [])];
    $('#fnSub').innerHTML = abas.map(([k, n]) => `<button class="btn" data-s="${k}" aria-pressed="${k === sub}">${n}</button>`).join('');
    $('#fnSub').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { sub = b.dataset.s; [...$('#fnSub').children].forEach((x) => x.setAttribute('aria-pressed', x === b)); desenhar(); } };
    desenhar();
  }
  const desenhar = () => { msg(''); ({ caixa, resumo, despesas, fluxo, taxas })[sub]().catch((e) => msg(e.message, true)); };

  async function caixa() {
    const c = await api('/api/financeiro/caixa'), f = c.fechamento;
    $('#fnCorpo').innerHTML = `<h3>Caixa de ${dBr(c.dia)}</h3>
      <table><tr><th>Forma</th><th>Cobranças</th><th>Total</th></tr>${c.por_forma.map((x) => `<tr><td>${esc(x.forma)}</td><td>${x.cobrancas}</td><td>${brl(x.total)}</td></tr>`).join('')}<tr><th>Total vendido</th><th></th><th>${brl(c.total_vendido)}</th></tr></table>
      <p>Dinheiro esperado na gaveta: <b>${brl(c.esperado_dinheiro)}</b> <span class="mut">(fundo + dinheiro recebido + suprimentos − sangrias)</span></p>
      ${c.movimentos.length ? `<table><tr><th>Movimento</th><th>Valor</th><th>Motivo</th></tr>${c.movimentos.map((m) => `<tr><td>${m.tipo === 'sangria' ? 'Sangria (tirou)' : 'Suprimento (colocou)'}</td><td>${brl(m.valor)}</td><td>${esc(m.motivo)}</td></tr>`).join('')}</table>` : ''}
      ${f ? `<p><b>Caixa fechado</b> por ${esc(f.fechado_por)}: contado ${brl(f.contado_dinheiro)}, diferença <b class="${f.diferenca < 0 ? 'neg' : ''}">${brl(f.diferenca)}</b></p>` : ''}
      <h4>Sangria / suprimento</h4>
      <div class="bar"><select id="cxTipo"><option value="sangria">Sangria (tirei dinheiro)</option><option value="suprimento">Suprimento (coloquei troco)</option></select><input id="cxValor" inputmode="decimal" placeholder="Valor"><input id="cxMotivo" placeholder="Motivo" style="flex:1"><button class="btn" id="cxMov">Lançar</button></div>
      <h4>Fechar o caixa</h4>
      <div class="bar"><input id="cxFundo" inputmode="decimal" placeholder="Fundo de troco do início" value="${String(f?.fundo_inicial ?? c.fundo_inicial ?? c.sugestao_fundo ?? 0).replace('.', ',')}"><input id="cxContado" inputmode="decimal" placeholder="Dinheiro contado agora"><button class="btn prim" id="cxFechar">Fechar caixa</button></div>`;
    $('#cxMov').onclick = async () => { try { await api('/api/financeiro/caixa/mov', { tipo: $('#cxTipo').value, valor: num($('#cxValor').value), motivo: $('#cxMotivo').value }); caixa(); } catch (e) { msg(e.message, true); } };
    $('#cxFechar').onclick = async () => { try { await api('/api/financeiro/caixa/fechar', { fundo_inicial: num($('#cxFundo').value || 0), contado_dinheiro: num($('#cxContado').value) }); caixa(); } catch (e) { msg(e.message, true); } };
  }

  async function resumo() {
    const r = await api('/api/financeiro/resumo?mes=' + mes), l = (n, v, cls = '') => `<tr><td>${n}</td><td class="${cls}" style="text-align:right">${v}</td></tr>`;
    $('#fnCorpo').innerHTML = `<div class="bar"><input type="month" id="rsMes" value="${mes}"></div>
      <table>${l('Faturamento', brl(r.faturamento))}${l('− Taxas de cartão/Pix', brl(r.taxas))}${l('− Custo das mercadorias (ficha)', brl(r.cmv))}${l('<b>= Lucro bruto</b>', '<b>' + brl(r.lucro_bruto) + '</b>')}
      ${l('− Despesas fixas', brl(r.despesas.fixas))}${l('− Despesas variáveis', brl(r.despesas.variaveis))}${l('<b>= Resultado do mês</b>', '<b>' + brl(r.resultado) + '</b>', r.resultado < 0 ? 'neg' : '')}</table>
      <p>Margem líquida: <b>${r.margem_liquida_pct ?? '—'}%</b> · Margem de contribuição: <b>${r.margem_contribuicao_pct ?? '—'}%</b></p>
      <p>Ponto de equilíbrio: <b>${brl(r.equilibrio_mensal)}</b> por mês${r.equilibrio_por_dia ? ` (≈ <b>${brl(r.equilibrio_por_dia)}</b> por dia aberto)` : ''}</p>
      ${r.vencidas > 0 ? `<p class="neg">Contas vencidas em aberto: ${brl(r.vencidas)}</p>` : ''}
      ${r.despesas.por_categoria.length ? `<h4>Despesas por categoria</h4><table>${r.despesas.por_categoria.map((c) => `<tr><td>${esc(c.categoria)} <span class="mut">(${c.tipo})</span></td><td style="text-align:right">${brl(c.valor)}</td></tr>`).join('')}</table>` : ''}
      <p class="mut">${esc(r.aviso)} Custo da ficha cobre ${r.cobertura_ficha_pct ?? '—'}% das vendas.</p>`;
    $('#rsMes').onchange = (e) => { mes = e.target.value || mes; resumo(); };
  }

  async function despesas() {
    const j = await api('/api/financeiro/despesas?status=todas'), d = j.despesas;
    $('#fnCorpo').innerHTML = `<div class="bar"><button class="btn prim" id="dsNova">＋ Nova conta</button><button class="btn" id="dsGerar">Gerar contas do mês (as que repetem)</button></div><div id="dsExcel"></div>
      <table><tr><th>Vence</th><th>Conta</th><th>Valor</th><th></th></tr>${d.map((x) => `<tr><td>${dBr(x.vencimento)}</td><td>${esc(x.descricao)} <span class="mut">${esc(x.categoria)}${x.recorrente ? ' · todo mês' : ''}</span></td><td>${brl(x.valor)}</td>
      <td>${x.status === 'paga' ? '<span class="mut">paga ' + dBr(x.pago_em) + '</span>' : `<button class="btn" data-p="${x.id}">Paguei</button>`} <button class="btn" data-x="${x.id}" aria-label="Apagar">🗑</button></td></tr>`).join('') || '<tr><td colspan="4" class="mut">Nenhuma conta ainda. Cadastre ou importe a planilha.</td></tr>'}</table>
      <dialog id="dlgDesp" style="max-width:94vw;width:460px;background:var(--card);color:var(--txt);border:1px solid var(--line);border-radius:14px;padding:18px"><h3>Nova conta</h3>
        <label>Descrição<input id="dsDesc"></label><label>Categoria<input id="dsCat" placeholder="Aluguel, Luz, Folha, Fornecedor…"></label>
        <label>Tipo<select id="dsTipo"><option value="fixa">Fixa (todo mês igual)</option><option value="variavel">Variável</option></select></label>
        <label>Valor (R$)<input id="dsValor" inputmode="decimal"></label><label>Vencimento<input type="date" id="dsVenc"></label>
        <label class="chk"><input type="checkbox" id="dsRec"> Repete todo mês</label><div class="bar" style="margin-top:12px"><button class="btn" id="dsCancela" style="flex:1">Cancelar</button><button class="btn prim" id="dsSalva" style="flex:1">Salvar</button></div></dialog>`;
    Planilhas.botoes($('#dsExcel'), ['despesas'], despesas);
    const dlg = $('#dlgDesp'); $('#dsNova').onclick = () => { $('#dsVenc').value = j.hoje; dlg.showModal(); }; $('#dsCancela').onclick = () => dlg.close();
    $('#dsSalva').onclick = async () => { try { await api('/api/financeiro/despesas', { descricao: $('#dsDesc').value, categoria: $('#dsCat').value, tipo: $('#dsTipo').value, valor: num($('#dsValor').value), vencimento: $('#dsVenc').value, recorrente: $('#dsRec').checked ? 'mensal' : null }); dlg.close(); despesas(); } catch (e) { msg(e.message, true); dlg.close(); } };
    $('#dsGerar').onclick = async () => { try { const g = await api('/api/financeiro/despesas/gerar-mes', { mes }); msg(`${g.criadas} conta(s) criada(s); ${g.ja_existiam} já existiam.`); despesas(); } catch (e) { msg(e.message, true); } };
    $('#fnCorpo').onclick = async (e) => {
      const p = e.target.closest('[data-p]'), x = e.target.closest('[data-x]');
      try { if (p) { await api(`/api/financeiro/despesas/${p.dataset.p}/pagar`, {}); despesas(); } if (x && confirm('Apagar essa conta?')) { await api('/api/financeiro/despesas/' + x.dataset.x, null, 'DELETE'); despesas(); } } catch (er) { msg(er.message, true); }
    };
  }

  async function fluxo() {
    const f = await api('/api/financeiro/fluxo');
    $('#fnCorpo').innerHTML = `${f.vencidas_total > 0 ? `<p class="neg"><b>Vencidas:</b> ${brl(f.vencidas_total)} em ${f.vencidas.length} conta(s)</p>` : ''}
      <table><tr><th>Semana</th><th>Entra</th><th>Sai</th><th>Saldo</th><th>Acumulado</th></tr>${f.semanas.map((s) => `<tr><td>${dBr(s.de)} a ${dBr(s.ate)}</td><td>${brl(s.entradas)}</td><td>${brl(s.saidas)}</td><td class="${s.saldo < 0 ? 'neg' : ''}">${brl(s.saldo)}</td><td class="${s.acumulado < 0 ? 'neg' : ''}">${brl(s.acumulado)}</td></tr>`).join('')}</table>
      <p class="mut">${esc(f.aviso)}</p>`;
  }

  async function taxas() {
    const t = (await api('/api/financeiro/taxas')).taxas, lista = Array.isArray(t) ? t : Object.entries(t).map(([forma, v]) => ({ forma, ...v }));
    $('#fnCorpo').innerHTML = `<p class="mut">O que cada forma de pagamento desconta e em quantos dias o dinheiro cai na conta.</p><div id="txExcel"></div>
      <table><tr><th>Forma</th><th>Taxa %</th><th>Fixa R$</th><th>Dias</th></tr>${lista.map((x) => `<tr data-f="${x.forma}"><td>${esc(x.forma)}</td><td><input data-k="percentual" inputmode="decimal" value="${String(x.percentual).replace('.', ',')}"></td><td><input data-k="fixo" inputmode="decimal" value="${String(x.fixo).replace('.', ',')}"></td><td><input data-k="dias" inputmode="numeric" value="${x.dias}"></td></tr>`).join('')}</table>
      <button class="btn prim" id="txSalva">Salvar taxas</button>`;
    Planilhas.botoes($('#txExcel'), ['taxas'], taxas);
    $('#txSalva').onclick = async () => { try { await api('/api/financeiro/taxas', { taxas: [...document.querySelectorAll('#fnCorpo tr[data-f]')].map((tr) => ({ forma: tr.dataset.f, percentual: num(tr.querySelector('[data-k=percentual]').value), fixo: num(tr.querySelector('[data-k=fixo]').value), dias: Number(tr.querySelector('[data-k=dias]').value) })) }, 'PUT'); msg('Taxas salvas.'); } catch (e) { msg(e.message, true); } };
  }

  async function planilhas(eSuper) {
    const raiz = $('#planilhas'), todas = await Planilhas.lista();
    raiz.innerHTML = `<p>Para alimentar o sistema com os donos: <b>1)</b> baixe o modelo, <b>2)</b> preencha no Excel, <b>3)</b> importe. O sistema confere tudo antes de gravar — se houver erro, nada é gravado e ele diz a linha.</p>
      <p class="mut">Ordem sugerida: Fornecedores → Insumos → Produtos → Fichas → Combos → Contagem de estoque → Taxas → Despesas.${eSuper ? '' : ' Só o superadmin importa; você pode baixar modelos e exportar.'}</p>
      <div class="bar"><label>Vendas — de <input type="date" id="plDe"></label><label>até <input type="date" id="plAte"></label></div><div id="plLista"></div>`;
    const ordem = ['fornecedores', 'insumos', 'produtos', 'fichas', 'combos', 'contagem', 'taxas', 'despesas', 'compras', 'vendas'];
    $('#plLista').innerHTML = ordem.filter((id) => todas.some((d) => d.id === id)).map((id) => `<div class="card" style="margin-bottom:14px"><b>${esc(todas.find((d) => d.id === id).nome)}</b><p class="mut" style="margin:4px 0 8px">${esc(todas.find((d) => d.id === id).descricao)}</p><div data-pl="${id}"></div></div>`).join('');
    document.querySelectorAll('[data-pl]').forEach((el) => Planilhas.botoes(el, [el.dataset.pl]));
  }
  return { iniciar, planilhas };
})();
