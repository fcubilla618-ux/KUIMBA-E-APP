// Kuimba'e Style 3.13 — caché privado por origen, compatible con subcarpeta GitHub Pages.
const CACHE_NAME = 'kuimbae-style-v3-13-pwa-01';
const PRECACHE = [
  './', './index.html', './manifest.webmanifest', './logo-original.jpg',
  './logo.png', './icon-32.png', './icon-64.png', './icon-192.png',
  './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith('kuimbae-style-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const appScope = new URL('./', self.registration.scope);
  if (!url.pathname.startsWith(appScope.pathname)) return;

  // Nuevas versiones del sistema: intentar la red primero para páginas HTML.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('./index.html', response.clone());
        }
        return response;
      } catch (error) {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }
  // Los íconos y recursos locales se leen del dispositivo; siguen disponibles offline.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    return fetch(request);
  })());
});
