// OneGemmy service worker
// Strategy:
//  - Navigations: network-first, falling back to cache (offline support).
//  - Static assets (hashed JS/CSS/fonts/images): cache-first — these are
//    content-hashed by Next.js, so they are immutable and safe to cache.
//  - Everything else same-origin: stale-while-revalidate.
// Cross-origin requests (e.g. the API on a different host) are left alone.

const CACHE = "onegemmy-mobile-v3";
const STATIC_ASSET = /\.(js|css|woff2?|ttf|png|jpe?g|gif|svg|webp|avif|ico)$/;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function cachePut(event, request, response) {
  // Keep the cache write alive past the fetch handler's lifetime.
  const copy = response.clone();
  event.waitUntil(caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {}));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations — network first, cached fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          cachePut(event, request, res);
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/")),
        ),
    );
    return;
  }

  // Static assets — cache first (immutable, hashed filenames).
  if (STATIC_ASSET.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) cachePut(event, request, res);
            return res;
          }),
      ),
    );
    return;
  }

  // Everything else — stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) cachePut(event, request, res);
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
