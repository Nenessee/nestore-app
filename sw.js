const CACHE_VERSION = 'nestore-2026-10-08-v269-fake-anticourse'; // même valeur que APP_VERSION / DASH_VERSION / SERVER_VERSION
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

// --- Notifications push (ventes) ---
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || 'Nestore';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'nestore',
    renotify: true,
    data: { url: '/' }
  };
  if (data.image) options.image = data.image;
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
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

  // version.json — toujours le réseau, jamais mis en cache (c'est le détecteur de mise à jour)
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(req));
    return;
  }

  // Requêtes de navigation — CACHE D'ABORD (stale-while-revalidate) : la page s'affiche
  // instantanément depuis le cache local, et on la rafraîchit en arrière-plan pour la
  // prochaine ouverture. AVANT (network-first) : chaque ouverture sur mobile attendait le
  // téléchargement complet du HTML (172-590 Ko) → écran blanc de plusieurs secondes en 4G
  // faible. Les nouvelles versions restent signalées par la bannière « 🔄 Actualiser »
  // (poll version.json), dont le rechargement cache-busté (?_v=) passe ici en réseau direct.
  if (req.mode === 'navigate') {
    if (/(^|[?&])(_v|nocache)=/.test(url.search)) { event.respondWith(fetch(req)); return; }
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req).then((resp) => {
        if (resp && resp.ok) cache.put(req, resp.clone()).catch(() => {});
        return resp;
      });
      if (cached) { fresh.catch(() => {}); return cached; } // rafraîchissement silencieux en fond
      return fresh.catch(() => cache.match('/index.html'));
    })());
    return;
  }

  // Assets statiques — cache-first. On ne met PAS en cache les URLs à paramètres (?nocache=…) :
  // chaque poll créait sinon une NOUVELLE entrée de cache → stockage qui gonflait sans fin.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (resp && resp.ok && (url.origin === location.origin) && !url.search) {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
