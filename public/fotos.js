// Fotos de produtos e insumos (gestão e compras). A imagem é reduzida no próprio navegador antes de subir.
window.Fotos = (() => {
  let indice = { produtos: {}, insumos: {} };
  const guardado = () => { try { return JSON.parse(localStorage.getItem('mukifo_fotos_indice') || 'null'); } catch { return null; } };
  indice = guardado() || indice;

  async function carregar() {
    try {
      const r = await fetch('/api/fotos');
      if (r.ok) { indice = await r.json(); try { localStorage.setItem('mukifo_fotos_indice', JSON.stringify(indice)); } catch {} }
    } catch {}
    return indice;
  }
  const url = (tipo, id) => { const v = indice[tipo]?.[id]; return v ? `/api/fotos/${tipo}/${id}?v=${v}` : null; };
  const tem = (tipo, id) => !!indice[tipo]?.[id];
  const total = (tipo) => Object.keys(indice[tipo] || {}).length;

  /** <img> pequeno, ou um quadradinho vazio quando não há foto. */
  const miniatura = (tipo, id, tamanho = 44) => {
    const u = url(tipo, id);
    return u ? `<img class="foto-mini" src="${u}" width="${tamanho}" height="${tamanho}" loading="lazy" alt="">`
             : `<span class="foto-mini vazia" style="width:${tamanho}px;height:${tamanho}px"></span>`;
  };

  /** Reduz a foto respeitando a rotação do celular. Com `quadrado`, corta do centro para caber num quadrado
   *  (lado × lado, como aparece no cardápio); sem ele, só limita o lado maior. */
  async function reduzir(arquivo, lado = 640, qualidade = 0.82, quadrado = false) {
    const img = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (quadrado) {
      const m = Math.min(img.width, img.height);
      sx = Math.round((img.width - m) / 2); sy = Math.round((img.height - m) / 2); sw = sh = m;
      c.width = c.height = Math.min(lado, m);
    } else {
      const k = Math.min(1, lado / Math.max(img.width, img.height));
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    }
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); // PNG transparente vira fundo branco
    g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Não consegui ler essa foto.'))), 'image/jpeg', qualidade));
  }

  const limpo = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  /** Acha o item do catálogo cujo nome mais combina com o nome do arquivo ("caipirinha-limao.jpg"). Sem empate, ou nada. */
  function combinar(nomeArquivo, catalogo) {
    const a = limpo(nomeArquivo); if (!a) return null;
    const ta = new Set(a.split(' '));
    let melhor = null, nota = 0, empate = false;
    for (const x of catalogo) {
      const b = limpo(x.nome), tb = new Set(b.split(' '));
      const comum = [...ta].filter((t) => tb.has(t)).length;
      const n = a === b ? 2 : comum === ta.size ? 0.6 + 0.4 * comum / tb.size : comum / (ta.size + tb.size - comum); // nome do arquivo todo dentro do nome do item também vale
      if (n > nota) { nota = n; melhor = x; empate = false; } else if (n === nota && n > 0) empate = true;
    }
    return nota >= 0.6 && !empate ? melhor : null;
  }

  async function enviar(tipo, id, arquivo, token) {
    const blob = await reduzir(arquivo, 640, 0.82, true);
    const r = await fetch(`/api/fotos/${tipo}/${id}`, { method: 'PUT', body: blob, headers: { 'content-type': 'image/jpeg', authorization: 'Bearer ' + token } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
    indice[tipo][id] = j.versao;
    try { localStorage.setItem('mukifo_fotos_indice', JSON.stringify(indice)); } catch {}
    return j.versao;
  }

  async function remover(tipo, id, token) {
    const r = await fetch(`/api/fotos/${tipo}/${id}`, { method: 'DELETE', headers: { authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('Não consegui remover.');
    delete indice[tipo][id];
    try { localStorage.setItem('mukifo_fotos_indice', JSON.stringify(indice)); } catch {}
  }

  return { carregar, url, tem, total, miniatura, reduzir, combinar, enviar, remover };
})();
