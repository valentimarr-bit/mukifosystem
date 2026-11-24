// Service worker do app de compras: guarda a tela para abrir mesmo sem internet (Ceasa, mercado).
// A lista em si fica salva no aparelho pelo próprio app; aqui só a "casca".
const CACHE = 'mukifo-compras-v5';
const CASCA = ['/compras/', '/entrar.js', '/tema.js', '/fotos.js', '/compras/manifest.webmanifest', '/compras/icone-192.png', '/compras/icone-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return; // API sempre pela rede
  // Rede primeiro (pega versão nova); sem internet, usa a cópia guardada.
  e.respondWith(
    fetch(e.request)
      .then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/compras/'))),
  );
});
