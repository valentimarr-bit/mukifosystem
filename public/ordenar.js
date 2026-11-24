// Toda tabela com título clicável: toque no título para ordenar (de novo inverte). Vale também para tabelas que o app redesenha.
// Fica de fora: título com data-ordem (o estoque tem a própria ordenação) e tabela com data-sem-ordem.
(() => {
  const css = document.createElement('style');
  css.textContent = 'table:not([data-sem-ordem]) thead th:not([data-ordem]){cursor:pointer;user-select:none}th[data-sort=asc]::after{content:" ▲";font-size:.7em}th[data-sort=desc]::after{content:" ▼";font-size:.7em}';
  document.head.appendChild(css);
  const estado = new WeakMap();   // tabela → { col, dir }
  const chave = (txt) => {
    const t = String(txt).trim().replace(/\s+/g, ' ');
    const d = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:,?\s+(\d{1,2}):(\d{2}))?/);
    if (d && /\d\/\d/.test(t) && t.length <= 20) return [1, new Date(Number(d[3] ?? 2000), d[2] - 1, d[1], Number(d[4] ?? 0), Number(d[5] ?? 0)).getTime()];
    const n = t.replace(/R\$|%|×|x\b|\s/g, '');
    if (/^[−-]?\d{1,3}(\.\d{3})*(,\d+)?$|^[−-]?\d+(,\d+)?$|^[−-]?\d+(\.\d+)?$/.test(n)) return [1, parseFloat(n.replace('−', '-').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))];
    return t === '' || t === '—' || t === '-' ? [2, 0] : [0, t.toLowerCase()];   // vazio vai sempre para o fim
  };
  const ordenar = (tab, col, dir) => {
    const corpo = tab.tBodies[0]; if (!corpo) return;
    const todas = [...corpo.rows], cols = tab.tHead?.rows[0]?.cells.length ?? 0;
    const fixas = todas.filter((r) => r.cells.length !== cols || [...r.cells].some((c) => c.colSpan > 1) || /^total/i.test(r.cells[0]?.textContent.trim()));
    const moveis = todas.filter((r) => !fixas.includes(r));
    if (moveis.length < 2) return;
    const k = new Map(moveis.map((r) => [r, chave(r.cells[col]?.dataset.v ?? r.cells[col]?.textContent ?? '')]));
    moveis.sort((a, b) => { const x = k.get(a), y = k.get(b); if (x[0] === 2 || y[0] === 2) return x[0] - y[0]; if (x[0] !== y[0]) return x[0] - y[0]; const c = x[0] === 1 ? x[1] - y[1] : String(x[1]).localeCompare(String(y[1]), 'pt-BR', { numeric: true }); return dir === 'asc' ? c : -c; });
    obs.disconnect(); moveis.forEach((r) => corpo.appendChild(r)); fixas.forEach((r) => corpo.appendChild(r)); observar();
    [...tab.tHead.rows[0].cells].forEach((th, i) => { if (i === col) th.dataset.sort = dir; else delete th.dataset.sort; });
  };
  document.addEventListener('click', (e) => {
    const th = e.target.closest('thead th'); if (!th || th.hasAttribute('data-ordem')) return;
    const tab = th.closest('table'); if (!tab || tab.hasAttribute('data-sem-ordem') || !tab.tBodies[0]) return;
    const col = [...th.parentElement.cells].indexOf(th), ant = estado.get(tab);
    const dir = ant && ant.col === col && ant.dir === 'asc' ? 'desc' : 'asc';
    estado.set(tab, { col, dir }); ordenar(tab, col, dir);
  });
  // tabela redesenhada pelo app (innerHTML): reaplica a ordem escolhida
  const obs = new MutationObserver((muts) => { const vistos = new Set(); for (const m of muts) { const tab = m.target.closest?.('table'); if (tab && !vistos.has(tab) && estado.has(tab)) { vistos.add(tab); const s = estado.get(tab); ordenar(tab, s.col, s.dir); } } });
  const observar = () => obs.observe(document.body, { childList: true, subtree: true });
  observar();
})();
