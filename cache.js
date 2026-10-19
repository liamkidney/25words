// Shared PWA cache manager for production and development. The service worker
// serves cached assets offline, but new online builds must not stay stuck behind
// an iOS Home Screen app restored from its suspended (not reloaded) state.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const script = document.querySelector('script[data-cache-manager]');
    const revision = script ? new URL(script.src).searchParams.get('v') || 'local' : 'local';
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;
    let checking = false;
    let lastChecked = 0;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    try {
      const registration = await navigator.serviceWorker.register(
        './sw.js?v=' + encodeURIComponent(revision),
        { updateViaCache: 'none' }
      );

      // Updating the worker alone is insufficient on iOS: reopening the Home
      // Screen app can restore an old document without firing another "load".
      // Fetch the published HTML without using browser/CDN caches, compare its
      // revision with the script currently running, and navigate only if newer.
      async function checkForNewBuild() {
        if (refreshing || checking || document.visibilityState === 'hidden') return;
        if (Date.now() - lastChecked < 2000) return;
        checking = true;
        lastChecked = Date.now();
        try {
          const checkUrl = new URL('index.html', registration.scope);
          checkUrl.searchParams.set('_version_check', String(Date.now()));
          const response = await fetch(checkUrl.href, { cache: 'no-store' });
          if (!response.ok) return;
          const html = await response.text();
          const match = html.match(/cache\.js\?v=([a-f0-9]{7,40})" data-cache-manager/);
          if (!match || match[1] === revision) return;
          refreshing = true;
          const destination = new URL(window.location.href);
          destination.searchParams.set('_app_rev', match[1]);
          window.location.replace(destination.href);
        } catch (_) {
          // Offline mode is intentional; keep the currently cached app usable.
        } finally {
          checking = false;
        }
      }

      function checkForUpdate() {
        registration.update().catch(() => {});
        checkForNewBuild();
      }
      checkForUpdate();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
      window.addEventListener('pageshow', () => checkForUpdate());
      window.addEventListener('focus', () => checkForUpdate());
      window.setInterval(() => {
        if (document.visibilityState === 'visible') checkForUpdate();
      }, 60000);
    } catch (error) {
      console.warn('25 Words update check unavailable', error);
    }
  });
}
