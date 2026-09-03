// Service Worker for GOFAMINT Sunday School Secretary PWA
//
// IMPORTANT cache strategy, fixed after a real bug: the app's HTML shell
// (index.html / navigation requests) MUST always be fetched from the
// network first. Serving it cache-first meant that after every deploy,
// devices kept loading yesterday's app version — sometimes for many
// minutes and several refreshes — because the stale index.html referenced
// yesterday's JS bundle, and this cache was only ever updated silently in
// the background AFTER already serving the stale copy.
//
// Bump CACHE_NAME whenever you want to force a clean cache reset for every
// device (e.g. after fixing a caching bug like this one). It does not need
// to change on every normal deploy — the network-first strategy below
// already keeps the app shell fresh on every deploy without that.
const CACHE_NAME = 'gofamint-ss-secretary-v2';
const ASSETS_TO_CACHE = [
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('SW pre-caching partial or skipped in dev mode:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Pass through non-GET and API routes to network with fallback
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  const url = new URL(event.request.url);
  const isNavigation = event.request.mode === 'navigate';
  const isAppShell = isNavigation || url.pathname === '/' || url.pathname === '/index.html';

  if (isAppShell) {
    // NETWORK-FIRST: always try to get the latest app shell so a new
    // deploy is visible immediately. Cache is only a fallback for when the
    // device is genuinely offline.
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Vite's hashed build assets (/assets/*.js, /assets/*.css) are safe to
  // serve cache-first and cache forever: the filename itself changes
  // whenever the content does, so a "stale" cache entry for one of these
  // exact filenames is never actually stale.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => undefined);
    })
  );
});

// Background Sync Listener
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-sunday-school-data') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'BACKGROUND_SYNC_TRIGGERED' });
        });
      })
    );
  }
});
