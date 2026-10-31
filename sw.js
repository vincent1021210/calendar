/* 獨立日曆：清掉先前 PATS 網站留下的快取後自行解除登錄 */
self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) { return caches.delete(key); }));
      })
      .then(function () { return self.clients.claim(); })
      .then(function () { return self.registration.unregister(); })
  );
});

self.addEventListener('fetch', function (event) {
  event.respondWith(fetch(event.request));
});
