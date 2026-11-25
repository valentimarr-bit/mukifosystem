// Chave do campeonato de sinuca (mata-mata) desenhada como árvore: colunas por fase, linhas ligando os jogos,
// caminho do vencedor destacado, campeão no fim, abas por fase, zoom e atualização sem pular nem piscar.
// Usada pelo jogador (/campeonato.html) e pela equipe (/torneio.html).
(function () {
  const W = 188, G = 46, H = 66, U = 86, TOPO = 8;          // largura do jogo, espaço entre colunas, altura do jogo, altura da vaga, margem
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const norm = (s) => String(s ?? '').trim().toLowerCase();
  const ZKEY = 'mukifo_chave_zoom';

  const css = `
.bk{margin:0 -4px}.bk-bar{display:flex;gap:6px;align-items:center;margin-bottom:8px}
.bk-tabs{display:flex;gap:6px;overflow-x:auto;flex:1;scrollbar-width:none;-webkit-overflow-scrolling:touch}.bk-tabs::-webkit-scrollbar{display:none}
.bk-tab{flex:0 0 auto;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--input);color:var(--txt);font:inherit;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap}
.bk-tab[aria-current=true]{background:var(--acc);color:var(--on-acc);border-color:var(--acc)}
.bk-z{flex:0 0 auto;width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:var(--input);color:var(--txt);font-size:20px;font-weight:800;cursor:pointer}
.bk-scroll{overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;border-radius:14px;background:var(--bg);border:1px solid var(--line);max-height:72vh;scroll-behavior:smooth;scroll-padding-left:10px}
.bk-cv{position:relative;margin:10px}.bk-cv svg{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
.bk-cab{position:sticky;top:0;height:26px;z-index:3;background:var(--bg);margin:-10px 0 0}.bk-h{position:absolute;top:8px;font-size:12px;font-weight:800;letter-spacing:.08em;color:var(--mut);text-transform:uppercase;text-align:center}
.bk-m{position:absolute;width:${W}px;height:${H}px;border-radius:12px;background:var(--card);border:1.5px solid var(--line);box-shadow:0 2px 6px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:visible;transition:border-color .2s,box-shadow .2s}
.bk-m.click{cursor:pointer}.bk-m.click:hover{border-color:var(--acc)}
.bk-m.pronta{border-color:color-mix(in srgb,var(--acc) 70%,var(--line))}
.bk-m.vivo{border-color:var(--bad,#e5484d);box-shadow:0 0 0 3px color-mix(in srgb,var(--bad,#e5484d) 30%,transparent)}
.bk-m.meu{box-shadow:0 0 0 3px var(--acc)}
.bk-l{flex:1;display:flex;align-items:center;gap:8px;padding:0 10px;min-width:0;font-size:15px}.bk-l+.bk-l{border-top:1px solid var(--line)}
.bk-l .n{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bk-l .s{min-width:26px;height:24px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-variant-numeric:tabular-nums;background:var(--input);font-size:14px}
.bk-l.v .n{font-weight:800}.bk-l.v .s{background:var(--ok);color:var(--on-ok,#000)}.bk-l.p{opacity:.45}.bk-l.vz .n{color:var(--mut);font-style:italic}
.bk-l.eu .n{color:var(--acc);font-weight:800}.bk-l.rep .n{color:var(--acc);font-style:normal;font-weight:600}
.nv{flex:0 0 auto;width:9px;height:9px;border-radius:50%;box-shadow:0 0 0 2px rgba(0,0,0,.25)}
.bk-tag{position:absolute;top:-11px;right:8px;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--input);border:1px solid var(--line);color:var(--mut);white-space:nowrap}
.bk-m.vivo .bk-tag{background:var(--bad,#e5484d);border-color:var(--bad,#e5484d);color:#fff}
.bk-m.vivo .bk-tag::before{content:'';display:inline-block;width:7px;height:7px;border-radius:50%;background:#fff;margin-right:5px;vertical-align:1px;animation:bkp 1.2s infinite}
@keyframes bkp{50%{opacity:.2}}
.bk-c{position:absolute;width:150px;border-radius:16px;padding:12px;text-align:center;background:linear-gradient(160deg,color-mix(in srgb,var(--acc) 30%,var(--card)),var(--card));border:1.5px solid var(--acc)}
.bk-c .t{font-size:34px;line-height:1}.bk-c b{display:block;margin-top:4px;font-size:16px;overflow-wrap:anywhere}.bk-c span{font-size:12px;color:var(--mut)}
.bk-g{margin:14px 0 6px;font-size:15px}.bk-dica{font-size:13px;color:var(--mut);margin-top:6px;text-align:center}
@media (prefers-reduced-motion:reduce){.bk-scroll{scroll-behavior:auto}.bk-m.vivo .bk-tag::before{animation:none}}`;

  function estilo() { if (document.getElementById('bk-css')) return; const s = document.createElement('style'); s.id = 'bk-css'; s.textContent = css; document.head.appendChild(s); }

  function rotulo(f, R, prelim) {
    if (f === R) return 'Final'; if (f === R - 1) return 'Semifinal'; if (f === R - 2) return 'Quartas'; if (f === R - 3) return 'Oitavas';
    return f === 1 && prelim ? 'Preliminar' : `Rodada ${f}`;
  }
  const folga = (p) => p.fase === 1 && p.chave === 'W' && ((!p.a && !p.vaga_a) || (!p.b && !p.vaga_b));

  /** HTML da chave. opts: { editavel: true → jogos clicáveis (data-bk-p); foco: nome a destacar } */
  function html(d, opts = {}) {
    estilo();
    const ps = (d.partidas || []).filter((p) => p.chave !== 'R');
    if (!ps.length) return '';
    const R = d.rodadas || Math.max(...ps.map((p) => p.fase));
    const W1 = ps.filter((p) => p.fase === 1 && p.chave === 'W'), reais1 = W1.filter((p) => !folga(p)).length;
    const prelim = R >= 2 && reais1 < W1.length;
    const foco = norm(opts.foco);
    const xCol = (i) => i * (W + G);
    const final = ps.find((p) => p.chave === 'W' && p.fase === R), terc = ps.find((p) => p.chave === 'T');
    // posição compacta: folgas somem e cada jogo fica no meio dos jogos que o alimentam (sem buracos na 1ª coluna)
    const porFP = new Map(ps.filter((p) => p.chave === 'W').map((p) => [`${p.fase}.${p.pos}`, p]));
    const ys = new Map(); let cursor = TOPO + 30 + H / 2;
    const colocar = (f, i) => {
      const m = porFP.get(`${f}.${i}`); if (!m) return null;
      if (f === 1 && folga(m)) return null;
      let y = null;
      if (f > 1) { const filhos = [colocar(f - 1, 2 * i), colocar(f - 1, 2 * i + 1)].filter((v) => v !== null); if (filhos.length) y = filhos.reduce((a, b) => a + b, 0) / filhos.length; }
      if (y === null) { y = cursor; cursor += U; }
      ys.set(m.id, y); return y;
    };
    colocar(R, 0);
    const yFinal = final ? ys.get(final.id) : cursor;
    const yT = Math.max(cursor - U + H / 2 + 60, yFinal + H + 40) + H / 2;
    const altura = Math.max(cursor - U / 2 + 16, terc ? yT + H / 2 + 16 : 0, yFinal + 70);
    const largura = xCol(R) + 160;
    const pos = new Map(); for (const p of ps) if (p.chave === 'W' && ys.has(p.id)) pos.set(p.id, { x: xCol(p.fase - 1), y: ys.get(p.id) });
    if (terc) pos.set(terc.id, { x: xCol(R - 1), y: yT });

    let linhas = '', caixas = '', cab = '';
    for (let f = 1; f <= R; f++) cab += `<div class="bk-h" style="left:${xCol(f - 1)}px;width:${W}px">${rotulo(f, R, prelim)}</div>`;
    cab += `<div class="bk-h" style="left:${xCol(R)}px;width:150px">${opts.rotuloFim || 'Campeão'}</div>`;
    cab = `<div class="bk-cab" style="width:${largura}px">${cab}</div>`;

    // linhas: de cada jogo até a vaga (a em cima, b embaixo) do próximo
    for (const p of ps) {
      if (p.chave !== 'W' || p.fase >= R || folga(p)) continue;
      const q = porFP.get(`${p.fase + 1}.${p.pos >> 1}`); if (!q) continue;
      const a = pos.get(p.id), b = pos.get(q.id); if (!a || !b) continue;
      const lado = p.pos % 2 === 0 ? -1 : 1;
      const x1 = a.x + W, y1 = a.y, x2 = b.x, y2 = b.y + lado * H / 4, xm = x1 + G / 2;
      const venceu = p.status === 'finalizada' && p.vencedor_id;
      linhas += `<path d="M${x1} ${y1}H${xm}V${y2}H${x2}" fill="none" stroke="${venceu ? 'var(--acc)' : 'var(--line)'}" stroke-width="${venceu ? 2.5 : 1.5}" stroke-linejoin="round"/>`;
    }
    if (final) {
      const a = pos.get(final.id), fim = final.status === 'finalizada' && final.vencedor_id;
      linhas += `<path d="M${a.x + W} ${a.y}H${xCol(R)}" fill="none" stroke="${fim ? 'var(--acc)' : 'var(--line)'}" stroke-width="${fim ? 2.5 : 1.5}" ${fim ? '' : 'stroke-dasharray="4 4"'}/>`;
    }

    const linha = (x, pl, venc, perd, mostra, vaga) => {
      if (!x && vaga === -1) return '<div class="bk-l vz"><span class="n">W.O. (ninguém da repescagem)</span></div>';
      if (!x && vaga) return `<div class="bk-l vz rep"><span class="n">↩ Vem da repescagem${vaga > 1 || opts.variasVagas ? ' ' + vaga : ''}</span></div>`;
      if (!x) return '<div class="bk-l vz"><span class="n">a definir</span></div>';
      const eu = foco && norm(x.nome) === foco;
      return `<div class="bk-l${venc ? ' v' : ''}${perd ? ' p' : ''}${eu ? ' eu' : ''}" data-bk-nome="${esc(x.nome)}">${x.cor ? `<i class="nv" style="background:${esc(x.cor)}" title="${esc(x.nivel)}"></i>` : ''}<span class="n" title="${esc(x.nome)}${x.nivel ? ' · ' + esc(x.nivel) : ''}">${esc(x.nome)}</span>${mostra ? `<span class="s">${pl ?? 0}</span>` : ''}</div>`;
    };
    let alvo = null;
    for (const p of ps) {
      if (folga(p)) continue;
      const c = pos.get(p.id); if (!c) continue;
      const fim = p.status === 'finalizada', vivo = p.status === 'em_jogo', mostra = (vivo || fim) && p.a && p.b;
      const va = fim && p.vencedor_id && p.vencedor_id === p.a?.id, vb = fim && p.vencedor_id && p.vencedor_id === p.b?.id;
      const meu = foco && [p.a, p.b].some((x) => x && norm(x.nome) === foco);
      const tag = vivo ? `Ao vivo${p.mesa ? ' · mesa ' + esc(p.mesa) : ''}` : p.chave === 'T' ? '3º lugar' : p.status === 'pronta' ? (p.mesa ? `Mesa ${esc(p.mesa)}` : opts.editavel ? 'Pode começar' : '') : p.mesa && !fim ? `Mesa ${esc(p.mesa)}` : '';
      const clic = opts.editavel && p.a && p.b;
      if (!alvo && !fim && p.a && p.b) alvo = p;
      caixas += `<div class="bk-m ${p.status === 'em_jogo' ? 'vivo' : p.status}${meu ? ' meu' : ''}${clic ? ' click' : ''}" style="left:${c.x}px;top:${c.y - H / 2}px"${clic ? ` data-bk-p="${esc(p.id)}" role="button" tabindex="0" aria-label="Abrir jogo"` : ''}>${tag ? `<span class="bk-tag">${tag}</span>` : ''}${linha(p.a, p.placar_a, va, vb, mostra, p.vaga_a)}${linha(p.b, p.placar_b, vb, va, mostra, p.vaga_b)}</div>`;
    }
    const campeao = final && final.status === 'finalizada' ? [final.a, final.b].find((x) => x && x.id === final.vencedor_id) : null;
    const yc = yFinal;
    const fimTxt = opts.rotuloFim || 'Campeão';
    caixas += `<div class="bk-c" style="left:${xCol(R)}px;top:${yc - 46}px"><div class="t">${opts.iconeFim || '🏆'}</div><b>${campeao ? esc(campeao.nome) : '?'}</b><span>${campeao ? fimTxt : 'a definir'}</span></div>`;

    // aba ativa inicial: a fase do primeiro jogo que ainda falta (ou a final)
    const colAlvo = alvo ? alvo.fase - 1 : R;
    let abas = '';
    for (let f = 1; f <= R; f++) abas += `<button class="bk-tab" data-bk-ir="${f - 1}" aria-current="${f - 1 === colAlvo}">${rotulo(f, R, prelim)}</button>`;
    abas += `<button class="bk-tab" data-bk-ir="${R}" aria-current="${R === colAlvo}">${opts.iconeFim || '🏆'}</button>`;
    const z = zoom();
    return `<div class="bk" data-bk-chave="${esc(d.id ?? '')}" data-bk-alvo="${colAlvo}">
      <div class="bk-bar"><div class="bk-tabs">${abas}</div><button class="bk-z" data-bk-z="-1" aria-label="Diminuir">−</button><button class="bk-z" data-bk-z="1" aria-label="Aumentar">+</button></div>
      <div class="bk-scroll"><div class="bk-cv" style="width:${largura}px;height:${altura}px;zoom:${z}">
        ${cab}<svg width="${largura}" height="${altura}" aria-hidden="true">${linhas}</svg>${caixas}</div></div>
      <div class="bk-dica">${opts.editavel ? 'Toque num jogo para lançar o placar.' : 'Arraste para os lados ou toque nas fases. Toque num nome para seguir o jogador.'}</div></div>`;
  }

  let zoomAuto = null;   // sem escolha do usuário: cabe a chave inteira na largura (entre 0,72 e 1)
  function zoom() { try { const z = Number(localStorage.getItem(ZKEY)); if (z >= 0.5 && z <= 1.4) return z; } catch {} return zoomAuto ?? 1; }
  function ajustar(el, bk) {
    try { if (Number(localStorage.getItem(ZKEY))) return; } catch {}
    const sc = bk.querySelector('.bk-scroll'), cv = bk.querySelector('.bk-cv'); if (!sc || !cv) return;
    const z = Math.round(Math.min(1, Math.max(0.72, (sc.clientWidth - 24) / parseFloat(cv.style.width))) * 100) / 100;
    if (z !== zoomAuto) { zoomAuto = z; cv.style.zoom = z; el._bkUltimo = null; }
  }

  /** Troca o conteúdo sem piscar: só mexe se mudou e mantém a rolagem da chave e da página. */
  function trocar(el, conteudo) {
    if (el._bkUltimo === conteudo) return false;
    const py = scrollY, antes = new Map();
    el.querySelectorAll('[data-bk-chave]').forEach((bk) => { const sc = bk.querySelector('.bk-scroll'); if (sc) antes.set(bk.dataset.bkChave, [sc.scrollLeft, sc.scrollTop]); });
    el.innerHTML = conteudo; el._bkUltimo = conteudo;
    el.querySelectorAll('[data-bk-chave]').forEach((bk) => {
      const novo = bk.querySelector('.bk-scroll'); if (!novo) return;
      novo.style.scrollBehavior = 'auto'; ajustar(el, bk);
      const a = antes.get(bk.dataset.bkChave);
      if (a) { novo.scrollLeft = a[0]; novo.scrollTop = a[1]; } else irPara(bk, Number(bk.dataset.bkAlvo), false);
      novo.style.scrollBehavior = '';
      marcarAba(bk);
    });
    if (Math.abs(scrollY - py) > 1) scrollTo(0, py);
    return true;
  }

  function irPara(bk, col, suave = true) {
    const sc = bk.querySelector('.bk-scroll'), z = Number(bk.querySelector('.bk-cv').style.zoom) || 1;
    if (!sc) return;
    const x = Math.max(0, col * (W + G) * z);
    // centraliza na vertical o primeiro jogo dessa coluna que ainda falta
    const jogos = [...bk.querySelectorAll('.bk-m')].filter((m) => Math.abs(parseFloat(m.style.left) - col * (W + G)) < 2);
    const alvo = jogos.find((m) => !m.classList.contains('finalizada')) || jogos[0];
    const y = alvo ? Math.max(0, (parseFloat(alvo.style.top) - 40) * z - sc.clientHeight / 4) : sc.scrollTop;
    sc.scrollTo({ left: x, top: y, behavior: suave ? 'smooth' : 'auto' });
  }

  function marcarAba(bk) {
    const sc = bk.querySelector('.bk-scroll'), z = Number(bk.querySelector('.bk-cv')?.style.zoom) || 1; if (!sc) return;
    const tabs = bk.querySelectorAll('.bk-tab'), fim = sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 4 && sc.scrollLeft > 0;
    const col = fim ? tabs.length - 1 : Math.round(sc.scrollLeft / ((W + G) * z));
    bk.querySelectorAll('.bk-tab').forEach((t) => t.setAttribute('aria-current', String(Number(t.dataset.bkIr) === col)));
    bk.querySelector('.bk-tab[aria-current=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // eventos (uma vez para a página toda)
  document.addEventListener('click', (e) => {
    const ir = e.target.closest('[data-bk-ir]'); if (ir) { const bk = ir.closest('.bk'); irPara(bk, Number(ir.dataset.bkIr)); return; }
    const zb = e.target.closest('[data-bk-z]');
    if (zb) {
      const bk = zb.closest('.bk'), cv = bk.querySelector('.bk-cv'), sc = bk.querySelector('.bk-scroll'), z0 = Number(cv.style.zoom) || 1;
      const z = Math.min(1.4, Math.max(0.5, Math.round((z0 + 0.15 * Number(zb.dataset.bkZ)) * 100) / 100));
      const fx = sc.scrollLeft / z0, fy = sc.scrollTop / z0; cv.style.zoom = z; sc.scrollLeft = fx * z; sc.scrollTop = fy * z;
      try { localStorage.setItem(ZKEY, String(z)); } catch {}
    }
  });
  let tAba;
  document.addEventListener('scroll', (e) => { if (e.target.classList?.contains('bk-scroll')) { clearTimeout(tAba); tAba = setTimeout(() => marcarAba(e.target.closest('.bk')), 80); } }, true);

  /** Chaves da repescagem (uma por grupo): o campeão de cada uma volta para a chave principal. */
  function htmlRepescagem(d, opts = {}) {
    const rs = (d.partidas || []).filter((p) => p.chave === 'R'); if (!rs.length) return '';
    const grupos = [...new Set(rs.map((p) => p.grupo))].sort((a, b) => a - b);
    return grupos.map((g) => {
      const ps = rs.filter((p) => p.grupo === g).map((p) => ({ ...p, chave: 'W' }));
      return `${grupos.length > 1 ? `<h4 class="bk-g">Grupo ${g}</h4>` : ''}${html({ partidas: ps, rodadas: Math.max(...ps.map((p) => p.fase)), id: `${d.id}:R${g}` }, { ...opts, rotuloFim: 'Volta à chave', iconeFim: '↩' })}`;
    }).join('');
  }

  window.MukifoChave = { html, htmlRepescagem, trocar, irPara };
})();
