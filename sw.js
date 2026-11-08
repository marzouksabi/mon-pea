/* Garde l'application disponible hors ligne. Les cours sont toujours redemandés en priorité au réseau. */
var CACHE = 'mon-pea-v4';
var SHELL = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/icon-192.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // reseau d'abord, cache en secours : les cours et le code sont toujours les plus recents possibles
  // 'no-cache' : le navigateur revalide toujours aupres du serveur, l'iPhone ne garde donc pas une ancienne version
  // (une page entiere se redemande par son adresse : une requete de navigation n'accepte pas d'options)
  e.respondWith(fetch(e.request.mode === 'navigate' ? e.request.url : e.request, { cache: 'no-cache' }).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return res;
  }).catch(function () { return caches.match(e.request); }));
});


/* Notifications de l'application Repli (envoyées par GitHub Actions vers 21 h 30) */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Repli', {
    body: d.body || '', icon: 'repli/icons/icon-192.png', badge: 'repli/icons/icon-192.png', tag: 'repli-soir', data: { url: d.url || './repli/' }
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || './repli/', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (ws) {
    for (var i = 0; i < ws.length; i++) if (ws[i].url.indexOf('/repli/') >= 0 && 'focus' in ws[i]) return ws[i].focus();
    return clients.openWindow(url);
  }));
});
