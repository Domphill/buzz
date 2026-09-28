/* Buzz — offline support. The app's files are cached when this worker installs, so Buzz opens without
   a connection. Bump VERSION whenever a file changes, or phones keep using the old copy. Only caches
   named buzz-* are touched, because other apps share this origin. */
const VERSION = 'buzz-v1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'src/app.css', 'src/app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('buzz-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((hit) => {
        if (hit) return hit;
        return fetch(req)
          .then((res) => {
            if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
            return res;
          })
          .catch((err) => {
            if (req.mode === 'navigate') return cache.match('./').then((page) => page || Promise.reject(err));
            throw err;
          });
      })
    )
  );
});
