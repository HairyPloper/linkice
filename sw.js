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
  event.waitUntil(handlePush(event));
});

async function handlePush(event) {
  const fallbackPayload = {
    title: "Nova poruka",
    body: "Neko je poslao poruku na Linkice.",
  };

  try {
    let payload = fallbackPayload;

    if (event.data) {
      try {
        payload = event.data.json();
      } catch (e) {
        payload = { ...fallbackPayload, body: event.data.text() };
      }
    }

    await showLinkiceNotification({
      title: payload.title || fallbackPayload.title,
      body: payload.body || payload.message || fallbackPayload.body,
    });
  } catch (err) {
    console.error("Push handler failed:", err);
    await showLinkiceNotification(fallbackPayload);
  }
}

async function showLinkiceNotification(payload) {
  const title = String(payload.title || "Nova poruka");
  const body = String(payload.body || "Neko je poslao poruku na Linkice.");
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

  try {
    await self.registration.showNotification(title, options);
  } catch (err) {
    console.error("Notification with icon failed:", err);
    await self.registration.showNotification(title, { body });
  }
}

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
