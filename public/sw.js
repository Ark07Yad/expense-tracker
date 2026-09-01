/**
 * Offline shell.
 *
 * This app already keeps everything on the device, so the only thing standing
 * between it and working on a plane is the app's own files. That is what this
 * caches — nothing else. There is no data here: the ledger lives in IndexedDB
 * and never passes through a request.
 *
 * Two strategies, chosen by what the URL is:
 *
 *   - **Built assets are cache-first.** Their filenames contain a content hash,
 *     so a given URL's contents can never change. Serving them from cache is
 *     both safe and the entire reason this loads instantly offline.
 *   - **Navigations are network-first.** Serving the shell from cache first
 *     would mean a deploy is invisible until the cache happens to be evicted,
 *     which is how a service worker strands people on a version from March.
 *     The cached copy is the fallback, not the default.
 */

const VERSION = 'v1';
const SHELL = `cointrack-shell-${VERSION}`;
const ASSETS = `cointrack-assets-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(['/', '/icon.svg', '/manifest.webmanifest']))
  );
  // Take over immediately rather than waiting for every tab to close. The
  // alternative is an update that lands whenever the user happens to quit,
  // which for an installed app can be never.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never touch anything but our own origin, and never anything but a GET —
  // a service worker has no business in the middle of anything else.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached || Response.error()))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            // Only cache a real success: storing an error page under a hashed
            // asset URL would make the failure permanent.
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
  }
});
