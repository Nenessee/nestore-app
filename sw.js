const CACHE_VERSION = 'nestore-v2025-04-25-cam';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/manifest.json',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png',
  '/logo.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API Railway — network-first, pas de cache
  if (url.hostname.includes('railway.app')) {
    event.respondWith(
      fetch(req).catch(() => new Response(JSON.stringify({ offline: true }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // Requêtes de navigation — network-first avec fallback cache puis index
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
        return resp;
      }).catch(() =>
        caches.match(req).then((r) => r || caches.match('/index.html'))
      )
    );
    return;
  }

  // Assets statiques — cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (resp && resp.ok && (url.origin === location.origin)) {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
