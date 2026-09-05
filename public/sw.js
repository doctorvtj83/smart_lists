/*
 * Smart Lists service worker.
 *
 * SCOPE (deliberately small): this worker makes the app installable and keeps a
 * cold launch without a connection from showing the browser's error page. It is
 * NOT an offline mode. The MVP design puts real offline behind an operation
 * queue in Phase 2, and caching API responses now would show a user a stale list
 * that looks live — the one failure mode a shared shopping list cannot afford.
 *
 * Three strategies, chosen by one pure function so the whole policy is testable
 * (src/test/sw.test.ts loads THIS file, not a copy):
 *   cache-first          — /_next/static/*: content-hashed, so never stale.
 *   network-then-offline — navigations: the offline page when the network fails.
 *   network-only         — everything else, including all of /api.
 */

// Bump this string to invalidate every cached entry. The activate handler
// deletes any cache whose name is not the current version, which is what stops
// an old shell surviving a deploy.
const CACHE_VERSION = "smart-lists-v1";

// Fetched and stored during install. Only files that never change per user:
// the offline page is force-static and the icons are immutable assets.
const PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/apple-touch-icon.png",
];

// The path the navigation fallback serves. Named so the precache list and the
// fetch handler cannot disagree about it.
const OFFLINE_URL = "/offline";

/**
 * The entire routing policy, as a pure function of a URL and a request mode.
 *
 * Pure on purpose: a service worker is otherwise almost untestable, and the part
 * worth testing is exactly this decision — not the plumbing around it.
 */
function pickStrategy(url, mode) {
  const path = new URL(url).pathname;

  // Checked FIRST so it wins even for a navigation: an auth callback is a
  // navigation, and answering it from a cache would break sign-in.
  if (path.startsWith("/api/")) return "network-only";

  // Next.js content-hashes these filenames, so a cached copy is correct forever
  // and a deploy simply requests new names.
  if (path.startsWith("/_next/static/")) return "cache-first";

  // A document request — this is the only thing the offline page can answer.
  if (mode === "navigate") return "network-then-offline";

  return "network-only";
}

// Install: fill the precache, then take over immediately rather than waiting for
// every open tab to close. Safe here because the worker owns no shared state.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// Activate: drop every cache from an older CACHE_VERSION, then claim the open
// clients so the new worker controls the page that installed it.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_VERSION).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET is ever cacheable, and every mutation in this app is a POST to a
  // Server Action or /api — letting them fall through keeps the worker out of
  // the write path entirely.
  if (request.method !== "GET") return;

  const strategy = pickStrategy(request.url, request.mode);

  if (strategy === "cache-first") {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          // Clone before returning: a Response body can only be read once, and
          // the cache write and the page both need it.
          const copy = response.clone();
          return caches
            .open(CACHE_VERSION)
            .then((cache) => cache.put(request, copy))
            .then(
              // Keep respondWith pending until the write settles, so the worker
              // cannot be terminated before the chunk reaches the cache.
              () => response,
              // A cache failure must not discard a valid network response; it
              // only means this chunk will need the network again next time.
              () => response,
            );
        });
      }),
    );
    return;
  }

  if (strategy === "network-then-offline") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }

  // network-only: no respondWith at all, so the browser handles the request as
  // if no service worker existed. Cheaper than proxying it through fetch().
});
