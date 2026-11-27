// Menu único do Mukifo: a lista de telas de cada pessoa, a barra do topo e a troca de senha.
// Depende de /entrar.js (window.Mukifo) e /tema.js. Uso: const u = await Menu.eu(); Menu.permitidos(u); Menu.barra();
window.Menu = (() => {
  // modulos vazio = todos. Se a tela pede mais de um módulo, basta ter um deles.
  const ITENS = [
    { rotulo: '🍸 Vender no balcão', emoji: '🍸', href: '/venda.html', modulos: ['venda'] },
    { rotulo: '📲 Entregar pedido do app (QR)', emoji: '📲', href: '/venda.html#retirada', modulos: ['venda'] },
    { rotulo: '👨‍🍳 Pedidos para preparar', emoji: '👨‍🍳', href: '/producao.html', modulos: ['producao'] },
    { rotulo: '🛵 iFood e 99', emoji: '🛵', href: '/canais.html', modulos: ['venda'] },
    { rotulo: '🛒 Lista de compras', emoji: '🛒', href: '/compras/', modulos: ['registrar', 'recomendado'] },
    { rotulo: '📦 Estoque e cardápio', emoji: '📦', href: '/gestao.html', modulos: ['estoque', 'recomendado', 'produtos', 'combos', 'fotos', 'niveis', 'registrar', 'fornecedores'] },
    { rotulo: '💵 Caixa do dia', emoji: '💵', href: '/gestao.html#financeiro', modulos: ['caixa'] },
    { rotulo: '📊 Relatórios e financeiro', emoji: '📊', href: '/gestao.html#desempenho', modulos: ['desempenho', 'financeiro'] },
    { rotulo: '👥 Clientes', emoji: '👥', href: '/gestao.html#clientes', modulos: ['clientes'] },
    { rotulo: '💳 Pix e pagamentos', emoji: '💳', href: '/pix.html', modulos: ['financeiro'] },
    { rotulo: '🧾 Notas fiscais', emoji: '🧾', href: '/fiscal.html', modulos: ['financeiro'] },
    { rotulo: '🎱 Mesas de sinuca', emoji: '🎱', href: '/mesas.html', modulos: ['campeonato'] },
    { rotulo: '🏆 Campeonato', emoji: '🏆', href: '/torneio.html', modulos: ['campeonato'] },
    { rotulo: '📖 Manual', emoji: '📖', href: '/manual.html', modulos: [] },
  ];
  // Só o Dono vê esta tela, além de tudo.
  const PESSOAS = { rotulo: '👤 Pessoas e permissões', emoji: '👤', href: '/gestao.html#conta', modulos: [] };
  const CARGO = { superadmin: 'Dono', gerente: 'Gerente', atendente: 'Atendente' };

  let cache = null;   // usuário já buscado nesta página
  let barraFeita = false;

  /** Nome do cargo para mostrar: o que o servidor mandar, ou o do papel. */
  const cargoDe = (u) => u?.cargo || CARGO[u?.papel] || '';

  /** Telas que este usuário pode abrir, na ordem do menu. */
  function permitidos(u) {
    if (!u) return [];
    if (u.papel === 'superadmin') return [...ITENS, PESSOAS];
    const mine = Array.isArray(u.modulos) ? u.modulos : [];
    return ITENS.filter((it) => it.modulos.length === 0 || it.modulos.some((m) => mine.includes(m)));
  }

  /** Quem está logado. Sem login válido, manda para a tela Entrar e devolve null. */
  async function eu() {
    if (cache) return cache;
    const tk = window.Mukifo?.token?.() || '';
    const irEntrar = () => { location.href = '/entrar.html?volta=' + encodeURIComponent(location.pathname + location.hash); return null; };
    if (!tk) return irEntrar();
    const r = await fetch('/api/auth/eu', { headers: { authorization: 'Bearer ' + tk } });
    if (r.status === 401) return irEntrar();
    if (!r.ok) throw new Error('Não foi possível confirmar o seu login (erro ' + r.status + ').');
    const j = await r.json();
    cache = j.usuario || null;
    return cache;
  }

  const estilo = `#mkBarra{position:sticky;top:0;z-index:900;display:flex;align-items:center;gap:8px;flex-wrap:wrap;
      padding:8px 12px;background:var(--hdr,#000);color:var(--txt,#f2f2f2);border-bottom:1px solid var(--line,#2c2c2c);font:16px/1.3 system-ui,sans-serif}
    #mkBarra a,#mkBarra button{min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--line,#2c2c2c);background:var(--card,#1b1b1b);
      color:var(--txt,#f2f2f2);font:inherit;text-decoration:none;display:inline-flex;align-items:center;cursor:pointer}
    #mkBarra .quem{flex:1;min-width:140px;color:var(--mut,#a8a8a8)} #mkBarra .quem b{color:var(--txt,#f2f2f2)}
    #mkBarra .sair{border-color:var(--bad-bd,#5a2e2e);color:var(--bad,#ff8a80)}
    #mkSenhaDlg{border:none;border-radius:16px;background:var(--card,#1b1b1b);color:var(--txt,#f2f2f2);width:min(92vw,420px);padding:20px}
    #mkSenhaDlg::backdrop{background:#000c} #mkSenhaDlg h3{margin:0 0 8px}
    #mkSenhaDlg label{display:block;margin:12px 0 4px;color:var(--mut,#a8a8a8);font-size:14px}
    #mkSenhaDlg input{width:100%;min-height:50px;font-size:18px;padding:8px 12px;border-radius:10px;border:1px solid var(--line,#2c2c2c);background:var(--input,#111);color:var(--txt,#f2f2f2);box-sizing:border-box}
    #mkSenhaDlg .bots{display:flex;gap:10px;margin-top:16px}
    #mkSenhaDlg button{flex:1;min-height:52px;border-radius:12px;border:1px solid var(--line,#2c2c2c);background:var(--card,#1b1b1b);color:var(--txt,#f2f2f2);font:inherit;font-size:17px;cursor:pointer}
    #mkSenhaDlg button.ok{background:var(--acc,#ffb347);color:var(--on-acc,#111);border-color:var(--acc,#ffb347);font-weight:600}
    #mkSenhaDlg button:disabled{opacity:.5}
    #mkSenhaDlg .erro{color:var(--bad,#ff8a80);min-height:20px;margin-top:8px;font-size:14px}
    #mkSenhaDlg .certo{color:var(--ok,#7ddc8a);min-height:20px;margin-top:8px;font-size:14px}`;

  function abrirSenha() {
    let d = document.getElementById('mkSenhaDlg');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'mkSenhaDlg';
      const h = document.createElement('h3'); h.textContent = 'Trocar minha senha';
      const rotulos = [['mkSenhaAtual', 'Senha atual', 'current-password'], ['mkSenhaNova', 'Senha nova (mínimo 6 letras ou números)', 'new-password'], ['mkSenhaRep', 'Repita a senha nova', 'new-password']];
      d.append(h);
      for (const [id, txt, ac] of rotulos) {
        const l = document.createElement('label'); l.htmlFor = id; l.textContent = txt;
        const i = document.createElement('input'); i.id = id; i.type = 'password'; i.autocomplete = ac;
        d.append(l, i);
      }
      const erro = document.createElement('div'); erro.className = 'erro'; erro.id = 'mkSenhaErro';
      const bots = document.createElement('div'); bots.className = 'bots';
      const cancela = document.createElement('button'); cancela.type = 'button'; cancela.textContent = 'Cancelar';
      cancela.onclick = () => d.close();
      const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'ok'; ok.id = 'mkSenhaOk'; ok.textContent = 'Salvar nova senha';
      ok.onclick = async () => {
        const atual = d.querySelector('#mkSenhaAtual').value, nova = d.querySelector('#mkSenhaNova').value, rep = d.querySelector('#mkSenhaRep').value;
        const msg = d.querySelector('#mkSenhaErro'); msg.className = 'erro';
        if (!atual) { msg.textContent = 'Digite a senha atual.'; return; }
        if (nova.length < 6) { msg.textContent = 'A senha nova precisa ter pelo menos 6 caracteres.'; return; }
        if (nova !== rep) { msg.textContent = 'As duas senhas novas não são iguais.'; return; }
        ok.disabled = true; msg.textContent = '';
        try {
          const r = await fetch('/api/auth/trocar-senha', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + window.Mukifo.token() },
            body: JSON.stringify({ senhaAtual: atual, senhaNova: nova }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.erro || 'Não foi possível trocar a senha.');
          msg.className = 'certo'; msg.textContent = 'Senha trocada. Use a nova na próxima vez que entrar.';
          d.querySelectorAll('input').forEach((i) => { i.value = ''; });
          setTimeout(() => d.close(), 1500);
        } catch (e) { msg.textContent = e.message; }
        ok.disabled = false;
      };
      bots.append(cancela, ok);
      d.append(erro, bots);
      d.addEventListener('close', () => { d.querySelectorAll('input').forEach((i) => { i.value = ''; }); });
      document.body.appendChild(d);
    }
    d.querySelector('#mkSenhaErro').textContent = '';
    d.querySelector('#mkSenhaErro').className = 'erro';
    d.showModal();
    d.querySelector('#mkSenhaAtual').focus();
  }

  async function sair() {
    const tk = window.Mukifo?.token?.() || '';
    if (window.Mukifo?.sair) return window.Mukifo.sair();
    try { await fetch('/api/auth/sair', { method: 'POST', headers: { authorization: 'Bearer ' + tk } }); } catch {}
    try { localStorage.removeItem('mukifo_sessao'); } catch {}
    location.href = '/entrar.html';
  }

  /** Barra fina no topo: Início, quem é, Minha senha e Sair. Não duplica. */
  async function barra() {
    if (barraFeita || document.getElementById('mkBarra')) return;
    barraFeita = true;
    const st = document.createElement('style'); st.textContent = estilo; document.head.appendChild(st);
    const b = document.createElement('nav'); b.id = 'mkBarra'; b.setAttribute('aria-label', 'Menu do sistema');
    const inicio = document.createElement('a'); inicio.href = '/inicio.html'; inicio.textContent = '← Início';
    const quem = document.createElement('span'); quem.className = 'quem';
    const senha = document.createElement('button'); senha.type = 'button'; senha.textContent = '🔑 Minha senha'; senha.onclick = abrirSenha;
    const saida = document.createElement('button'); saida.type = 'button'; saida.className = 'sair'; saida.textContent = 'Sair'; saida.onclick = sair;
    b.append(inicio, quem, senha, saida);
    document.body.prepend(b);
    try {
      const u = await eu();
      if (u) {
        const nome = document.createElement('b'); nome.textContent = u.nome || '';
        const cargo = cargoDe(u);
        quem.append(nome);
        if (cargo) quem.append(' · ' + cargo);
      }
    } catch {}
  }

  return { ITENS, permitidos, eu, barra, cargoDe };
})();
