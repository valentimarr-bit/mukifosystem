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
  DB: criarD1(['0001_inicial', '0002_lista_compras', '0003_usuarios', '0004_fotos', '0005_alerta_estoque', '0006_venda', '0007_cliente', '0008_combos', '0009_trava_estoque', '0010_estoque_recomendado', '0011_indices', '0012_financeiro', '0013_clientes_e_dias'].map((m) => arq(`../migrations/${m}.sql`)).concat(arq('../seed/seed.sql'))),
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
  assert.equal(eu.pontos_total, Math.floor(prod.preco * 2)); assert.equal(eu.pontos, eu.pontos_total);
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
