// Ładowany przez service worker (workbox importScripts): powiadomienia push.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'ETNER', {
    body: d.body || '', tag: d.tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || '' }, lang: 'pl',
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const u = String((e.notification.data && e.notification.data.url) || '');
  const target = new URL('/' + (u && !u.startsWith('#') ? '#' + u : u), self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    const w = ws.find((c) => new URL(c.url).origin === self.location.origin);
    if (w) return w.focus().then((f) => (f || w).navigate(target));
    return self.clients.openWindow(target);
  }));
});
