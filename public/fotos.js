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

  /** Reduz a foto (lado maior 640 px, JPEG) respeitando a rotação do celular. */
  async function reduzir(arquivo, lado = 640, qualidade = 0.82) {
    const img = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
    const k = Math.min(1, lado / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); // PNG transparente vira fundo branco
    g.drawImage(img, 0, 0, c.width, c.height);
    return new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Não consegui ler essa foto.'))), 'image/jpeg', qualidade));
  }

  async function enviar(tipo, id, arquivo, token) {
    const blob = await reduzir(arquivo);
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

  return { carregar, url, tem, total, miniatura, reduzir, enviar, remover };
})();
