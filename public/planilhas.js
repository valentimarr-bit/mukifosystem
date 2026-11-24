// Excel em tudo: baixar modelo, exportar e importar (com prévia antes de gravar).
// Usa a biblioteca SheetJS, carregada só quando alguém clica (não pesa na abertura do app).
window.Planilhas = (() => {
  let lib, catalogo;
  const hdr = () => ({ 'content-type': 'application/json', authorization: 'Bearer ' + Mukifo.token() });
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function chamar(url, corpo) {
    const r = await fetch(url, { method: corpo ? 'POST' : 'GET', body: corpo ? JSON.stringify(corpo) : undefined, headers: hdr() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
    return j;
  }
  function carregarLib() {
    return (lib ??= new Promise((ok, no) => { if (window.XLSX) return ok(window.XLSX); const s = document.createElement('script'); s.src = '/vendor/xlsx.mini.min.js'; s.onload = () => ok(window.XLSX); s.onerror = () => { lib = null; no(new Error('Não consegui carregar o leitor de Excel. Confira a internet.')); }; document.head.appendChild(s); }));
  }
  const lista = async () => (catalogo ??= (await chamar('/api/planilhas')).planilhas);
  const def = async (id) => (await lista()).find((d) => d.id === id);
  function salvar(X, ws, nome) { const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Dados'); X.writeFile(wb, nome); }
  const larguras = (cols) => cols.map((c) => ({ wch: Math.max(14, Math.min(40, c.length + 4)) }));

  async function baixarModelo(id) {
    const [X, d] = await Promise.all([carregarLib(), def(id)]);
    const ws = X.utils.aoa_to_sheet([d.colunas.map((c) => c.titulo), d.colunas.map((c) => c.exemplo)]); ws['!cols'] = larguras(d.colunas.map((c) => c.titulo));
    const ajuda = X.utils.aoa_to_sheet([['Como preencher: ' + d.nome], [d.descricao], [], ['Coluna', 'Exemplo', 'Observação'], ...d.colunas.map((c) => [c.titulo, c.exemplo, c.ajuda])]); ajuda['!cols'] = [{ wch: 36 }, { wch: 24 }, { wch: 60 }];
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Dados'); X.utils.book_append_sheet(wb, ajuda, 'Como preencher');
    X.writeFile(wb, `modelo-${id}.xlsx`);
  }
  async function exportar(id, qs = '') {
    const [X, j] = await Promise.all([carregarLib(), chamar('/api/planilhas/' + id + qs)]);
    const linhas = j.linhas.map((l) => j.chaves.map((k) => l[k] ?? ''));
    const ws = X.utils.aoa_to_sheet([j.colunas, ...linhas]); ws['!cols'] = larguras(j.colunas);
    salvar(X, ws, `mukifo-${id}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  async function lerArquivo(arq) {
    const X = await carregarLib(), wb = X.read(await arq.arrayBuffer(), { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]], cru = X.utils.sheet_to_json(ws, { defval: '', raw: true, blankrows: false });
    return cru.map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v instanceof Date ? new Date(v.getTime() + 12 * 36e5).toISOString().slice(0, 10) : v])));
  }
  function dialogo() {
    let d = document.getElementById('dlgPlanilha');
    if (!d) { d = document.createElement('dialog'); d.id = 'dlgPlanilha'; d.style.cssText = 'max-width:94vw;width:560px;background:var(--card);color:var(--txt);border:1px solid var(--line);border-radius:14px;padding:18px'; document.body.appendChild(d); }
    return d;
  }
  async function importar(id, aoTerminar) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xls,.csv';
    inp.onchange = async () => {
      const arq = inp.files[0]; if (!arq) return; const d = dialogo(), nome = (await def(id)).nome;
      d.innerHTML = `<h3>${esc(nome)}</h3><p>Lendo o arquivo…</p>`; d.showModal();
      let linhas; try { linhas = await lerArquivo(arq); } catch (e) { d.innerHTML = `<h3>${esc(nome)}</h3><p class="neg">Não consegui ler esse arquivo.</p><button class="btn" id="plFecha">Fechar</button>`; d.querySelector('#plFecha').onclick = () => d.close(); return; }
      let sim; try { sim = await chamar('/api/planilhas/' + id + '?simular=1', { linhas }); } catch (e) { d.innerHTML = `<h3>${esc(nome)}</h3><p class="neg">${esc(e.message)}</p><button class="btn" id="plFecha">Fechar</button>`; d.querySelector('#plFecha').onclick = () => d.close(); return; }
      const erros = sim.erros.length ? `<p class="neg"><b>${sim.total_erros} problema(s).</b> Nada foi gravado. Corrija na planilha e importe de novo:</p><ul style="max-height:40vh;overflow:auto;padding-left:20px">${sim.erros.map((e) => `<li>${e.linha ? 'Linha ' + e.linha + ': ' : ''}${esc(e.erro)}</li>`).join('')}</ul>` : '';
      d.innerHTML = `<h3>${esc(nome)}</h3><p>${linhas.length} linha(s) lidas do arquivo.</p>` + (sim.ok ? `<p><b>${sim.criados}</b> novo(s) e <b>${sim.atualizados}</b> atualizado(s).</p>${sim.avisos.map((a) => `<p class="mut">${esc(a)}</p>`).join('')}<p class="mut">Confira e aperte Aplicar para gravar.</p>` : erros)
        + `<div style="display:flex;gap:8px;margin-top:14px"><button class="btn" id="plFecha" style="flex:1">${sim.ok ? 'Cancelar' : 'Fechar'}</button>${sim.ok ? '<button class="btn prim" id="plAplica" style="flex:1">Aplicar</button>' : ''}</div>`;
      d.querySelector('#plFecha').onclick = () => d.close();
      const ap = d.querySelector('#plAplica');
      if (ap) ap.onclick = async () => { ap.disabled = true; ap.textContent = 'Gravando…'; try { const r = await chamar('/api/planilhas/' + id, { linhas }); d.innerHTML = `<h3>Pronto!</h3><p>${r.criados} novo(s), ${r.atualizados} atualizado(s).</p><button class="btn prim" id="plFecha">Fechar</button>`; d.querySelector('#plFecha').onclick = () => d.close(); aoTerminar?.(); } catch (e) { d.innerHTML = `<h3>Erro</h3><p class="neg">${esc(e.message)}</p><button class="btn" id="plFecha">Fechar</button>`; d.querySelector('#plFecha').onclick = () => d.close(); } };
    };
    inp.click();
  }

  /** Coloca os três botões num elemento. ids: lista de planilhas (ex.: ['produtos','fichas']). */
  async function botoes(el, ids, aoTerminar) {
    const todas = await lista().catch(() => []); el.innerHTML = '';
    for (const id of [].concat(ids)) {
      const d = todas.find((x) => x.id === id); if (!d) continue;
      const g = document.createElement('div'); g.className = 'bar'; g.innerHTML = `${ids.length > 1 ? `<b style="flex:1 1 100%">${esc(d.nome)}</b>` : ''}<button class="btn" data-m>Baixar modelo</button><button class="btn" data-e>Exportar Excel</button>${d.importavel ? '<button class="btn prim" data-i>Importar Excel</button>' : ''}`;
      const f = (fn) => async (ev) => { const b = ev.target; b.disabled = true; try { await fn(); } catch (e) { alert(e.message); } b.disabled = false; };
      g.querySelector('[data-m]').onclick = f(() => baixarModelo(id)); g.querySelector('[data-e]').onclick = f(() => exportar(id, id === 'vendas' ? (document.getElementById('plDe')?.value ? `?de=${document.getElementById('plDe').value}&ate=${document.getElementById('plAte').value}` : '') : ''));
      const bi = g.querySelector('[data-i]'); if (bi) bi.onclick = () => importar(id, aoTerminar);
      el.appendChild(g);
    }
  }
  return { botoes, baixarModelo, exportar, importar, lista };
})();
