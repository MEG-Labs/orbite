// ORBITE : coquille hors ligne, notifications.
const CACHE = 'orbite-v29';
const COQUILLE = ['./', 'index.html', 'styles.css', 'app.js', 'modules.js', 'extras.js', 'lot5.js', 'lot6.js', 'theme-cyberpunk.css', 'config.js', 'icon.svg', 'icon-192.png', 'manifest.webmanifest'];
const LIBS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(COQUILLE).then(() => c.add(LIBS).catch(() => {}))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Bibliothèques versionnées sur jsDelivr : cache d'abord (elles ne changent jamais).
  if (url.host === 'cdn.jsdelivr.net') {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(rep => { const c = rep.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return rep; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // Interface : réseau d'abord, cache en secours.
  // cache: 'no-cache' : on contourne le cache HTTP de GitHub Pages (10 min) pour voir les mises à jour tout de suite.
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    const copie = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copie));
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('./'))));
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'ORBITE', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'ORBITE', {
    body: d.body || '', tag: d.tag, renotify: !!d.tag, icon: 'icon-192.png', badge: 'badge-96.png', lang: 'fr-CA', data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const cible = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(liste => {
    for (const c of liste) if (c.url.startsWith(self.registration.scope)) { c.navigate(cible).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(cible);
  }));
});
