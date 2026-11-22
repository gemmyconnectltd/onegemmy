// OneGemmy service worker
// Strategy:
//  - Navigations: network-first, falling back to cache (offline support).
//  - Build files under /_next/static/ (content-hashed, so immutable): cache-first.
//  - Other static files (fonts, images, icons): cache-first.
//  - Everything else — including Next.js page data (RSC / "flight" responses fetched during in-app navigation) — goes
//    straight to the network and is never cached. Page data names the build's code files; serving an old copy after a
//    deployment makes the app ask for files that no longer exist ("Failed to load chunk").
// Cross-origin requests (e.g. the API on a different host) are left alone.

// Bump on any change to this file: phones then drop the previous cache when the new worker activates.
const CACHE = "onegemmy-v2";
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

function isPageData(request, url) {
  return request.headers.get("RSC") === "1" || request.headers.has("Next-Router-State-Tree") || url.searchParams.has("_rsc");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page data and anything dynamic: always fresh from the network (the browser handles it; nothing cached here).
  if (isPageData(request, url)) return;

  // Navigations — network first, cached fallback for offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) cachePut(event, request, res);
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/")),
        ),
    );
    return;
  }

  // Static files — cache first (hashed build files never change; a missing one is never cached).
  if (url.pathname.startsWith("/_next/static/") || STATIC_ASSET.test(url.pathname)) {
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
  }
  // Everything else: not intercepted, so the browser fetches it normally.
});
