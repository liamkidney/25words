// The HTML references cache.js?v=<branch commit>. A new deployment gives
// the browser a new script URL and prompts the worker to refresh its cache.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const script = document.querySelector('script[data-cache-manager]');
    const revision = script ? new URL(script.src).searchParams.get('v') || 'local' : 'local';
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;

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
      const checkForUpdate = () => registration.update().catch(() => {});
      checkForUpdate();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
      window.addEventListener('pageshow', event => {
        if (event.persisted) checkForUpdate();
      });
    } catch (error) {
      console.warn('25 Words update check unavailable', error);
    }
  });
}
