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
    sel.addEventListener('change', () => aplicar(sel.value, true));
  }

  window.Tema = { aplicar, ligarSeletor, atual: ler, lista: () => Object.entries(TEMAS).map(([id, t]) => ({ id, nome: t.nome })) };
  aplicar(ler(), false);
  document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('select#tema').forEach(ligarSeletor));
})();
