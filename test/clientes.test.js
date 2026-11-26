// Contas de cliente, pontos e níveis, tela de produção, aviso no celular e fornecedores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto as wc } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';
import { nivelDe, NIVEIS } from '../src/dominio/niveis.js';
import { cifrar, avisarPedido, b64u, deb64u } from '../src/push.js';
import { verificarGoogle } from '../src/clientes.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = {
  DB: criarD1(['0001_inicial', '0002_lista_compras', '0003_usuarios', '0004_fotos', '0005_alerta_estoque', '0006_venda', '0007_cliente', '0008_combos', '0009_trava_estoque', '0010_estoque_recomendado', '0011_indices', '0012_financeiro', '0013_clientes_e_dias', '0014_indices_estoque', '0015_recuperar_senha', '0016_auditoria', '0017_tempo_preparo', '0018_pronta_entrega', '0019_entrega_parcial', '0020_carteira', '0021_item_pronto', '0022_campeonato', '0023_gateway', '0024_sinuca', '0025_nota_fiscal', '0026_fiscal', '0027_pix_monitor', '0028_canais', '0029_whatsapp', '0030_consentimento_whats', '0031_campeonato_nivel', '0032_jogador_titulo', '0033_sinuca_resultado'].map((m) => arq(`../migrations/${m}.sql`)).concat(arq('../seed/seed.sql'))),
  ADMIN_TOKEN: 'segredo-teste', ASSETS: { fetch: () => new Response('x') },
};
const chamar = async (caminho, metodo = 'GET', corpo, cab = {}, token = 'segredo-teste') => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined,
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '9.9.9.9', ...(token ? { authorization: `Bearer ${token}` } : {}), ...cab } }), env);
  return { status: r.status, corpo: await r.json() };
};

test('níveis: começa no Caramelo e termina na Nota de 200, nunca pula', () => {
  assert.equal(NIVEIS[0].nome, 'Caramelo'); assert.equal(NIVEIS.at(-1).nome, 'Nota de 200');
  assert.equal(nivelDe(0).nome, 'Caramelo'); assert.equal(nivelDe(149).nome, 'Caramelo'); assert.equal(nivelDe(150).nome, 'Pão de Queijo');
  assert.equal(nivelDe(99999).nome, 'Nota de 200'); assert.equal(nivelDe(99999).proximo, null);
  assert.equal(nivelDe(100).proximo.faltam, 50);
  assert.ok(NIVEIS.every((n, i) => i === 0 || n.min > NIVEIS[i - 1].min));
});

test('conta: cadastro exige aceite e senha; login erra e acerta; bloqueia depois de 5 erros', async () => {
  const base = { nome: 'Ana Paula', celular: '(51) 99999-1111', email: 'Ana@Email.com', senha: 'segredo1' };
  assert.equal((await chamar('/api/conta/cadastro', 'POST', base, {}, null)).status, 400);                         // sem aceite
  assert.equal((await chamar('/api/conta/cadastro', 'POST', { ...base, aceite: true, senha: '123' }, {}, null)).status, 400);
  const ok = await chamar('/api/conta/cadastro', 'POST', { ...base, aceite: true }, {}, null);
  assert.equal(ok.status, 201); assert.equal(ok.corpo.cliente.nivel.nome, 'Caramelo');
  assert.equal((await chamar('/api/conta/cadastro', 'POST', { ...base, aceite: true }, {}, null)).status, 409);
  assert.equal((await chamar('/api/conta/eu', 'GET', null, { 'X-Sessao-Cliente': ok.corpo.token }, null)).corpo.cliente.nome, 'Ana Paula');
  assert.equal((await chamar('/api/conta/eu', 'GET', null, {}, null)).status, 401);
  assert.equal((await chamar('/api/conta/entrar', 'POST', { login: 'ana@email.com', senha: 'segredo1' }, {}, null)).status, 200);
  assert.equal((await chamar('/api/conta/entrar', 'POST', { login: '51999991111', senha: 'segredo1' }, {}, null)).status, 200);
  for (let i = 0; i < 5; i++) assert.equal((await chamar('/api/conta/entrar', 'POST', { login: '51999991111', senha: 'errada' + i }, {}, null)).status, 401);
  assert.equal((await chamar('/api/conta/entrar', 'POST', { login: '51999991111', senha: 'segredo1' }, {}, null)).status, 429);
  await env.DB.prepare('UPDATE cliente SET bloqueado_ate = NULL').run();
});

test('Google: só aceita token assinado, do app certo e dentro da validade', async () => {
  const par = await wc.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwks = { keys: [{ ...(await wc.subtle.exportKey('jwk', par.publicKey)), kid: 'k1' }] };
  const jwt = async (claims, chave = par.privateKey) => { const e = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); const c = `${e({ alg: 'RS256', kid: 'k1' })}.${e(claims)}`; return c + '.' + Buffer.from(await wc.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(c))).toString('base64url'); };
  const bom = { iss: 'https://accounts.google.com', aud: 'meu-app', sub: '123', email: 'a@b.com', email_verified: true, name: 'Bia', exp: Math.floor(Date.now() / 1000) + 600 };
  assert.equal((await verificarGoogle(await jwt(bom), 'meu-app', jwks)).email, 'a@b.com');
  assert.equal(await verificarGoogle(await jwt({ ...bom, aud: 'outro' }), 'meu-app', jwks), null);
  assert.equal(await verificarGoogle(await jwt({ ...bom, exp: 1 }), 'meu-app', jwks), null);
  const outra = await wc.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign']);
  assert.equal(await verificarGoogle(await jwt(bom, outra.privateKey), 'meu-app', jwks), null);
  assert.equal((await chamar('/api/conta/google', 'POST', { credential: 'x' }, {}, null)).status, 503);   // sem GOOGLE_CLIENT_ID
});

// Receptor de teste: faz o caminho inverso do RFC 8291 para provar que a mensagem cifrada abre.
async function abrir(corpo, privada, pubUa, auth) {
  const salt = corpo.slice(0, 16), idlen = corpo[20], as = corpo.slice(21, 21 + idlen), dados = corpo.slice(21 + idlen);
  const hk = async (s, ikm, info, n) => new Uint8Array(await wc.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s, info }, await wc.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8));
  const cat = (...a) => Buffer.concat(a.map((x) => Buffer.from(x)));
  const seg = new Uint8Array(await wc.subtle.deriveBits({ name: 'ECDH', public: await wc.subtle.importKey('raw', as, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, privada, 256));
  const ikm = await hk(auth, seg, cat(Buffer.from('WebPush: info\0'), pubUa, as), 32);
  const cek = await hk(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = await hk(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const claro = new Uint8Array(await wc.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await wc.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), dados));
  return new TextDecoder().decode(claro.slice(0, claro.lastIndexOf(2)));
}

test('aviso no celular: a mensagem cifrada abre no aparelho e vai com assinatura VAPID', async () => {
  const ua = await wc.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pubUa = new Uint8Array(await wc.subtle.exportKey('raw', ua.publicKey)), auth = wc.getRandomValues(new Uint8Array(16));
  const msg = JSON.stringify({ titulo: 'Seu drink começou a ser preparado! 🍹', vibrar: [300, 100, 300] });
  assert.equal(await abrir(await cifrar(msg, b64u(pubUa), b64u(auth)), ua.privateKey, pubUa, auth), msg);
  // envio completo com um "servidor de push" falso
  const vapid = await wc.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const e2 = { ...env, VAPID_PUBLICA: b64u(await wc.subtle.exportKey('raw', vapid.publicKey)), VAPID_PRIVADA: (await wc.subtle.exportKey('jwk', vapid.privateKey)).d };
  await env.DB.prepare("INSERT INTO push_assinatura (pedido_id, endpoint, p256dh, auth) VALUES ('ped-x', 'https://push.exemplo/abc', ?, ?)").bind(b64u(pubUa), b64u(auth)).run();
  let visto; const r = await avisarPedido(e2, 'ped-x', { titulo: 'oi' }, async (url, op) => { visto = { url, op }; return new Response(null, { status: 201 }); });
  assert.equal(r.enviados, 1); assert.match(visto.op.headers.Authorization, /^vapid t=.+\..+\..+, k=/); assert.equal(visto.op.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(JSON.parse(await abrir(visto.op.body, ua.privateKey, pubUa, auth)).titulo, 'oi');
  await avisarPedido(e2, 'ped-x', { titulo: 'oi' }, async () => new Response(null, { status: 410 }));          // aparelho que sumiu é removido
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM push_assinatura WHERE pedido_id = 'ped-x'").first()).n, 0);
  assert.equal((await avisarPedido(env, 'ped-x', {})).enviados, 0);                                           // sem chaves: não faz nada, não quebra
});

test('pedido do app: paga → aparece na produção com receita → começa a preparar → QR tira da tela; pontos entram uma vez', async () => {
  await chamar('/api/venda/trava', 'PUT', { ativa: false });
  await chamar('/api/venda/pix', 'PUT', { chave: 'bar@mukifo.com', nome: 'MUKIFO', cidade: 'PORTO ALEGRE' });
  const login = (await chamar('/api/conta/entrar', 'POST', { login: 'ana@email.com', senha: 'segredo1' }, {}, null)).corpo;
  const cab = { 'X-Sessao-Cliente': login.token };
  const card = (await chamar('/api/venda/cardapio', 'GET', null, {}, null)).corpo.categorias.flatMap((c) => c.produtos);
  const comFicha = (await env.DB.prepare('SELECT produto_id AS id FROM ficha_tecnica LIMIT 1').first()).id;
  const prod = card.find((p) => p.id === comFicha) ?? card[0];
  const ped = await chamar('/api/cliente/pedidos', 'POST', { itens: [{ produto_id: prod.id, quantidade: 2 }] }, cab, null);   // nome e celular vêm da conta
  assert.equal(ped.status, 201);
  assert.equal((await chamar('/api/producao')).corpo.pedidos.length, 0);                              // ainda não pagou: não vai para a produção
  const cobr = (await chamar('/api/venda/retiradas')).corpo.aguardando[0].cobranca_id;
  await chamar(`/api/venda/cobrancas/${cobr}/confirmar`, 'POST', {});
  const fila = (await chamar('/api/producao')).corpo.pedidos;
  assert.equal(fila.length, 1); assert.equal(fila[0].numero, ped.corpo.numero); assert.equal(fila[0].nome_cliente, 'Ana Paula');
  assert.equal(fila[0].itens[0].quantidade, 2); assert.ok(Array.isArray(fila[0].itens[0].receita));
  assert.ok(fila[0].itens[0].receita.length > 0 && fila[0].itens[0].receita[0].quantidade > 0);
  assert.equal((await chamar('/api/producao/' + ped.corpo.id + '/preparo', 'POST', { acao: 'xx' })).status, 400);
  assert.equal((await chamar('/api/producao/' + ped.corpo.id + '/preparo', 'POST', { acao: 'preparando' })).status, 200);
  assert.equal((await chamar('/api/producao/' + ped.corpo.id + '/preparo', 'POST', { acao: 'preparando' })).status, 409);   // não repete
  const st = await chamar('/api/cliente/pedidos/' + ped.corpo.id, 'GET', null, { 'X-Chave-Pedido': ped.corpo.chave_qr }, null);
  assert.equal(st.corpo.status, 'preparando');
  assert.equal((await chamar('/api/producao/' + ped.corpo.id + '/preparo', 'POST', { acao: 'pronto' })).status, 200);
  assert.equal((await chamar('/api/producao')).corpo.pedidos[0].status, 'pronto');
  const val = await chamar('/api/venda/retirada', 'POST', { codigo: `MKF1.${ped.corpo.id}.${ped.corpo.chave_qr}`, confirmar: true });
  assert.equal(val.corpo.entregue, true);
  assert.equal((await chamar('/api/producao')).corpo.pedidos.length, 0);                              // QR lido: saiu da produção
  const eu = (await chamar('/api/conta/eu', 'GET', null, cab, null)).corpo.cliente;
  // o cliente só vê o nível: nenhum número de pontos, progresso ou valor sai nas respostas dele
  assert.equal(eu.pontos, undefined); assert.equal(eu.pontos_total, undefined); assert.equal(eu.nivel.min, undefined); assert.equal(eu.nivel.progresso_pct, undefined);
  assert.equal(eu.nivel.proximo?.faltam, undefined); assert.ok(eu.nivel.nome);
  const bruto = JSON.stringify([(await chamar('/api/conta/eu', 'GET', null, cab, null)).corpo, (await chamar('/api/conta/niveis', 'GET', null, {}, null)).corpo]);
  assert.ok(!/"min"|pontos|faltam|progresso|"total"|"regra"/.test(bruto), 'resposta do cliente não pode trazer pontos nem valores');
  const hist = (await chamar('/api/conta/eu', 'GET', null, cab, null)).corpo.pedidos;
  assert.ok(hist.length && hist[0].itens.length && hist[0].itens[0].nome && hist[0].itens[0].quantidade, 'últimos pedidos mostram o que foi pedido'); assert.ok(!/preco|valor|total/.test(JSON.stringify(hist)), 'sem valores');
  const pontosReais = (await env.DB.prepare('SELECT pontos_total, pontos FROM cliente WHERE id = ?').bind(eu.id).first());   // a equipe/banco guarda
  assert.equal(pontosReais.pontos_total, Math.floor(prod.preco * 2)); assert.equal(pontosReais.pontos, pontosReais.pontos_total);
  const { creditarPontos } = await import('../src/clientes.js'); assert.equal(await creditarPontos(env.DB, ped.corpo.id), 0);   // não conta duas vezes
});

test('área de clientes na gestão: lista, busca, ajuste de pontos só do superadmin', async () => {
  const lista = (await chamar('/api/clientes?q=ana')).corpo; assert.equal(lista.clientes[0].nome, 'Ana Paula');
  assert.equal((await chamar('/api/clientes', 'GET', null, {}, null)).status, 401);
  const id = lista.clientes[0].id, antes = lista.clientes[0].pontos;
  assert.equal((await chamar(`/api/clientes/${id}/pontos`, 'POST', { pontos: 50, motivo: 'aniversário' })).status, 200);
  assert.equal((await chamar(`/api/clientes/${id}/pontos`, 'POST', { pontos: -99999, motivo: 'x' })).status, 409);
  assert.equal((await chamar(`/api/clientes/${id}`)).corpo.cliente.pontos, antes + 50);
  assert.equal((await chamar(`/api/clientes/${id}`, 'PUT', { nome: 'Ana Paula', ativo: false })).status, 200);
  assert.equal((await chamar('/api/conta/entrar', 'POST', { login: 'ana@email.com', senha: 'segredo1' }, {}, null)).status, 401);   // conta desativada não entra
});

test('fornecedores: cadastrar, repetir nome, editar, apagar só se não tem uso', async () => {
  assert.equal((await chamar('/api/fornecedores', 'POST', { nome: 'Distribuidora Sul', prazo_dias: 28, cnpj: '00.000.000/0001-00' })).status, 201);
  assert.equal((await chamar('/api/fornecedores', 'POST', { nome: 'distribuidora sul' })).status, 409);
  assert.equal((await chamar('/api/fornecedores', 'POST', { nome: 'X', prazo_dias: -3 })).status, 400);
  const id = (await chamar('/api/fornecedores')).corpo.fornecedores.find((f) => f.nome === 'Distribuidora Sul').id;
  assert.equal((await chamar(`/api/fornecedores/${id}`, 'PUT', { nome: 'Distribuidora Sul', prazo_dias: 14, ativo: true })).status, 200);
  assert.equal((await chamar(`/api/fornecedores/${id}`, 'DELETE')).status, 200);
  const emUso = (await env.DB.prepare('SELECT fornecedor_id AS id FROM insumo WHERE fornecedor_id IS NOT NULL LIMIT 1').first()).id;
  assert.equal((await chamar(`/api/fornecedores/${emUso}`, 'DELETE')).status, 409);
});

test('painel de permissões: o superadmin escolhe os módulos de cada login e o servidor barra o resto', async () => {
  const sa = await chamar('/api/auth/primeiro-acesso', 'POST', { nome: 'Dono', senha: 'senha-forte-1', codigo: 'x' }, {}, null);
  void sa;   // (sem código configurado nos testes: usamos a chave de emergência como superadmin e criamos o gerente por ela)
  assert.equal((await chamar('/api/usuarios', 'POST', { nome: 'Gerente Teste', senha: 'gerente-123' })).status, 200);
  const lista = (await chamar('/api/usuarios')).corpo, g = lista.find((u) => u.nome === 'Gerente Teste');
  assert.ok(g.modulos.includes('venda') && !g.modulos.includes('financeiro'));                       // padrão do gerente
  const login = (await chamar('/api/auth/entrar', 'POST', { nome: 'Gerente Teste', senha: 'gerente-123' }, {}, null)).corpo.token;
  assert.equal((await chamar('/api/financeiro/resumo', 'GET', null, {}, login)).status, 403);
  assert.equal((await chamar('/api/planilhas', 'GET', null, {}, login)).status, 403);
  assert.equal((await chamar('/api/producao', 'GET', null, {}, login)).status, 200);
  assert.equal((await chamar('/api/auth/eu', 'GET', null, {}, login)).corpo.usuario.modulos.includes('financeiro'), false);
  assert.equal((await chamar(`/api/usuarios/${g.id}/modulos`, 'PUT', { modulos: ['financeiro', 'excel', 'inexistente'] })).status, 400);
  assert.equal((await chamar(`/api/usuarios/${g.id}/modulos`, 'PUT', { modulos: ['financeiro', 'excel'] }, {}, login)).status, 403);   // gerente não se dá permissão
  assert.equal((await chamar(`/api/usuarios/${g.id}/modulos`, 'PUT', { modulos: ['financeiro', 'excel'] })).status, 200);
  assert.equal((await chamar('/api/financeiro/resumo', 'GET', null, {}, login)).status, 200);
  assert.equal((await chamar('/api/producao', 'GET', null, {}, login)).status, 403);                  // tirou o que não marcou
  assert.equal((await chamar(`/api/usuarios/${g.id}/modulos`, 'PUT', { padrao: true })).status, 200);
  assert.equal((await chamar('/api/financeiro/resumo', 'GET', null, {}, login)).status, 403);
  const eu = lista.find((u) => u.papel === 'superadmin');
  if (eu) assert.equal((await chamar(`/api/usuarios/${eu.id}/modulos`, 'PUT', { modulos: [] })).status, 409);
});

test('lista de compras: limpar descarta a lista aberta sem mexer no estoque', async () => {
  const antes = (await env.DB.prepare('SELECT COUNT(*) AS n FROM movimento_estoque').first()).n;
  const lista = (await chamar('/api/listas', 'POST', { dia: 'quinta' })).corpo.lista;
  assert.ok(lista.id);
  assert.equal((await chamar(`/api/listas/${lista.id}/limpar`, 'POST', {}, {}, null)).status, 401);
  assert.equal((await chamar(`/api/listas/${lista.id}/limpar`, 'POST', {})).status, 200);
  assert.equal((await chamar('/api/listas/atual')).corpo.lista, null);
  assert.equal((await chamar(`/api/listas/${lista.id}/limpar`, 'POST', {})).status, 409);          // já limpa
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM movimento_estoque').first()).n, antes);
});

test('visual da casa: público para ler, só superadmin grava, valores inválidos viram padrão', async () => {
  assert.equal((await chamar('/api/visual', 'GET', null, {}, null)).corpo.visual, null);
  assert.equal((await chamar('/api/visual', 'PUT', { tema: 'oceano' }, {}, null)).status, 403);
  const r = await chamar('/api/visual', 'PUT', { tema: 'nao-existe', acento: '#12ab34', raio: '99', botoes: 'extra', fonte: 'redonda', marca: { nome: 'Mukifo <b>Bar', emoji: '🍹' } });
  assert.equal(r.status, 200); assert.equal(r.corpo.visual.tema, null); assert.equal(r.corpo.visual.raio, null); assert.equal(r.corpo.visual.acento, '#12ab34');
  const lido = (await chamar('/api/visual', 'GET', null, {}, null)).corpo.visual;
  assert.equal(lido.botoes, 'extra'); assert.equal(lido.marca.nome, 'Mukifo bBar'); assert.equal(lido.marca.emoji, '🍹');
});

test('modo teste: pagamento do app e do balcão entra sozinho, sem trava, marcado como teste', async () => {
  assert.equal((await chamar('/api/teste', 'GET', null, {}, null)).corpo.ativo, false);
  assert.equal((await chamar('/api/teste', 'PUT', { ativo: true }, {}, null)).status, 403);
  assert.equal((await chamar('/api/teste', 'PUT', { ativo: true })).corpo.ativo, true);
  assert.equal((await chamar('/api/visual', 'GET', null, {}, null)).corpo.teste, true);
  const prod = (await env.DB.prepare('SELECT id FROM produto WHERE preco_venda IS NOT NULL AND ativo = 1 LIMIT 1').first()).id;
  const r = await chamar('/api/cliente/pedidos', 'POST', { nome: 'Teste', celular: '51999990000', itens: [{ produto_id: prod, quantidade: 1 }] }, {}, null);
  assert.equal(r.status, 201); assert.equal(r.corpo.teste, true);
  const c = await env.DB.prepare('SELECT status, operador FROM cobranca WHERE pedido_id = ?').bind(r.corpo.id).first();
  assert.equal(c.status, 'paga'); assert.equal(c.operador, 'teste');
  assert.equal((await env.DB.prepare('SELECT status FROM pedido WHERE id = ?').bind(r.corpo.id).first()).status, 'recebido');
  await chamar('/api/teste', 'PUT', { ativo: false });
});

test('esqueci a senha: código do balcão cria senha nova, vale uma vez e derruba a sessão antiga', async () => {
  const cad = await chamar('/api/conta/cadastro', 'POST', { nome: 'Maria Teste', celular: '51988887777', senha: 'senha-antiga', aceite: true }, {}, null);
  assert.equal(cad.status, 201); const tokenAntigo = cad.corpo.token, id = cad.corpo.cliente.id;
  // sem código: nada feito; pedido por e-mail não revela se a conta existe
  assert.equal((await chamar('/api/conta/redefinir', 'POST', { login: '51988887777', codigo: '123456', senha: 'nova-senha-1' }, {}, null)).status, 400);
  const e1 = await chamar('/api/conta/esqueci', 'POST', { login: '51988887777' }, {}, null), e2 = await chamar('/api/conta/esqueci', 'POST', { login: '51900000000' }, {}, null);
  assert.deepEqual(e1.corpo, e2.corpo);
  // só a equipe logada gera o código
  assert.equal((await chamar(`/api/clientes/${id}/codigo-senha`, 'POST', {}, {}, null)).status, 401);
  const g = (await chamar(`/api/clientes/${id}/codigo-senha`, 'POST', {})).corpo; assert.match(g.codigo, /^\d{6}$/);
  // código errado conta tentativa; depois de 5 erros o código é invalidado, mesmo o certo
  for (let i = 0; i < 5; i++) assert.equal((await chamar('/api/conta/redefinir', 'POST', { login: '51988887777', codigo: g.codigo === '000000' ? '111111' : '000000', senha: 'nova-senha-1' }, {}, null)).status, 400);
  assert.equal((await chamar('/api/conta/redefinir', 'POST', { login: '51988887777', codigo: g.codigo, senha: 'nova-senha-1' }, {}, null)).status, 400);
  const g2 = (await chamar(`/api/clientes/${id}/codigo-senha`, 'POST', {})).corpo;
  assert.equal((await chamar('/api/conta/redefinir', 'POST', { login: '51988887777', codigo: g2.codigo, senha: 'curta' }, {}, null)).status, 400);   // senha curta
  const ok = await chamar('/api/conta/redefinir', 'POST', { login: '51988887777', codigo: g2.codigo, senha: 'nova-senha-1' }, {}, null);
  assert.equal(ok.status, 200); assert.ok(ok.corpo.token);
  assert.equal((await chamar('/api/conta/redefinir', 'POST', { login: '51988887777', codigo: g2.codigo, senha: 'outra-senha-9' }, {}, null)).status, 400);   // uso único
  assert.equal((await chamar('/api/conta/entrar', 'POST', { login: '51988887777', senha: 'senha-antiga' }, {}, null)).status, 401);
  assert.equal((await chamar('/api/conta/entrar', 'POST', { login: '51988887777', senha: 'nova-senha-1' }, {}, null)).status, 200);
  assert.equal((await chamar('/api/conta/eu', 'GET', null, { 'X-Sessao-Cliente': tokenAntigo }, null)).status, 401);   // sessão antiga caiu
});

test('auditoria: registra quem fez o quê (sem senhas), só o superadmin lê, e erros ficam marcados', async () => {
  // gerente comum (não superadmin) faz coisas com login próprio
  const ger = await chamar('/api/usuarios', 'POST', { nome: 'Gerente Auditado', senha: 'senha-gerente-1' });
  assert.ok([200, 201].includes(ger.status));
  const lg = await chamar('/api/auth/entrar', 'POST', { nome: 'Gerente Auditado', senha: 'senha-gerente-1' }, {}, null);
  assert.equal(lg.status, 200);
  const errado = await chamar('/api/auth/entrar', 'POST', { nome: 'Gerente Auditado', senha: 'errada-errada' }, {}, null); assert.equal(errado.status, 401);
  const prod = (await env.DB.prepare('SELECT id FROM produto WHERE preco_venda IS NOT NULL AND ativo = 1 LIMIT 1').first()).id;
  const com = await chamar('/api/venda/comandas', 'POST', {}, {}, lg.corpo.token);
  await chamar(`/api/venda/comandas/${com.corpo.comanda.id}/itens`, 'POST', { produto_id: prod, delta: 1 }, {}, lg.corpo.token);
  // quem não é superadmin não lê
  assert.equal((await chamar('/api/auditoria', 'GET', null, {}, lg.corpo.token)).status, 403);
  assert.equal((await chamar('/api/auditoria', 'GET', null, {}, null)).status, 401);
  const j = (await chamar('/api/auditoria?pessoa=' + encodeURIComponent('Gerente Auditado'))).corpo;
  const acoes = j.registros.map((r) => r.acao);
  assert.ok(acoes.includes('Entrou no sistema') && acoes.includes('Abriu uma venda') && acoes.includes('Mexeu nos itens da venda'));
  assert.ok(j.registros.some((r) => r.acao === 'Entrou no sistema' && r.status === 401), 'tentativa com senha errada fica registrada');
  assert.ok(!JSON.stringify(j).includes('senha-gerente-1') && !JSON.stringify(j).includes('errada-errada'), 'senha nunca é gravada');
  assert.ok(j.pessoas.some((p) => p.nome === 'Gerente Auditado' && p.erros >= 1 && p.ultimo_login));
  // ver (GET) não polui o registro
  const antes = (await chamar('/api/auditoria')).corpo.total; await chamar('/api/estoque'); await chamar('/api/estoque');
  assert.equal((await chamar('/api/auditoria')).corpo.total, antes);
  // filtro só erros
  assert.ok((await chamar('/api/auditoria?so_erros=1')).corpo.registros.every((r) => r.status >= 400));
});

test('carteira: recarga por Pix só credita quando confirmada (uma vez), paga pedido com saldo, impede saldo negativo', async () => {
  const cad = await chamar('/api/conta/cadastro', 'POST', { nome: 'Carla Saldo', celular: '(51) 98888-0001', email: 'carla@email.com', senha: 'segredo1', aceite: true }, {}, null);
  const sess = { 'X-Sessao-Cliente': cad.corpo.token };
  await chamar('/api/venda/pix', 'PUT', { chave: 'bar@mukifo.com' });
  assert.equal((await chamar('/api/conta/carteira/recarga', 'POST', { valor: 1 }, sess, null)).status, 400);
  const rec = await chamar('/api/conta/carteira/recarga', 'POST', { valor: 50 }, sess, null);
  assert.equal(rec.status, 201); assert.equal(rec.corpo.saldo, 0); assert.ok(rec.corpo.pendente.pix.startsWith('000201'));
  const fila = (await chamar('/api/venda/retiradas')).corpo.recargas;
  assert.equal(fila.length >= 1, true);
  const id = rec.corpo.pendente.id;
  assert.equal((await chamar(`/api/venda/recargas/${id}/confirmar`, 'POST', {})).status, 200);
  assert.equal((await chamar(`/api/venda/recargas/${id}/confirmar`, 'POST', {})).corpo.ja, true);   // não credita duas vezes
  assert.equal((await chamar('/api/conta/carteira', 'GET', null, sess, null)).corpo.saldo, 50);
  assert.equal((await chamar('/api/conta/eu', 'GET', null, sess, null)).corpo.cliente.saldo, 50);
  const prod = (await env.DB.prepare('SELECT id, preco_venda FROM produto WHERE preco_venda IS NOT NULL LIMIT 1').first());
  const ped = await chamar('/api/cliente/pedidos', 'POST', { itens: [{ produto_id: prod.id, quantidade: 1 }], pagar_com_saldo: true }, sess, null);
  assert.equal(ped.status, 201); assert.equal(ped.corpo.pago_com_saldo, true);
  const saldo = (await chamar('/api/conta/carteira', 'GET', null, sess, null)).corpo.saldo;
  assert.equal(saldo, Math.round((50 - prod.preco_venda) * 100) / 100);
  assert.equal((await env.DB.prepare('SELECT status FROM pedido WHERE id = ?').bind(ped.corpo.id).first()).status, 'recebido');
  // saldo insuficiente
  await chamar('/api/cliente/pedidos', 'POST', { itens: [{ produto_id: prod.id, quantidade: 20 }], pagar_com_saldo: true }, sess, null);
  const rest = (await chamar('/api/conta/carteira', 'GET', null, sess, null)).corpo.saldo; assert.ok(rest >= 0);
  assert.equal((await chamar(`/api/clientes/${cad.corpo.cliente.id}/saldo`, 'POST', { valor: -9999, obs: 'x' })).status, 400);
  assert.equal((await chamar(`/api/clientes/${cad.corpo.cliente.id}/saldo`, 'POST', { valor: 10, obs: 'dinheiro no balcão' })).status, 200);
});

test('produção: pronto por item; todos prontos → pedido pronto automaticamente', async () => {
  await chamar('/api/teste', 'PUT', { ativo: true });
  const cad = await chamar('/api/conta/cadastro', 'POST', { nome: 'Davi Item', celular: '(51) 98888-0002', email: 'davi@email.com', senha: 'segredo1', aceite: true }, {}, null);
  const { results: ps } = await env.DB.prepare('SELECT id FROM produto WHERE preco_venda IS NOT NULL ORDER BY id LIMIT 2').all();
  const ped = await chamar('/api/cliente/pedidos', 'POST', { itens: ps.map((p) => ({ produto_id: p.id, quantidade: 1 })) }, { 'X-Sessao-Cliente': cad.corpo.token }, null);
  assert.equal(ped.status, 201);
  const itens = (await env.DB.prepare('SELECT id FROM item_pedido WHERE pedido_id = ? ORDER BY id').bind(ped.corpo.id).all()).results;
  const a = await chamar(`/api/producao/${ped.corpo.id}/item/${itens[0].id}/pronto`, 'POST', { pronto: true });
  assert.equal(a.status, 200); assert.equal(a.corpo.pedido_pronto, false);
  assert.equal((await env.DB.prepare('SELECT status FROM pedido WHERE id = ?').bind(ped.corpo.id).first()).status, 'preparando');
  assert.equal((await chamar(`/api/producao/${ped.corpo.id}/item/${itens[0].id}/pronto`, 'POST', { pronto: false })).corpo.pedido_pronto, false);
  await chamar(`/api/producao/${ped.corpo.id}/item/${itens[0].id}/pronto`, 'POST', { pronto: true });
  const b = await chamar(`/api/producao/${ped.corpo.id}/item/${itens[1].id}/pronto`, 'POST', { pronto: true });
  assert.equal(b.corpo.pedido_pronto, true);
  assert.equal((await env.DB.prepare('SELECT status FROM pedido WHERE id = ?').bind(ped.corpo.id).first()).status, 'pronto');
  assert.equal((await chamar(`/api/producao/${ped.corpo.id}/item/${itens[0].id}/pronto`, 'POST', { pronto: true })).status, 409);
  await chamar('/api/teste', 'PUT', { ativo: false });
});

test('fila do cliente: mostra quantos pedidos estão na frente e some quando fica pronto', async () => {
  await chamar('/api/teste', 'PUT', { ativo: true });
  const cad = await chamar('/api/conta/cadastro', 'POST', { nome: 'Fila Teste', celular: '(51) 98888-0004', email: 'fila@email.com', senha: 'segredo1', aceite: true }, {}, null);
  const sess = { 'X-Sessao-Cliente': cad.corpo.token };
  const prod = await env.DB.prepare('SELECT id FROM produto WHERE preco_venda IS NOT NULL LIMIT 1').first();
  const fazer = async () => (await chamar('/api/cliente/pedidos', 'POST', { itens: [{ produto_id: prod.id, quantidade: 1 }] }, sess, null)).corpo;
  const a = await fazer(), b = await fazer();
  await env.DB.prepare("UPDATE pedido SET pago_em = datetime('now', '-5 minutes') WHERE id = ?").bind(a.id).run();
  const ver = async (p) => (await chamar(`/api/cliente/pedidos/${p.id}`, 'GET', null, { 'X-Chave-Pedido': p.chave_qr }, null)).corpo;
  const sb = await ver(b); assert.ok(sb.fila);
  assert.equal(sb.fila.a_frente >= 1, true); assert.equal(sb.fila.posicao, sb.fila.a_frente + 1); assert.ok(sb.espera.padrao_min > 0);
  assert.equal((await ver(a)).fila.a_frente < sb.fila.a_frente, true);
  await env.DB.prepare("UPDATE pedido SET status = 'pronto', pronto_em = datetime('now') WHERE id = ?").bind(a.id).run();
  assert.equal((await ver(b)).fila.a_frente, sb.fila.a_frente - 1);
  assert.equal((await ver(a)).fila, null);
  await chamar('/api/teste', 'PUT', { ativo: false });
});

test('esqueci a senha pelo WhatsApp: o código vai para o celular da conta e serve para criar a senha nova', async () => {
  const cad = await chamar('/api/conta/cadastro', 'POST', { nome: 'Zap Teste', celular: '51977776666', senha: 'senha-velha-1', aceite: true }, {}, null);
  assert.equal(cad.status, 201);
  const fetchOriginal = globalThis.fetch, envios = [];
  globalThis.fetch = async (url, op) => { envios.push({ url: String(url), corpo: JSON.parse(op.body) }); return new Response('{}', { status: 200 }); };
  Object.assign(env, { IZAPIA_API_KEY: 'chave', IZAPIA_SID: 'sessao-1' });
  try {
    const r = await chamar('/api/conta/esqueci', 'POST', { login: '(51) 97777-6666' }, {}, null);
    assert.equal(r.status, 200); assert.match(r.corpo.mensagem, /WhatsApp/);
    assert.equal(envios.length, 1); assert.equal(envios[0].corpo.to, '5551977776666');
    const codigo = envios[0].corpo.text.match(/(\d{6})/)[1];
    await chamar('/api/conta/esqueci', 'POST', { login: '51977776666' }, {}, null);
    assert.equal(envios.length, 1);   // no máximo 1 envio por minuto
    const ok = await chamar('/api/conta/redefinir', 'POST', { login: '51977776666', codigo, senha: 'senha-nova-1' }, {}, null);
    assert.equal(ok.status, 200);
    assert.equal((await chamar('/api/conta/entrar', 'POST', { login: '51977776666', senha: 'senha-nova-1' }, {}, null)).status, 200);
  } finally { globalThis.fetch = fetchOriginal; delete env.IZAPIA_API_KEY; delete env.IZAPIA_SID; }
});
