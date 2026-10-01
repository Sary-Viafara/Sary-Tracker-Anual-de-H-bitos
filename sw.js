/* Service Worker · Sary Hábitos
   Para publicar una versión nueva de la app, cambia CACHE_VERSION. */
const CACHE_VERSION = 'v1';
const APP_CACHE = `sary-app-${CACHE_VERSION}`;
const EXT_CACHE = `sary-ext-${CACHE_VERSION}`;

// Archivos propios (app shell)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-48.png'
];

// Recursos externos que usa la app (se guardan para uso sin conexión)
const EXTERNAL = [
  'https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Nunito:wght@400;600;700;800;900&family=Space+Mono:wght@400;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'
];
const EXTERNAL_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const app = await caches.open(APP_CACHE);
    await app.addAll(APP_SHELL);
    const ext = await caches.open(EXT_CACHE);
    // Mejor esfuerzo: si uno falla, la instalación no se cancela
    await Promise.all(EXTERNAL.map(async url => {
      try { await ext.put(url, await fetch(new Request(url, { mode: 'no-cors' }))); } catch (e) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [APP_CACHE, EXT_CACHE];
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('sary-') && !keep.includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isCacheable(res) {
  return res && (res.ok || res.type === 'opaque');
}

// Red primero (con límite de tiempo) y caché como respaldo
async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
    ]);
    if (isCacheable(res)) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true }) || (fallbackUrl && await cache.match(fallbackUrl));
    if (cached) return cached;
    throw err;
  }
}

// Caché primero y actualización en segundo plano
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const update = fetch(request).then(res => {
    if (isCacheable(res)) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await update) || Response.error();
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Páginas de la app: funciona sin conexión
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, APP_CACHE, './index.html'));
    return;
  }
  // Fuentes y Chart.js
  if (EXTERNAL_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, EXT_CACHE));
    return;
  }
  // Archivos propios (iconos, manifest, etc.)
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, APP_CACHE));
  }
});
