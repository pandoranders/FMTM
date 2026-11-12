// Only an offline information page is cached. Task data and login requests stay online.
const CACHE = 'fmtm-offline-v1';
const OFFLINE = new URL('./offline.html', self.location.href).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(OFFLINE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('fmtm-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate' || event.request.method !== 'GET' || !event.request.url.startsWith(self.registration.scope)) return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match(OFFLINE)) || new Response('Du er frakoblet. Koble til internett og prøv igjen.', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
});
