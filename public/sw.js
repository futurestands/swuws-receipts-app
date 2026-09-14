const CACHE_NAME = 'swuws-cache-v4';
const STATIC_CACHE_NAME = 'swuws-static-v4';

// Served for any navigation that fails while offline. Unlike
// /dashboard/offline this route has no auth gate and reads no server data,
// so a cached copy still renders when the device is disconnected. It lives
// on the app origin, which is the only origin where Capacitor injects the
// native bridge — public/offline.html (server.errorPath) cannot reach
// CapacitorSQLite at all.
const OFFLINE_SHELL_URL = '/offline-shell';
const OFFLINE_URL = '/dashboard/offline';
const LOGS_URL = '/dashboard/offline/logs';
const SETTINGS_URL = '/dashboard/settings/printer';

// Best-effort warm cache. Auth-gated routes may come back as login
// redirects here, which is why precaching is per-URL and tolerant below.
const PRECACHE_ASSETS = [
  '/',
  OFFLINE_URL,
  LOGS_URL,
  SETTINGS_URL,
  '/manifest.webmanifest',
  '/logo.jpg'
];

/**
 * Caches the offline shell plus the /_next/static chunks its HTML
 * references. Caching the HTML alone is not enough: without its JS the
 * shell renders as a dead page, and the chunk URLs are only discoverable
 * from the markup.
 */
async function precacheOfflineShell(cache) {
  const response = await fetch(OFFLINE_SHELL_URL, { credentials: 'same-origin' });
  if (!response.ok || response.redirected) return;

  const html = await response.clone().text();
  await cache.put(OFFLINE_SHELL_URL, response);

  const assets = new Set(html.match(/\/_next\/static\/[^"'\\\s>]+/g) || []);
  const staticCache = await caches.open(STATIC_CACHE_NAME);
  await Promise.all([...assets].map((url) => staticCache.add(url).catch(() => {})));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Per-URL and failure-tolerant on purpose: cache.addAll() is
      // all-or-nothing, so a single redirect or 404 in the list aborted the
      // whole installation and left the device with no service worker —
      // meaning no offline fallback whatsoever.
      await Promise.all(PRECACHE_ASSETS.map((url) => cache.add(url).catch(() => {})));
      await precacheOfflineShell(cache).catch(() => {});
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE_NAME) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // 2. Cache-First for Next.js static assets (JS, CSS, Chunks)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        return cache.match(request).then((response) => {
          return response || fetch(request).then((networkResponse) => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // 3. Network-First for Pages and other assets
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses for future offline use. Redirected
        // responses are skipped: a navigation FetchEvent cannot be fulfilled
        // with one, so caching it would make the offline navigation throw
        // instead of rendering.
        if (response && response.status === 200 && !response.redirected) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(async () => {
        // OFFLINE FALLBACK
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;

        // If a page was requested and it's not in cache, hand over to the
        // offline workspace. Falling through to a network error here is what
        // drops the user onto the errorPath shell, which has no bridge.
        if (request.mode === 'navigate') {
          const shell = (await caches.match(OFFLINE_SHELL_URL)) || (await caches.match(OFFLINE_URL));
          if (shell) return shell;
        }

        return Response.error();
      })
  );
});
