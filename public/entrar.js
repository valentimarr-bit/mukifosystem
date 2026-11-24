// Login compartilhado (gestão e compras). Guarda a sessão neste aparelho.
// Uso: const m = Mukifo.iniciar({ aoEntrar }); m.token(); m.usuario();
window.Mukifo = (() => {
  const CHAVE = 'mukifo_sessao';
  let sessao = null;
  try { sessao = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch {}
  const salvar = (s) => { sessao = s; try { s ? localStorage.setItem(CHAVE, JSON.stringify(s)) : localStorage.removeItem(CHAVE); } catch {} };
  const post = async (url, corpo, tk) => {
    const r = await fetch(url, { method: 'POST', body: JSON.stringify(corpo || {}), headers: { 'content-type': 'application/json', ...(tk ? { authorization: 'Bearer ' + tk } : {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
    return j;
  };

  const css = `#mkLogin{border:none;border-radius:16px;background:var(--card,#1b1b1b);color:var(--txt,#f2f2f2);width:min(92vw,420px);padding:20px}
  #mkLogin::backdrop{background:#000c} #mkLogin h3{margin:0 0 6px} #mkLogin p{color:var(--mut,#a8a8a8);font-size:14px;margin:0 0 8px}
  #mkLogin label{display:block;margin:12px 0 4px;color:var(--mut,#a8a8a8);font-size:14px}
  #mkLogin input{width:100%;min-height:50px;font-size:18px;padding:8px 12px;border-radius:10px;border:1px solid var(--line,#2c2c2c);background:var(--input,#111);color:var(--txt,#f2f2f2);box-sizing:border-box}
  #mkLogin button:disabled{opacity:.5}
  #mkLogin button{width:100%;min-height:52px;margin-top:16px;border-radius:12px;border:0;background:var(--acc,#ffb347);color:var(--on-acc,#111);font-size:17px;font-weight:600;cursor:pointer}
  #mkLogin .erro{color:var(--bad,#ff8a80);min-height:20px;margin-top:8px;font-size:14px}`;

  function montar() {
    if (document.getElementById('mkLogin')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const d = document.createElement('dialog'); d.id = 'mkLogin';
    d.innerHTML = `<h3 id="mkTitulo"></h3><p id="mkAjuda"></p>
      <label for="mkNome">Seu nome</label><input id="mkNome" autocomplete="username">
      <label for="mkSenha">Senha</label><input id="mkSenha" type="password" autocomplete="current-password">
      <div id="mkCodigoBox" hidden><label for="mkCodigo">Código de primeiro acesso</label><input id="mkCodigo" autocomplete="off"></div>
      <div class="erro" id="mkErro"></div><button id="mkOk"></button>`;
    d.addEventListener('cancel', (e) => e.preventDefault()); // só fecha entrando
    document.body.appendChild(d);
  }

  async function pedir(aoEntrar) {
    montar();
    const $ = (s) => document.querySelector(s);
    const est = await fetch('/api/auth/estado').then((r) => r.json()).catch(() => ({}));
    const primeiro = !!est.primeiroAcesso;
    $('#mkTitulo').textContent = primeiro ? 'Primeiro acesso' : 'Entrar';
    $('#mkAjuda').textContent = primeiro
      ? 'Quem entrar agora vira o superadmin (o chefe do sistema). Use o código que você criou na Cloudflare. Depois dá para trocar a senha e passar o cargo para outra pessoa.'
      : 'Digite seu nome e sua senha.';
    $('#mkOk').textContent = primeiro ? 'Criar e entrar' : 'Entrar';
    $('#mkCodigoBox').hidden = !est.pedeCodigo;
    $('#mkSenha').autocomplete = primeiro ? 'new-password' : 'current-password';
    $('#mkErro').textContent = est.faltaCodigo
      ? 'Antes do primeiro acesso, crie o segredo CODIGO_PRIMEIRO_ACESSO na Cloudflare (Settings → Variables and Secrets) e recarregue a página.' : '';
    $('#mkOk').disabled = !!est.faltaCodigo;
    const d = $('#mkLogin'); if (!d.open) d.showModal();
    $('#mkOk').onclick = async () => {
      $('#mkOk').disabled = true; $('#mkErro').textContent = '';
      try {
        const corpo = { nome: $('#mkNome').value.trim(), senha: $('#mkSenha').value, codigo: $('#mkCodigo').value.trim() };
        const r = await post(primeiro ? '/api/auth/primeiro-acesso' : '/api/auth/entrar', corpo);
        salvar({ token: r.token, usuario: r.usuario });
        $('#mkSenha').value = ''; d.close(); aoEntrar && aoEntrar(r.usuario);
      } catch (e) { $('#mkErro').textContent = e.message; }
      $('#mkOk').disabled = !!est.faltaCodigo;
    };
  }

  return {
    token: () => sessao?.token || '',
    usuario: () => sessao?.usuario || null,
    pedir,
    post,
    sair: async () => { try { await post('/api/auth/sair', {}, sessao?.token); } catch {} salvar(null); location.reload(); },
    atualizarUsuario: (u) => salvar({ ...sessao, usuario: u }),
  };
})();
