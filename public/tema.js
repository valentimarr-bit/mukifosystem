// Temas visuais do Mukifo (gestão, compras e página inicial). A escolha fica salva neste aparelho.
// Carregue no <head>, antes do CSS da página, para a cor certa já aparecer na primeira pintura.
(() => {
  const CHAVE = 'mukifo_tema';
  const BASE = { '--ok': '#7ddc8a', '--warn': '#ffd166', '--bad': '#ff8a80', '--on-acc': '#111', '--on-ok': '#111',
    '--aviso-bg': '#3a2a00', '--aviso-txt': '#ffd166', '--ok-bd': '#2e5a35', '--bad-bd': '#5a2e2e', '--scheme': 'dark' };
  const T = (nome, v) => ({ nome, v: { ...BASE, ...v } });
  const TEMAS = {
    escuro: T('Escuro', { '--bg': '#111111', '--hdr': '#000000', '--card': '#1b1b1b', '--input': '#111111', '--line': '#2c2c2c', '--txt': '#f2f2f2', '--mut': '#a8a8a8', '--acc': '#ffb347' }),
    claro: T('Claro', { '--bg': '#f6f4ef', '--hdr': '#ffffff', '--card': '#ffffff', '--input': '#ffffff', '--line': '#ddd8cc', '--txt': '#1d1b16', '--mut': '#6b665a', '--acc': '#e08a00',
      '--ok': '#1e8e3e', '--warn': '#b26a00', '--bad': '#c5221f', '--on-acc': '#ffffff', '--on-ok': '#ffffff', '--aviso-bg': '#fff3cd', '--aviso-txt': '#7a5200', '--ok-bd': '#a8d5b2', '--bad-bd': '#f0b4b2', '--scheme': 'light' }),
    vinho: T('Vinho', { '--bg': '#1a0f14', '--hdr': '#0f080b', '--card': '#27161d', '--input': '#1a0f14', '--line': '#3c2530', '--txt': '#f5ebee', '--mut': '#b99aa5', '--acc': '#e8a33d' }),
    chimarrao: T('Chimarrão', { '--bg': '#0f1a12', '--hdr': '#08100a', '--card': '#16261b', '--input': '#0f1a12', '--line': '#26402d', '--txt': '#eef7ef', '--mut': '#9ab8a0', '--acc': '#8bd450' }),
    oceano: T('Oceano', { '--bg': '#0b1620', '--hdr': '#060e15', '--card': '#122332', '--input': '#0b1620', '--line': '#1f3a50', '--txt': '#eaf4fb', '--mut': '#93b3c8', '--acc': '#4cc3ff' }),
    grafite: T('Grafite', { '--bg': '#1e1f22', '--hdr': '#141517', '--card': '#2a2c30', '--input': '#1e1f22', '--line': '#3b3e44', '--txt': '#eceff4', '--mut': '#a3a9b5', '--acc': '#ff6b6b' }),
    areia: T('Areia', { '--bg': '#efe6d6', '--hdr': '#fbf7ee', '--card': '#fbf7ee', '--input': '#ffffff', '--line': '#d8cbb3', '--txt': '#2a2218', '--mut': '#76695a', '--acc': '#b5532a',
      '--ok': '#2e7d32', '--warn': '#9a6400', '--bad': '#b3261e', '--on-acc': '#ffffff', '--on-ok': '#ffffff', '--aviso-bg': '#fff0c2', '--aviso-txt': '#6b4a00', '--ok-bd': '#a8d5b2', '--bad-bd': '#f0b4b2', '--scheme': 'light' }),
    contraste: T('Alto contraste', { '--bg': '#000000', '--hdr': '#000000', '--card': '#0d0d0d', '--input': '#000000', '--line': '#777777', '--txt': '#ffffff', '--mut': '#d0d0d0', '--acc': '#ffe600',
      '--ok': '#3dff6b', '--warn': '#ffe600', '--bad': '#ff6b6b' }),
  };
  const PADRAO = 'escuro';
  const ler = () => { try { const t = localStorage.getItem(CHAVE); return TEMAS[t] ? t : PADRAO; } catch { return PADRAO; } };

  function aplicar(id, guardar) {
    if (!TEMAS[id]) id = PADRAO;
    const r = document.documentElement;
    for (const [k, v] of Object.entries(TEMAS[id].v)) r.style.setProperty(k, v);
    r.style.colorScheme = TEMAS[id].v['--scheme'];
    r.dataset.tema = id;
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = TEMAS[id].v['--hdr'];
    if (guardar) { try { localStorage.setItem(CHAVE, id); } catch {} }
    document.querySelectorAll('select[data-seletor-tema]').forEach((s) => { s.value = id; });
  }

  /** Preenche um <select data-seletor-tema> com os temas e liga a troca. */
  function ligarSeletor(sel) {
    sel.dataset.seletorTema = '';
    sel.innerHTML = Object.entries(TEMAS).map(([id, t]) => `<option value="${id}">${t.nome}</option>`).join('');
    sel.value = ler();
    sel.addEventListener('change', () => salvarPessoal({ tema: sel.value }));
  }


  // ---------- personalização: cor de destaque, cantos, tamanhos, fonte e marca ----------
  const VK = 'mukifo_visual', CK = 'mukifo_visual_casa';
  const OPC = { raio: [['0', 'Retos'], ['8', 'Suaves'], ['14', 'Redondos'], ['24', 'Bem redondos']], texto: [['0.9', 'Pequeno'], ['1', 'Normal'], ['1.15', 'Grande'], ['1.3', 'Gigante']],
    botoes: [['normal', 'Normais'], ['grande', 'Grandes'], ['extra', 'Enormes']], fonte: [['sistema', 'Padrão'], ['redonda', 'Redonda'], ['serifa', 'Clássica'], ['mono', 'Máquina']] };
  const FONTES = { sistema: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', redonda: 'ui-rounded,"SF Pro Rounded","Nunito","Varela Round",system-ui,sans-serif', serifa: 'Georgia,"Times New Roman",serif', mono: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' };
  const ACENTOS = ['#ffb347', '#ff6b6b', '#e8508a', '#b57bff', '#4cc3ff', '#2ec4b6', '#8bd450', '#ffe600'];
  const VPAD = { tema: null, acento: null, raio: null, texto: '1', botoes: 'normal', fonte: 'sistema', marca: { nome: '', emoji: '' } };
  const lerJ = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const valido = (v) => { const o = { ...VPAD, ...(v || {}) };
    if (!TEMAS[o.tema]) o.tema = null; if (!/^#[0-9a-f]{6}$/i.test(o.acento || '')) o.acento = null;
    for (const k of ['raio', 'texto', 'botoes', 'fonte']) if (o[k] != null && !OPC[k].some(([x]) => x === String(o[k]))) o[k] = VPAD[k]; o.marca = { nome: String(o.marca?.nome ?? '').slice(0, 30), emoji: String(o.marca?.emoji ?? '').slice(0, 4) }; return o; };
  let casa = valido(lerJ(CK)), pessoal = lerJ(VK) ? valido(lerJ(VK)) : null;
  const efetivo = () => { const p = pessoal || {}, c = casa; const pick = (k) => (p[k] != null && p[k] !== VPAD[k] ? p[k] : c[k] ?? VPAD[k]); return { tema: p.tema || c.tema || ler(), acento: p.acento || c.acento, raio: pick('raio'), texto: pick('texto'), botoes: pick('botoes'), fonte: pick('fonte'), marca: c.marca }; };
  const css = document.createElement('style'); css.id = 'mk-visual';
  css.textContent = `html[data-raio] :is(button,.btn,.grande,input,select,textarea,dialog,.card,.painel,.ret,.cob,.p,.prod,.setor,.ped,.volta,.chips button,.formas button){border-radius:calc(var(--raio) * 1px)!important}
    html[data-raio] :is(.p,.setor,.ped,.painel,dialog) img{border-radius:calc(var(--raio) * 1px)}
    html[data-botoes=grande] :is(button,.btn,.grande,select,input:not([type=checkbox]):not([type=radio]),.volta){min-height:58px!important}
    html[data-botoes=extra] :is(button,.btn,.grande,select,input:not([type=checkbox]):not([type=radio]),.volta){min-height:72px!important;font-size:1.1em!important}
    html[data-fonte] body{font-family:var(--fonte)!important}html[data-fonte] :is(button,input,select,textarea){font-family:inherit!important}
    html[data-texto] body{zoom:var(--zoom)}`;
  document.head.appendChild(css);
  function aplicarVisual() {
    const e = efetivo(), r = document.documentElement; aplicar(e.tema, false);
    if (e.acento) { r.style.setProperty('--acc', e.acento); r.style.setProperty('--on-acc', lum(e.acento) > .35 ? '#111111' : '#ffffff'); }
    const set = (attr, val, prop, v) => { if (val == null || val === VPAD[attr]) { r.removeAttribute('data-' + attr); if (prop) r.style.removeProperty(prop); } else { r.setAttribute('data-' + attr, val); if (prop) r.style.setProperty(prop, v); } };
    set('raio', e.raio, '--raio', e.raio); set('botoes', e.botoes); set('texto', e.texto === '1' ? null : e.texto, '--zoom', e.texto); set('fonte', e.fonte === 'sistema' ? null : e.fonte, '--fonte', FONTES[e.fonte]);
    document.querySelectorAll('[data-marca-nome]').forEach((x) => { if (e.marca.nome) x.textContent = e.marca.nome; });
    document.querySelectorAll('[data-marca-emoji]').forEach((x) => { if (e.marca.emoji) x.textContent = e.marca.emoji; });
  }
  const salvarPessoal = (v) => { pessoal = valido({ ...(pessoal || {}), ...v }); try { localStorage.setItem(VK, JSON.stringify(pessoal)); if (v.tema) localStorage.setItem(CHAVE, v.tema); } catch {} aplicarVisual(); };
  function faixaTeste() {
    if (document.getElementById('faixaTeste')) return;
    const f = document.createElement('div'); f.id = 'faixaTeste';
    f.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#f59e0b;color:#111;font:700 12px system-ui;text-align:center;padding:4px;pointer-events:none';
    f.textContent = '🧪 MODO TESTE — pagamentos simulados, sem trava de estoque';
    document.body.appendChild(f);
  }
  fetch('/api/visual').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.teste) faixaTeste(); if (j?.visual) { casa = valido(j.visual); try { localStorage.setItem(CK, JSON.stringify(casa)); } catch {} aplicarVisual(); } }).catch(() => {});

  function painel() {
    let d = document.getElementById('mkVisual');
    if (!d) { d = document.createElement('dialog'); d.id = 'mkVisual'; document.body.appendChild(d); }
    const e = efetivo(), tok = window.Mukifo?.token?.();
    const grupo = (k, titulo) => `<h4>${titulo}</h4><div class="mkg">${OPC[k].map(([v, n]) => `<button data-k="${k}" data-v="${v}" class="${String(e[k]) === v ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    d.innerHTML = `<style>#mkVisual{border:1px solid var(--line);border-radius:16px;background:var(--card);color:var(--txt);width:min(94vw,480px);max-height:90vh;overflow:auto;padding:16px}#mkVisual::backdrop{background:#000a}#mkVisual h3,#mkVisual h4{margin:12px 0 6px}
      .mkg{display:flex;flex-wrap:wrap;gap:8px}.mkg button{min-height:48px;padding:0 14px;border-radius:12px;border:2px solid var(--line);background:var(--input);color:var(--txt);font:inherit;cursor:pointer}.mkg button.on{border-color:var(--acc);font-weight:700}
      .mkt button{display:flex;align-items:center;gap:8px}.mkt i{width:22px;height:22px;border-radius:50%;border:1px solid #8886;display:inline-block}.mkc button{width:48px;padding:0;border-radius:50%}.mkc input{width:56px;height:48px;border:0;background:none;padding:0}
      #mkVisual .mkf{display:flex;gap:8px;margin-top:14px}#mkVisual .mkf button{flex:1;min-height:52px;border-radius:12px;border:1px solid var(--line);background:var(--input);color:var(--txt);font:inherit;font-weight:700;cursor:pointer}#mkVisual .mkf .p{background:var(--acc);color:var(--on-acc);border-color:var(--acc)}
      #mkVisual input[type=text]{min-height:48px;font-size:16px;padding:6px 10px;border-radius:10px;border:1px solid var(--line);background:var(--input);color:var(--txt)}</style>
      <h3>🎨 Visual</h3><p style="margin:0;color:var(--mut);font-size:14px">Vale só neste aparelho. Tudo muda na hora.</p>
      <h4>Tema</h4><div class="mkg mkt">${Object.entries(TEMAS).map(([id, t]) => `<button data-k="tema" data-v="${id}" class="${e.tema === id ? 'on' : ''}"><i style="background:${t.v['--acc']};box-shadow:inset 0 0 0 6px ${t.v['--bg']}"></i>${t.nome}</button>`).join('')}</div>
      <h4>Cor de destaque</h4><div class="mkg mkc">${ACENTOS.map((c) => `<button data-k="acento" data-v="${c}" style="background:${c}" aria-label="${c}" class="${(e.acento || '').toLowerCase() === c ? 'on' : ''}"></button>`).join('')}<input type="color" id="mkCor" value="${e.acento || TEMAS[e.tema].v['--acc']}" aria-label="Outra cor"><button data-k="acento" data-v="" style="width:auto;padding:0 14px;border-radius:12px">Do tema</button></div>
      ${grupo('raio', 'Cantos')}${grupo('texto', 'Tamanho do texto')}${grupo('botoes', 'Tamanho dos botões')}${grupo('fonte', 'Letra')}
      <div class="mkf"><button id="mkReset">Voltar ao padrão</button><button id="mkFecha" class="p">Pronto</button></div>
      ${tok ? `<h4>Padrão da casa (superadmin)</h4><p style="margin:0 0 6px;color:var(--mut);font-size:14px">Vale para todo mundo que não escolheu o próprio visual, inclusive o app do cliente.</p>
        <div class="mkg"><input type="text" id="mkNome" placeholder="Nome do bar" maxlength="30" value="${(casa.marca.nome || '').replace(/"/g, '')}" style="flex:1;min-width:140px"><input type="text" id="mkEmoji" placeholder="🍸" maxlength="4" value="${casa.marca.emoji || ''}" style="width:72px;text-align:center"></div>
        <div class="mkf"><button id="mkCasa">Usar o que está na tela como padrão da casa</button></div><p id="mkMsg" style="color:var(--mut);font-size:14px"></p>` : ''}`;
    d.onclick = (ev) => { const b = ev.target.closest('button[data-k]'); if (!b) return; const k = b.dataset.k, v = b.dataset.v; salvarPessoal({ [k]: v === '' ? null : v }); if (k === 'acento' && v === '') { pessoal.acento = null; } painel(); };
    d.querySelector('#mkCor').oninput = (ev) => salvarPessoal({ acento: ev.target.value });
    d.querySelector('#mkFecha').onclick = () => d.close();
    d.querySelector('#mkReset').onclick = () => { pessoal = null; try { localStorage.removeItem(VK); localStorage.removeItem(CHAVE); } catch {} aplicarVisual(); painel(); };
    const bc = d.querySelector('#mkCasa'); if (bc) bc.onclick = async () => { const e2 = efetivo(), corpo = { tema: e2.tema, acento: e2.acento, raio: e2.raio, texto: e2.texto, botoes: e2.botoes, fonte: e2.fonte, marca: { nome: d.querySelector('#mkNome').value.trim(), emoji: d.querySelector('#mkEmoji').value.trim() } };
      try { const r = await fetch('/api/visual', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + window.Mukifo.token() }, body: JSON.stringify(corpo) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
        casa = valido(corpo); try { localStorage.setItem(CK, JSON.stringify(casa)); } catch {} d.querySelector('#mkMsg').textContent = 'Salvo como padrão da casa ✓'; aplicarVisual(); } catch (er) { d.querySelector('#mkMsg').textContent = er.message; } };
    if (!d.open) d.showModal();
  }
  function botaoVisual() {
    if (document.getElementById('mkBtnVisual') || document.body.hasAttribute('data-sem-botao-visual')) return;   // na gestão o editor fica na aba Conta
    const b = document.createElement('button'); b.id = 'mkBtnVisual'; b.type = 'button'; b.textContent = '🎨'; b.setAttribute('aria-label', 'Personalizar o visual');
    b.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:30;width:48px;height:48px;border-radius:50%;border:1px solid var(--line);background:var(--card);color:var(--txt);font-size:22px;cursor:pointer;opacity:.85;padding:0;touch-action:manipulation';
    b.onclick = painel; document.body.appendChild(b);
  }
  document.addEventListener('DOMContentLoaded', () => { botaoVisual(); aplicarVisual(); });
  aplicarVisual();

  window.Tema = { aplicar, ligarSeletor, painel, aplicarVisual, atual: ler, lista: () => Object.entries(TEMAS).map(([id, t]) => ({ id, nome: t.nome })) };
  aplicar(ler(), false);
  document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('select#tema').forEach(ligarSeletor));
})();
