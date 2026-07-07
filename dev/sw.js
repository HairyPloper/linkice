// sw.js - Keep it simple and separate from your main app logic
const NOTIFICATION_ICON = "favicon-v1.png";
const NOTIFICATION_BADGE = "favicon-v1.png";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  event.waitUntil(async () => {
    let payload = {
      title: "Nova poruka",
      body: "Neko je poslao poruku na Linkice.",
    };

    if (event.data) {
      try {
        // Try to parse JSON from Vercel/Web-Push
        payload = await event.data.json();
      } catch (e) {
        // Fallback if the payload is just a string
        payload.body = event.data.text();
      }
    }

    const body = payload.body || payload.message || "Neko je poslao poruku na Linkice.";
    const title = payload.title || "Nova poruka";

    const options = {
      body,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_BADGE,
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: "1",
      },
    };

    await self.registration.showNotification(title, options);
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = new URL("./", self.registration.scope).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (
            client.url.startsWith(self.registration.scope) &&
            "focus" in client
          ) {
            return client.focus();
          }
        }
        return clients.openWindow(urlToOpen);
      }),
  );
});
