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
  #mkLogin button.sec{background:transparent;border:1px solid var(--line,#2c2c2c);color:var(--txt,#f2f2f2);font-weight:500;margin-top:10px}
  #mkLogin .erro{color:var(--bad,#ff8a80);min-height:20px;margin-top:8px;font-size:14px}`;

  function montar() {
    if (document.getElementById('mkLogin')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const d = document.createElement('dialog'); d.id = 'mkLogin';
    d.innerHTML = `<h3 id="mkTitulo"></h3><p id="mkAjuda"></p>
      <label for="mkNome">Seu nome</label><input id="mkNome" autocomplete="username">
      <label for="mkSenha">Senha</label><input id="mkSenha" type="password" autocomplete="current-password">
      <div id="mkCodigoBox" hidden><label for="mkCodigo">Código de primeiro acesso</label><input id="mkCodigo" autocomplete="off"></div>
      <div id="mkTrocaBox" hidden>
        <p>Por segurança, crie sua senha (não use 123456)</p>
        <label for="mkSenhaNova">Senha nova</label><input id="mkSenhaNova" type="password" autocomplete="new-password">
        <label for="mkSenhaNova2">Repita a senha nova</label><input id="mkSenhaNova2" type="password" autocomplete="new-password">
      </div>
      <div class="erro" id="mkErro"></div><button id="mkOk"></button>`;
    d.addEventListener('cancel', (e) => e.preventDefault()); // só fecha entrando
    document.body.appendChild(d);
  }

  // Grava a sessão neste aparelho e avisa o servidor para gravar o cookie da página (erro ignorado).
  const cookie = () => post('/api/auth/cookie', {}, sessao?.token).catch(() => {});

  async function pedir(aoEntrar) {
    montar();
    const $ = (s) => document.querySelector(s);
    const est = await fetch('/api/auth/estado').then((r) => r.json()).catch(() => ({}));
    const primeiro = !!est.primeiroAcesso;
    let pendente = null; // { token, usuario, senhaAtual } enquanto falta trocar a senha provisória
    const mostrarEntrada = () => {
      pendente = null;
      $('#mkTitulo').textContent = primeiro ? 'Primeiro acesso' : 'Entrar';
      $('#mkAjuda').textContent = primeiro
        ? 'Quem entrar agora vira o superadmin (o chefe do sistema). Use o código que você criou na Cloudflare. Depois dá para trocar a senha e passar o cargo para outra pessoa.'
        : 'Digite seu nome e sua senha.';
      $('#mkOk').textContent = primeiro ? 'Criar e entrar' : 'Entrar';
      $('#mkNome').hidden = $('#mkSenha').hidden = false;
      $('#mkNome').previousElementSibling.hidden = $('#mkSenha').previousElementSibling.hidden = false;
      $('#mkCodigoBox').hidden = !est.pedeCodigo;
      $('#mkTrocaBox').hidden = true;
      $('#mkSenha').autocomplete = primeiro ? 'new-password' : 'current-password';
    };
    mostrarEntrada();
    $('#mkErro').textContent = est.faltaCodigo
      ? 'Antes do primeiro acesso, crie o segredo CODIGO_PRIMEIRO_ACESSO na Cloudflare (Settings → Variables and Secrets) e recarregue a página.' : '';
    $('#mkOk').disabled = !!est.faltaCodigo;
    const d = $('#mkLogin'); if (!d.open) d.showModal();

    // Passo de troca da senha provisória: mesmo diálogo, sem fechar.
    const pedirTroca = (r, senhaAtual) => {
      pendente = { token: r.token, usuario: r.usuario, senhaAtual };
      $('#mkTitulo').textContent = 'Crie sua senha';
      $('#mkAjuda').textContent = 'Sua senha atual é provisória. Escolha uma senha sua.';
      $('#mkNome').hidden = $('#mkSenha').hidden = true;
      $('#mkNome').previousElementSibling.hidden = $('#mkSenha').previousElementSibling.hidden = true;
      $('#mkCodigoBox').hidden = true;
      $('#mkTrocaBox').hidden = false;
      $('#mkSenhaNova').value = ''; $('#mkSenhaNova2').value = '';
      $('#mkOk').textContent = 'Salvar senha e entrar';
    };
    const concluir = (r) => {
      salvar({ token: r.token, usuario: r.usuario });
      cookie();
      $('#mkSenha').value = ''; pendente = null; d.close(); aoEntrar && aoEntrar(r.usuario);
    };

    $('#mkOk').onclick = async () => {
      $('#mkOk').disabled = true; $('#mkErro').textContent = '';
      try {
        if (pendente) {
          const nova = $('#mkSenhaNova').value, repetida = $('#mkSenhaNova2').value;
          if (nova !== repetida) throw new Error('As senhas não são iguais.');
          await post('/api/auth/trocar-senha', { senhaAtual: pendente.senhaAtual, senhaNova: nova }, pendente.token);
          concluir(pendente);
        } else {
          const corpo = { nome: $('#mkNome').value.trim(), senha: $('#mkSenha').value, codigo: $('#mkCodigo').value.trim() };
          const r = await post(primeiro ? '/api/auth/primeiro-acesso' : '/api/auth/entrar', corpo);
          if (r.trocarSenha) pedirTroca(r, corpo.senha);
          else concluir(r);
        }
      } catch (e) { $('#mkErro').textContent = e.message; }
      $('#mkOk').disabled = !!est.faltaCodigo && !pendente;
    };
  }

  return {
    token: () => sessao?.token || '',
    usuario: () => sessao?.usuario || null,
    pedir,
    post,
    guardar: (r) => salvar({ token: r.token, usuario: r.usuario }),
    limpar: () => salvar(null),
    cookie,
    sair: async () => { try { await post('/api/auth/sair', {}, sessao?.token); } catch {} salvar(null); location.href = '/entrar.html'; },
    atualizarUsuario: (u) => salvar({ ...sessao, usuario: u }),
  };
})();
