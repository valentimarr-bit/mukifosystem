// Portaria das páginas de gestão: quem não tem login (ou não tem o módulo) não recebe a página.
// Só as páginas do mapa abaixo passam por aqui; o resto (cliente, entrada, placar...) segue direto para os arquivos estáticos.
import { lerCookie, usuarioDoToken } from './auth.js';

const QUALQUER_EQUIPE = '*';
// Página → quem pode ver: '*' = qualquer pessoa da equipe logada; lista = precisa de um dos módulos.
const MAPA = {
  '/inicio.html': QUALQUER_EQUIPE,
  '/gestao.html': QUALQUER_EQUIPE,
  '/manual.html': QUALQUER_EQUIPE,
  '/venda.html': ['venda'],
  '/canais.html': ['venda'],
  '/producao.html': ['producao'],
  '/pix.html': ['financeiro'],
  '/pagamentos.html': ['financeiro'],
  '/fiscal.html': ['financeiro'],
  '/mesas.html': ['campeonato'],
  '/torneio.html': ['campeonato'],
  '/compras/': ['registrar', 'recomendado'],
  '/compras/index.html': ['registrar', 'recomendado'],
};

const redirecionar = (local) => new Response(null, { status: 302, headers: { Location: local } });

/** '/x' vira '/x.html' quando for página do mapa; '/compras' vira '/compras/'. */
function normalizar(caminho) {
  if (Object.hasOwn(MAPA, caminho)) return caminho;
  if (Object.hasOwn(MAPA, caminho + '.html')) return caminho + '.html';
  if (caminho === '/compras') return '/compras/';
  return caminho;
}

function decodificar(caminho) {
  try { return decodeURIComponent(caminho); } catch { return caminho; }
}

/** Quem está logado pelo cookie da página? Sem cookie, cookie inválido ou erro na consulta: ninguém (fecha a porta). */
async function quemEntrou(request, env, caminho) {
  const token = lerCookie(request, 'mk_equipe');
  if (!token) return null;
  try {
    return await usuarioDoToken(token, env, 'GET', caminho);
  } catch (e) {
    console.error('portaria:', e.message);
    return null;
  }
}

/** Devolve a resposta da portaria, ou null quando a rota não é página protegida (o Worker segue para os arquivos estáticos). */
export async function portaria(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const caminho = normalizar(decodificar(url.pathname));

  if (caminho === '/' || caminho === '/index.html') {
    const eu = await quemEntrou(request, env, '/inicio.html');
    return redirecionar(eu ? '/inicio.html' : '/entrar.html');
  }

  if (!Object.hasOwn(MAPA, caminho)) return null;

  const eu = await quemEntrou(request, env, caminho);
  if (!eu) return redirecionar('/entrar.html?volta=' + encodeURIComponent(url.pathname));
  if (eu.trocarSenha) return redirecionar('/entrar.html?trocar=1');

  const exigido = MAPA[caminho];
  if (exigido !== QUALQUER_EQUIPE && !exigido.some((modulo) => eu.modulos.includes(modulo))) {
    return redirecionar('/inicio.html?sem=1');
  }

  const r = await env.ASSETS.fetch(request);   // 307 de '/x.html' para '/x' é repassado como veio
  const resposta = new Response(r.body, r);
  resposta.headers.set('Cache-Control', 'private, no-store');
  return resposta;
}
