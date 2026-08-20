const CACHE_NAME = "preox-shell-v1";
const SHELL_URLS = ["/apps", "/icon", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first for navigations, falling back to the cached shell when
// fully offline — this is deliberately not a full offline app (module data
// still needs the network), just enough that the hub shell loads instead
// of the browser's own offline error page.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match("/apps").then((res) => res || caches.match(event.request)))
  );
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
