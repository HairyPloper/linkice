// sw.js - Keep it simple and separate from your main app logic
const NOTIFICATION_ICON = "icon-192.png";
const NOTIFICATION_BADGE = "notification-badge.png";
const NOTIFICATION_STATE_CACHE = "linkice-notification-state-v1";
let pushQueue = Promise.resolve();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  const task = pushQueue.then(() => handlePush(event));
  pushQueue = task.catch(() => {});
  event.waitUntil(task);
});

function normalizeSpace(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64) || "Linkice";
}

function getLatestSpaceRequest() {
  return new Request(new URL("__notification_state__/latest-space", self.registration.scope));
}

async function getLatestVisitedSpace() {
  const cache = await caches.open(NOTIFICATION_STATE_CACHE);
  const response = await cache.match(getLatestSpaceRequest());
  return response ? normalizeSpace(await response.text()) : null;
}

async function recordVisitedSpace(space) {
  const cache = await caches.open(NOTIFICATION_STATE_CACHE);
  await cache.put(getLatestSpaceRequest(), new Response(normalizeSpace(space)));
}

async function getPayloadSpace(payload) {
  const explicitSpace = payload.space || payload.data?.space;
  if (explicitSpace) return normalizeSpace(explicitSpace);

  const title = String(payload.title || "");
  const titleMatch = title.match(/^Nove poruke u (.+)$/i);
  if (titleMatch) return normalizeSpace(titleMatch[1]);
  if (title.toLowerCase() === "linkice") return "Linkice";

  return (await getLatestVisitedSpace()) || "Linkice";
}

function getStateRequest(space) {
  return new Request(
    new URL(`__notification_state__/${encodeURIComponent(space.toLowerCase())}`, self.registration.scope),
  );
}

async function hasUnreadSpace(space) {
  const cache = await caches.open(NOTIFICATION_STATE_CACHE);
  return !!(await cache.match(getStateRequest(space)));
}

async function markSpaceUnread(space) {
  const cache = await caches.open(NOTIFICATION_STATE_CACHE);
  await cache.put(getStateRequest(space), new Response(String(Date.now())));
}

async function clearUnreadSpace(space) {
  const cache = await caches.open(NOTIFICATION_STATE_CACHE);
  await cache.delete(getStateRequest(space));

  const tag = `linkice-space-${space.toLowerCase()}`;
  const notifications = await self.registration.getNotifications({ tag });
  notifications.forEach((notification) => notification.close());
}

async function hasVisibleClient(space) {
  const clientList = await clients.matchAll({ type: "window", includeUncontrolled: true });
  const cache = await caches.open(NOTIFICATION_STATE_CACHE);
  for (const client of clientList) {
    if (client.visibilityState !== "visible" || !client.url.startsWith(self.registration.scope)) continue;
    // A bare app URL can use a saved room, so remember the room reported by
    // each window instead of guessing from the most recently visited tab.
    const recorded = client.id && await cache.match(new Request(
      new URL(`__notification_state__/client-${encodeURIComponent(client.id)}`, self.registration.scope),
    ));
    const currentSpace = recorded ? await recorded.text() : new URL(client.url).searchParams.get("space");
    if (currentSpace && normalizeSpace(currentSpace).toLowerCase() === space.toLowerCase()) return true;
  }
  return false;
}

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

    const space = await getPayloadSpace(payload);

    // A visible app has already displayed the message, so it is not unread.
    if (await hasVisibleClient(space)) {
      await clearUnreadSpace(space);
      return;
    }

    // Keep one notification for the space until the person visits it.
    if (await hasUnreadSpace(space)) return;

    await markSpaceUnread(space);
    try {
      await showLinkiceNotification({ space });
    } catch (err) {
      await clearUnreadSpace(space);
      throw err;
    }
  } catch (err) {
    console.error("Push handler failed:", err);
  }
}

async function showLinkiceNotification(payload) {
  const space = normalizeSpace(payload.space);
  const title = `Nove poruke u ${space}`;
  const body = `Ima novih poruka u prostoru ${space}.`;
  const tag = `linkice-space-${space.toLowerCase()}`;
  const url = new URL(`./?space=${encodeURIComponent(space)}`, self.registration.scope).href;
  const options = {
    body,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    vibrate: [100, 50, 100],
    tag,
    renotify: false,
    data: {
      dateOfArrival: Date.now(),
      space,
      url,
    },
  };

  try {
    await self.registration.showNotification(title, options);
  } catch (err) {
    console.error("Notification with icon failed:", err);
    await self.registration.showNotification(title, { body, tag, data: options.data });
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "SPACE_VISITED") return;
  const space = normalizeSpace(event.data.space);
  event.waitUntil(Promise.all([
    recordVisitedSpace(space),
    clearUnreadSpace(space),
    event.source?.id ? caches.open(NOTIFICATION_STATE_CACHE).then((cache) => cache.put(
      new Request(new URL(`__notification_state__/client-${encodeURIComponent(event.source.id)}`, self.registration.scope)),
      new Response(space),
    )) : Promise.resolve(),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const space = normalizeSpace(event.notification.data?.space);
  const urlToOpen = event.notification.data?.url ||
    new URL(`./?space=${encodeURIComponent(space)}`, self.registration.scope).href;

  event.waitUntil(
    Promise.all([recordVisitedSpace(space), clearUnreadSpace(space)])
      .then(() => clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then(async (clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.registration.scope) && "focus" in client) {
            if ("navigate" in client && client.url !== urlToOpen) {
              await client.navigate(urlToOpen);
            }
            return client.focus();
          }
        }
        return clients.openWindow(urlToOpen);
      }),
  );
});
