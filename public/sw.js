const CACHE_NAME = 'swuws-cache-v2';
const STATIC_CACHE_NAME = 'swuws-static-v2';

const OFFLINE_URL = '/dashboard/offline';
const LOGS_URL = '/dashboard/offline/logs';
const SETTINGS_URL = '/dashboard/settings/printer';

// Core assets that MUST be cached during installation
const PRECACHE_ASSETS = [
  '/',
  OFFLINE_URL,
  LOGS_URL,
  SETTINGS_URL,
  '/manifest.webmanifest',
  '/logo.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)),
      self.skipWaiting()
    ])
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
        // Cache successful responses for future offline use
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // OFFLINE FALLBACK
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;

          // If a page was requested and it's not in cache, show the offline page
          if (request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
        });
      })
  );
});
