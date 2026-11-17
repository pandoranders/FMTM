(() => {
  const button = document.getElementById('install-app');
  const help = document.getElementById('install-help');
  const standalone = window.matchMedia('(display-mode: standalone)');
  let pendingPrompt;
  const installed = () => standalone.matches || navigator.standalone === true;
  function update() {
    button.hidden = installed() || !pendingPrompt;
    help.hidden = installed();
    help.textContent = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      ? 'Installer fra Safari: Del → Legg til på Hjem-skjermen.'
      : 'Du kan også installere appen fra nettleserens meny når den støtter det.';
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pendingPrompt = event;
    update();
  });
  button.addEventListener('click', async () => {
    if (!pendingPrompt) return;
    const prompt = pendingPrompt;
    pendingPrompt = null;
    button.hidden = true;
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { /* The browser may withdraw an expired install prompt. */ }
    update();
  });
  window.addEventListener('appinstalled', () => { pendingPrompt = null; button.hidden = true; help.hidden = true; });
  standalone.addEventListener('change', update);
  update();
  if ('serviceWorker' in navigator) {
    let refreshing = false;
    const alreadyControlled = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (alreadyControlled && !refreshing) {
        refreshing = true;
        location.reload();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.getRegistration().then(registration => registration?.update()).catch(() => {});
      }
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
        .catch(error => console.warn('Service worker registration failed', error));
    });
  }
})();
