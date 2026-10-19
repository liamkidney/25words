// Filled by build.mjs; production and development use independent caches.
const CHANNEL = '__CHANNEL__';
const REVISION = '__REVISION__';
const CACHE = '25words-' + CHANNEL + '-' + REVISION;
const ASSETS = ['./', './index.html', './cache.js?v=' + REVISION];
if (CHANNEL === 'dev') ASSETS.push(
  './app.js?v=' + REVISION,
  './manifest.json?v=' + REVISION,
  './icon.svg?v=' + REVISION,
  './favicon-32.png?v=' + REVISION,
  './apple-touch-icon.png?v=' + REVISION,
  './icon-192.png?v=' + REVISION,
  './icon-512.png?v=' + REVISION
);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS.map(path => new Request(path, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('25words-' + CHANNEL + '-') && key !== CACHE)
        .map(key => caches.delete(key))
    ))
  ]));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  // Production's broader /25words/ scope must not cache /25words/dev/ pages.
  if (CHANNEL === 'prod' && url.pathname.startsWith(new URL('dev/', self.registration.scope).pathname)) return;

  event.respondWith(
    fetch(new Request(request, { cache: 'no-store' }))
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {}));
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match(request, { ignoreSearch: true })) || Response.error();
      })
  );
});
