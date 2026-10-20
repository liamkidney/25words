// Production and development have separate scopes and cache namespaces.
// Register the worker at a STABLE URL. Adding the current page revision to
// the registration URL lets an old, suspended tab re-register an old worker,
// potentially undoing an update completed by a newer tab.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const script = document.querySelector('script[data-cache-manager]');
    const revision = script ? new URL(script.src).searchParams.get('v') || 'local' : 'local';
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;
    let checking = false;
    let lastCheck = 0;

    // A new worker can take over an already-open, outdated document. Navigate
    // with a fresh URL instead of trusting an ordinary reload on iOS.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      const destination = new URL(window.location.href);
      destination.searchParams.set('_sw_refresh', String(Date.now()));
      window.location.replace(destination.href);
    });

    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {
        updateViaCache: 'none'
      });
      const channel = new URL(registration.scope).pathname.endsWith('/dev/') ? 'dev' : 'prod';

      async function checkForNewBuild() {
        if (refreshing || checking || document.visibilityState === 'hidden') return;
        checking = true;
        try {
          // A tiny build-time version file is simpler and less fragile than
          // parsing the cached HTML. Use a unique URL and no-store semantics.
          // The worker forwards this request to the network without caching.
          const checkUrl = new URL('./version.json', registration.scope);
          checkUrl.searchParams.set('_version_check', String(Date.now()));
          const response = await fetch(checkUrl.href, { cache: 'no-store' });
          if (!response.ok) return;
          const remote = await response.json();
          if (remote?.channel !== channel ||
              !/^[a-f0-9]{7,40}$/.test(remote?.revision || '') ||
              remote.revision === revision) return;

          // Avoid a navigation loop while GitHub Pages/CDN propagation is
          // incomplete. An older document may briefly coexist with a newer
          // version.json; a later manual reopening can retry the navigation.
          const destination = new URL(window.location.href);
          if (destination.searchParams.get('_app_rev') === remote.revision) return;
          refreshing = true;
          destination.searchParams.set('_app_rev', remote.revision);
          window.location.replace(destination.href);
        } catch (_) {
          // No connection: remain in the current, functioning offline app.
        } finally {
          checking = false;
        }
      }

      function checkForUpdate() {
        if (refreshing || document.visibilityState === 'hidden') return;
        if (Date.now() - lastCheck < 2000) return;
        lastCheck = Date.now();
        registration.update().catch(() => {});
        checkForNewBuild();
      }

      checkForUpdate();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
      window.addEventListener('pageshow', () => checkForUpdate());
      window.addEventListener('focus', () => checkForUpdate());
      window.setInterval(checkForUpdate, 60000);
    } catch (error) {
      console.warn('25 Words update check unavailable', error);
    }
  });
}
