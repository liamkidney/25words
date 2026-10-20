// Filled by build.mjs; production and development use independent caches.
const CHANNEL = '__CHANNEL__';
const REVISION = '__REVISION__';
const CACHE = '25words-' + CHANNEL + '-' + REVISION;
// The app's JavaScript must be available offline in both environments.
const ASSETS = ['./', './index.html', './cache.js?v=' + REVISION, './app.js?v=' + REVISION];
if (CHANNEL === 'dev') ASSETS.push(
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

  // Version probes are unique URLs. Never store one entry every time an open
  // Home Screen app wakes up or checks for an update.
  // The revision endpoint must never fall back to a cached answer. A stale
  // response would falsely tell a suspended iPhone app it is up to date.
  if (url.pathname === new URL('./version.json', self.registration.scope).pathname) {
    event.respondWith(fetch(new Request(request, { cache: 'no-store' })));
    return;
  }

  // Canonicalise navigation keys so revision query strings do not accumulate
  // duplicate offline HTML entries or displace the latest app shell.
  const cacheKey = request.mode === 'navigate'
    ? new URL('./index.html', self.registration.scope).href
    : request;
  event.respondWith(
    fetch(new Request(request, { cache: 'no-store' }))
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put(cacheKey, copy)).catch(() => {}));
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match(cacheKey, { ignoreSearch: true })) || Response.error();
      })
  );
});
