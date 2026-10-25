// Service worker de Heseria (versión web / PWA). Plantilla del skill de Aguiteks.
// - Abre sin internet: al instalarse guarda todo el build (precache.json) y la pantalla principal se
//   sirve de la caché si la red falla.
// - La Biblia (public/biblia, ~33 MB) no se precarga: cada libro se guarda la primera vez que se lee.
// - Push: muestra el aviso con ícono y badge y abre la pantalla correcta al tocarlo.
// Firestore y Firebase Auth no pasan por aquí: solo archivos de la propia app.

const CACHE = 'heseria-v1';
const BIBLE = 'heseria-biblia-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/badge-96.png', '/logo-mark.png', '/biblia/books.json', '/biblia/versions.json']);
      try {
        const files = await (await fetch('/precache.json', { cache: 'no-store' })).json();
        await Promise.all(files.map((f) => c.add(`/${f}`).catch(() => undefined)));
      } catch {
        // Sin lista (desarrollo): se guardan al usarse.
      }
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== BIBLE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Pantallas: primero la red (versión nueva); sin red, la guardada.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Índices de la Biblia: pueden cambiar al añadir versiones, primero la red.
  if (url.pathname === '/biblia/books.json' || url.pathname === '/biblia/versions.json') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

  // Archivos con hash (assets/) y libros de la Biblia: no cambian, primero la caché.
  // ignoreVary: los <script crossorigin> mandan Origin y el servidor responde `Vary: Origin`;
  // sin esto la copia guardada al instalar no coincide y la app no abre sin red.
  const bible = url.pathname.startsWith('/biblia/');
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (bible || url.pathname.startsWith('/assets/'))) {
            const copy = res.clone();
            caches.open(bible ? BIBLE : CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

// ── Notificaciones push ───────────────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch {
    p = { notification: { title: 'Heseria', body: event.data ? event.data.text() : '' } };
  }
  const n = p.notification || {};
  const d = p.data || {};
  const link = d.link || '/home';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Con la app a la vista no se duplica: la campana ya se actualiza en tiempo real.
      if (wins.some((w) => w.focused && w.visibilityState === 'visible')) return;
      return self.registration.showNotification(n.title || d.title || 'Heseria', {
        body: n.body || d.body || '',
        icon: '/icon-192.png',
        badge: '/badge-96.png',
        tag: link,
        renotify: true,
        requireInteraction: d.urgent === '1',
        data: { link },
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/home';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins[0];
      if (win) return win.navigate(link).catch(() => null).then((w) => (w || win).focus());
      return self.clients.openWindow(link);
    }),
  );
});
