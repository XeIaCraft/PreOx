const SHELL_CACHE_NAME = "preox-shell-v2";
const SHELL_URLS = ["/apps", "/icon", "/manifest.webmanifest"];

// Content already visited in El Profesor (chapter pages + the library page
// itself, plus the static assets those pages need to hydrate) — cached
// opportunistically as the user browses, not a full "download this book"
// feature. Item 37 of the backlog: offline access to content already
// consulted, nothing more.
const OFFLINE_CACHE_NAME = "preox-el-profesor-offline-v1";
const OFFLINE_NAV_PREFIXES = ["/apps/el-profesor"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE_NAME && k !== OFFLINE_CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

function isOfflineNavPath(pathname) {
  return OFFLINE_NAV_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Same-origin static build assets are hashed/immutable — cache-first,
  // filling the cache on first fetch, so a page that's already been
  // visited doesn't go blank offline just because a chunk was never cached.
  if (event.request.method === "GET" && url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((res) => {
            if (res.ok) caches.open(OFFLINE_CACHE_NAME).then((cache) => cache.put(event.request, res.clone()));
            return res;
          })
      )
    );
    return;
  }

  if (event.request.mode !== "navigate") return;

  if (isOfflineNavPath(url.pathname)) {
    // Network-first, caching every successful visit so it's replayable
    // offline later; falls back to whatever was last cached for this exact
    // URL, then to the generic shell as a last resort.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) caches.open(OFFLINE_CACHE_NAME).then((cache) => cache.put(event.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(event.request).then((res) => res || caches.match("/apps")))
    );
    return;
  }

  // Network-first for every other navigation, falling back to the cached
  // shell when fully offline — this is deliberately not a full offline app
  // (most module data still needs the network), just enough that the hub
  // shell loads instead of the browser's own offline error page.
  event.respondWith(fetch(event.request).catch(() => caches.match("/apps").then((res) => res || caches.match(event.request))));
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "PreOx", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "PreOx", {
      body: payload.body,
      icon: "/icon",
      data: { link: payload.link || "/apps" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/apps";
  event.waitUntil(clients.openWindow(link));
});
