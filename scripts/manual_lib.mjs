// Gera a página do manual (public/manual.html) a partir de docs/manual.md e docs/alteracoes.md. Sem dependências.
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function inline(t) {
  return esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*\s][^*]*)\*/g, '<i>$1</i>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2">$1</a>');
}

export function mdParaHtml(md) {
  const linhas = md.replace(/\r/g, '').split('\n'), out = [], toc = [];
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) {
      const n = m[1].length, id = slug(m[2]);
      if (n === 2) toc.push({ id, texto: m[2] });
      out.push(`<h${n} id="${id}">${inline(m[2])}</h${n}>`); i++; continue;
    }
    if (/^\|.*\|\s*$/.test(l) && /^\|[\s:|-]+\|\s*$/.test(linhas[i + 1] ?? '')) {
      const cel = (s) => s.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const cab = cel(l); i += 2; const corpo = [];
      while (i < linhas.length && /^\|.*\|\s*$/.test(linhas[i])) corpo.push(cel(linhas[i++]));
      out.push(`<div class="tab"><table><thead><tr>${cab.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${corpo.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue;
    }
    if (/^\s*[-*]\s+/.test(l)) {
      const it = []; while (i < linhas.length && /^\s*[-*]\s+/.test(linhas[i])) it.push(linhas[i++].replace(/^\s*[-*]\s+/, ''));
      out.push(`<ul>${it.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`); continue;
    }
    if (/^\s*\d+\.\s+/.test(l)) {
      const it = []; while (i < linhas.length && /^\s*\d+\.\s+/.test(linhas[i])) it.push(linhas[i++].replace(/^\s*\d+\.\s+/, ''));
      out.push(`<ol>${it.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`); continue;
    }
    const p = []; while (i < linhas.length && linhas[i].trim() && !/^(#{1,4}\s|\s*[-*]\s|\s*\d+\.\s|\|)/.test(linhas[i])) p.push(linhas[i++]);
    out.push(`<p>${inline(p.join(' '))}</p>`);
  }
  return { html: out.join('\n'), toc };
}

export function gerarManualHtml(manualMd, alteracoesMd) {
  const m = mdParaHtml(manualMd), a = mdParaHtml(alteracoesMd.replace(/^# .*\n/, ''));
  const toc = [...m.toc, { id: 'novidades', texto: 'Novidades e alterações' }];
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#000000">
<title>Mukifo · Manual do sistema</title><script src="/tema.js"></script>
<!-- ARQUIVO GERADO por "npm run manual" a partir de docs/manual.md e docs/alteracoes.md. Não edite aqui. -->
<style>
[hidden]{display:none!important}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:18px/1.55 system-ui,sans-serif}
header{background:var(--hdr);padding:12px 14px;display:flex;gap:10px;align-items:center;position:sticky;top:0;z-index:5}header h1{margin:0;font-size:21px;flex:1}
header a{color:var(--txt);background:var(--card);border:1px solid var(--line);border-radius:10px;padding:0 14px;min-height:44px;display:inline-flex;align-items:center;text-decoration:none;font-size:16px}
.corpo{max-width:860px;margin:0 auto;padding:12px 14px 90px}
#busca{width:100%;min-height:50px;font-size:18px;padding:8px 14px;border-radius:12px;border:1px solid var(--line);background:var(--input);color:var(--txt);margin:8px 0}
.toc{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 14px}.toc a{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:6px 14px;color:var(--txt);text-decoration:none;font-size:15px}
h1{font-size:28px}h2{font-size:24px;margin:34px 0 8px;padding-top:6px;border-top:1px solid var(--line)}h3{font-size:20px;margin:22px 0 6px;color:var(--acc)}h4{font-size:18px}
p,li{overflow-wrap:anywhere}li{margin:4px 0}code{background:var(--input);border:1px solid var(--line);border-radius:6px;padding:1px 6px;font-size:.85em;overflow-wrap:anywhere}a{color:var(--acc)}
.tab{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:16px}th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}th{background:var(--card)}
.sec{scroll-margin-top:70px}mark{background:var(--acc);color:var(--on-acc);border-radius:4px}.nada{color:var(--mut);padding:20px 0}
@media print{header,#busca,.toc{display:none}body{background:#fff;color:#000}}
</style></head><body data-sem-botao-visual>
<header><h1>📖 Manual do sistema</h1><a href="/gestao.html">Gestão</a></header>
<div class="corpo">
<input id="busca" type="search" placeholder="Procurar no manual (ex.: troco, fila, nota fiscal)" aria-label="Procurar no manual">
<nav class="toc">${toc.map((t) => `<a href="#${t.id}">${esc(t.texto)}</a>`).join('')}</nav>
<div id="nada" class="nada" hidden>Nada encontrado. Tente outra palavra.</div>
<main id="texto">
${m.html}
<h2 id="novidades">Novidades e alterações</h2>
${a.html}
</main></div>
<script>
const $ = (s) => document.querySelector(s);
const blocos = []; let atual = null;
for (const el of [...$('#texto').children]) { if (el.tagName === 'H2') { atual = { els: [el] }; blocos.push(atual); } else if (atual) atual.els.push(el); else (atual = { els: [el] }, blocos.push(atual)); }
const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
$('#busca').addEventListener('input', (e) => {
  const q = norm(e.target.value.trim()); let achou = 0;
  for (const b of blocos) { const ok = !q || b.els.some((el) => norm(el.textContent).includes(q)); b.els.forEach((el) => (el.hidden = !ok)); if (ok) achou++; }
  $('#nada').hidden = achou > 0;
});
</script></body></html>
`;
}
