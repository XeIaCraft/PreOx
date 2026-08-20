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
