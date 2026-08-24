self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (error) {}
  event.waitUntil(self.registration.showNotification(data.title || "Office Task Register", {
    body: data.body || "You have a new mention.",
    icon: "/favicon.ico",
    data: { url: data.url || "/" }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data && event.notification.data.url || "/", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(openClients => {
    const existing = openClients.find(client => client.url.startsWith(self.location.origin));
    if (existing) {
      existing.navigate(targetUrl);
      return existing.focus();
    }
    return clients.openWindow(targetUrl);
  }));
});
