// Gestão: abas Clientes e Fornecedores, painel de permissões e esconder o que o login não pode ver.
window.Cadastros = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dBr = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
  const api = async (url, corpo, metodo) => {
    const m = metodo || (corpo ? 'POST' : 'GET');
    const r = await fetch(url, { method: m, body: ['POST', 'PUT'].includes(m) ? JSON.stringify(corpo || {}) : undefined, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + Mukifo.token() } });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status); return j;
  };
  const aviso = (el, t, ruim) => { el.innerHTML = t ? `<p class="${ruim ? 'neg' : 'pos'}">${esc(t)}</p>` : ''; };
  const dlgCss = 'max-width:94vw;width:480px;background:var(--card);color:var(--txt);border:1px solid var(--line);border-radius:14px;padding:18px';

  // ---- o que cada login enxerga ----
  const ABA_MODULO = { estoque: 'estoque', lista: 'recomendado', produtos: 'produtos', combos: 'combos', desempenho: 'desempenho', alertas: 'niveis', fotos: 'fotos', registrar: 'registrar', financeiro: 'financeiro', planilhas: 'excel', clientes: 'clientes', fornecedores: 'fornecedores' };
  function aplicarModulos(mods) {
    const ok = (id) => mods.includes(id);
    document.querySelectorAll('nav button[data-aba]').forEach((b) => { const m = ABA_MODULO[b.dataset.aba]; if (m) b.hidden = !(ok(m) || (m === 'financeiro' && ok('caixa'))); });
    document.querySelectorAll('nav a[data-modulo]').forEach((a) => { a.hidden = !ok(a.dataset.modulo); });
    const vis = [...document.querySelectorAll('nav button[data-aba]')].filter((b) => !b.hidden);
    const atual = document.querySelector('nav button[aria-pressed=true]');
    if (atual?.hidden && vis[0]) vis[0].click();
  }
  async function carregarPermissoes() {
    const cfg = await api('/api/modulos'), us = (await api('/api/usuarios')).filter((u) => u.papel === 'gerente');
    const box = $('#permissoes');
    box.innerHTML = us.length ? us.map((u) => `<div class="card" data-u="${u.id}" style="border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:12px"><b>${esc(u.nome)}</b> <span class="mut">${u.personalizado ? '(personalizado)' : '(padrão de gerente)'}</span>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:4px;margin:8px 0">${cfg.modulos.map((m) => `<label class="chk"><input type="checkbox" value="${m.id}" ${u.modulos.includes(m.id) ? 'checked' : ''}> ${esc(m.nome)}</label>`).join('')}</div>
      <div class="bar"><button class="btn prim" data-salvar>Salvar</button><button class="btn" data-padrao>Voltar ao padrão</button></div></div>`).join('') : '<p class="mut">Adicione um gerente acima para escolher o que ele enxerga.</p>';
    box.onclick = async (e) => {
      const card = e.target.closest('[data-u]'); if (!card) return; const id = card.dataset.u;
      try {
        if (e.target.closest('[data-salvar]')) await api(`/api/usuarios/${id}/modulos`, { modulos: [...card.querySelectorAll('input:checked')].map((i) => i.value) }, 'PUT');
        else if (e.target.closest('[data-padrao]')) await api(`/api/usuarios/${id}/modulos`, { padrao: true }, 'PUT'); else return;
        carregarPermissoes();
      } catch (er) { alert(er.message); }
    };
  }

  // ---- clientes ----
  async function clientes() {
    const raiz = $('#clientes');
    raiz.innerHTML = `<div class="bar"><input id="clBusca" placeholder="Buscar por nome, celular ou e-mail" style="flex:1;min-width:180px"><button class="btn" id="clNiveis">Ver níveis</button></div><div id="clMsg"></div><div id="clResumo" class="mut"></div>
      <table><thead><tr><th>Cliente</th><th>Nível</th><th>Pontos</th><th class="larga">Pedidos</th><th class="larga">Última visita</th></tr></thead><tbody id="clTb"></tbody></table>
      <dialog id="dlgCliente" style="${dlgCss}"></dialog><dialog id="dlgNiveis" style="${dlgCss}"></dialog>`;
    let t; $('#clBusca').oninput = () => { clearTimeout(t); t = setTimeout(listar, 250); };
    $('#clNiveis').onclick = async () => { const n = await api('/api/conta/niveis'); const d = $('#dlgNiveis'); d.innerHTML = `<h3>Níveis dos clientes</h3>${n.niveis.map((x) => `<p><span style="font-size:26px">${x.emoji}</span> <b>${esc(x.nome)}</b> · ${x.min} pts<br><span class="mut">${esc(x.frase)}</span></p>`).join('')}<p class="mut">${esc(n.regra)}</p><button class="btn" id="nvOk">Fechar</button>`; d.showModal(); $('#nvOk').onclick = () => d.close(); };
    async function listar() {
      const j = await api('/api/clientes?q=' + encodeURIComponent($('#clBusca').value));
      $('#clResumo').textContent = `${j.total} cliente(s)` + (Object.keys(j.por_nivel).length ? ' · ' + Object.entries(j.por_nivel).map(([n, q]) => `${n}: ${q}`).join(' · ') : '');
      $('#clTb').innerHTML = j.clientes.map((c) => `<tr data-id="${c.id}" style="cursor:pointer${c.ativo ? '' : ';opacity:.5'}"><td>${esc(c.nome)}<div class="mut">${esc(c.celular || '')} ${esc(c.email || '')}</div></td><td>${c.emoji} ${esc(c.nivel)}</td><td>${c.pontos}</td><td class="larga">${c.pedidos}</td><td class="larga">${dBr(c.ultima_visita)}</td></tr>`).join('') || '<tr><td colspan="5" class="mut">Nenhum cliente ainda. Eles se cadastram em /cliente.html.</td></tr>';
    }
    $('#clTb').onclick = async (e) => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return; const j = await api('/api/clientes/' + tr.dataset.id), c = j.cliente, d = $('#dlgCliente');
      d.innerHTML = `<h3>${c.nivel.emoji} ${esc(c.nome)}</h3><p>${esc(c.nivel.nome)} · <b>${c.pontos}</b> pontos (já ganhou ${c.pontos_total})</p><p class="mut">${esc(c.celular || '')} ${esc(c.email || '')}<br>Aceitou os termos em ${dBr(j.aceite_em)}</p>
        <b>Últimos pedidos</b><div class="mut">${j.pedidos.map((p) => `${esc(p.numero)} · ${dBr(p.dia)} · ${brl(p.total)} · ${esc(p.status)}`).join('<br>') || 'Nenhum.'}</div>
        <h4>Ajustar pontos (superadmin)</h4><div class="bar"><input id="ajPts" inputmode="numeric" placeholder="+50 ou -20" style="width:110px"><input id="ajMot" placeholder="Motivo" style="flex:1"><button class="btn" id="ajOk">Ajustar</button></div>
        <label class="chk"><input type="checkbox" id="clAtivo" ${j.ativo ? 'checked' : ''}> Conta ativa</label><p class="neg" id="clErr"></p>
        <div class="bar"><button class="btn" id="clFecha" style="flex:1">Fechar</button><button class="btn prim" id="clSalva" style="flex:1">Salvar</button></div>`;
      d.showModal(); $('#clFecha').onclick = () => d.close();
      $('#ajOk').onclick = async () => { try { await api(`/api/clientes/${c.id}/pontos`, { pontos: Number($('#ajPts').value), motivo: $('#ajMot').value }); d.close(); listar(); } catch (er) { $('#clErr').textContent = er.message; } };
      $('#clSalva').onclick = async () => { try { await api('/api/clientes/' + c.id, { nome: c.nome, ativo: $('#clAtivo').checked }, 'PUT'); d.close(); listar(); } catch (er) { $('#clErr').textContent = er.message; } };
    };
    listar().catch((e) => aviso($('#clMsg'), e.message, true));
  }

  // ---- fornecedores ----
  async function fornecedores() {
    const raiz = $('#fornecedores');
    raiz.innerHTML = `<div class="bar"><button class="btn prim" id="foNovo">＋ Novo fornecedor</button></div><div id="foExcel"></div><div id="foMsg"></div>
      <table><thead><tr><th>Fornecedor</th><th class="larga">Como pedir</th><th class="larga">Prazo</th><th>Itens</th><th class="larga">Última compra</th></tr></thead><tbody id="foTb"></tbody></table>
      <dialog id="dlgForn" style="${dlgCss}"></dialog>`;
    if (window.Planilhas) Planilhas.botoes($('#foExcel'), ['fornecedores'], fornecedores);
    let lista = [];
    const f = (id, rot, v = '', extra = '') => `<label>${rot}<input id="${id}" value="${esc(v)}" ${extra}></label>`;
    function abrir(x) {
      const d = $('#dlgForn'), novo = !x; x = x || {};
      d.innerHTML = `<h3>${novo ? 'Novo fornecedor' : esc(x.nome)}</h3>${f('foNome', 'Nome', x.nome)}${f('foComo', 'Como recebe o pedido (WhatsApp, presencial…)', x.como_recebe)}${f('foContato', 'Contato (telefone, nome do vendedor)', x.contato)}
        ${f('foCnpj', 'CNPJ', x.cnpj)}${f('foEnd', 'Endereço', x.endereco)}${f('foPrazo', 'Prazo para pagar (dias, 0 = à vista)', x.prazo_dias ?? '', 'inputmode="numeric"')}${f('foMin', 'Pedido mínimo (R$)', x.pedido_minimo ?? '', 'inputmode="decimal"')}${f('foObs', 'Observação', x.observacao)}
        <label class="chk"><input type="checkbox" id="foAtivo" ${x.ativo === 0 ? '' : 'checked'}> Fornecedor ativo</label><p class="neg" id="foErr"></p>
        <div class="bar"><button class="btn" id="foFecha" style="flex:1">Cancelar</button>${novo ? '' : '<button class="btn" id="foApaga">🗑</button>'}<button class="btn prim" id="foSalva" style="flex:1">Salvar</button></div>`;
      d.showModal(); $('#foFecha').onclick = () => d.close();
      $('#foSalva').onclick = async () => { const corpo = { nome: $('#foNome').value, como_recebe: $('#foComo').value, contato: $('#foContato').value, cnpj: $('#foCnpj').value, endereco: $('#foEnd').value, prazo_dias: $('#foPrazo').value, pedido_minimo: String($('#foMin').value).replace(',', '.'), observacao: $('#foObs').value, ativo: $('#foAtivo').checked };
        try { await api(novo ? '/api/fornecedores' : '/api/fornecedores/' + x.id, corpo, novo ? 'POST' : 'PUT'); d.close(); listar(); } catch (e) { $('#foErr').textContent = e.message; } };
      const ap = $('#foApaga'); if (ap) ap.onclick = async () => { if (!confirm('Apagar esse fornecedor?')) return; try { await api('/api/fornecedores/' + x.id, null, 'DELETE'); d.close(); listar(); } catch (e) { $('#foErr').textContent = e.message; } };
    }
    async function listar() { lista = (await api('/api/fornecedores')).fornecedores;
      $('#foTb').innerHTML = lista.map((x) => `<tr data-id="${x.id}" style="cursor:pointer${x.ativo ? '' : ';opacity:.5'}"><td>${esc(x.nome)}<div class="mut">${esc(x.contato || '')}</div></td><td class="larga">${esc(x.como_recebe || '—')}</td><td class="larga">${x.prazo_dias == null ? '—' : x.prazo_dias === 0 ? 'à vista' : x.prazo_dias + ' dias'}</td><td>${x.itens}</td><td class="larga">${dBr(x.ultima_compra)}</td></tr>`).join(''); }
    $('#foTb').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) abrir(lista.find((x) => String(x.id) === tr.dataset.id)); };
    $('#foNovo').onclick = () => abrir(null);
    listar().catch((e) => aviso($('#foMsg'), e.message, true));
  }
  return { aplicarModulos, carregarPermissoes, clientes, fornecedores };
})();
