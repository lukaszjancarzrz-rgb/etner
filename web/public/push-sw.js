// Ładowany przez service worker (workbox importScripts): powiadomienia push.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  // badge: biały kształt logo na przezroczystym tle (Android maluje pasek wg kanału alfa; pełna ikona dawała biały kwadrat)
  e.waitUntil(self.registration.showNotification(d.title || 'ETNER', {
    body: d.body || '', tag: d.tag, icon: '/icon-192.png', badge: '/badge-96.png', data: { url: d.url || '' }, lang: 'pl',
  }));
});

// Klik: istniejące okno aplikacji (także zainstalowanej) dostaje fokus i przechodzi pod adres; brak okna → nowe w zakresie aplikacji.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const u = String((e.notification.data && e.notification.data.url) || '');
  const hash = u ? (u.startsWith('#') ? u : '#' + u) : '';
  const target = new URL(hash, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    const w = ws.find((c) => c.url.startsWith(self.registration.scope));
    if (!w) return self.clients.openWindow(target);
    // postMessage działa też w oknie bez kontroli SW (navigate() wtedy rzuca); zmiana hasha nie przeładowuje aplikacji
    if (hash) w.postMessage({ type: 'etner-nav', hash });
    return w.focus();
  }).catch(() => self.clients.openWindow(target)));
});
