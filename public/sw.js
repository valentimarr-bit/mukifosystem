// Service worker do Mukifo: recebe o aviso do pedido (mesmo com o app fechado) e faz o celular vibrar.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let m = {}; try { m = e.data.json(); } catch { m = { titulo: 'Mukifo', corpo: 'Novidade no seu pedido.' }; }
  e.waitUntil(self.registration.showNotification(m.titulo || 'Mukifo', { body: m.corpo, vibrate: m.vibrar || [300, 120, 300], tag: 'pedido-' + (m.numero || ''), renotify: true, requireInteraction: m.etapa === 'pronto' || m.etapa === 'preparando', icon: '/icone.svg', badge: '/icone.svg' }));
});
self.addEventListener('notificationclick', (e) => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then((l) => (l[0] ? l[0].focus() : self.clients.openWindow('/cliente.html')))); });
