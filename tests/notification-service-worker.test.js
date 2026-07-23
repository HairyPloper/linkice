const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createServiceWorker() {
  const listeners = new Map();
  const cacheEntries = new Map();
  const notifications = [];
  const openedUrls = [];
  let visible = false;

  const cache = {
    async match(request) {
      return cacheEntries.get(request.url);
    },
    async put(request, response) {
      cacheEntries.set(request.url, response);
    },
    async delete(request) {
      return cacheEntries.delete(request.url);
    },
  };

  const registration = {
    scope: "https://example.test/app/",
    async getNotifications({ tag }) {
      return notifications.filter((item) => !item.closed && item.tag === tag);
    },
    async showNotification(title, options) {
      notifications.push({
        title,
        ...options,
        closed: false,
        close() {
          this.closed = true;
        },
      });
    },
  };

  const context = vm.createContext({
    URL,
    Request,
    Response,
    Promise,
    console,
    caches: { async open() { return cache; } },
    clients: {
      async matchAll() {
        return visible ? [{ visibilityState: "visible" }] : [];
      },
      async openWindow(url) {
        openedUrls.push(url);
      },
    },
    self: {
      registration,
      skipWaiting() {},
      clients: { claim() {} },
      addEventListener(type, handler) {
        listeners.set(type, handler);
      },
    },
  });

  const source = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
  vm.runInContext(source, context, { filename: "sw.js" });

  async function dispatch(type, event = {}) {
    const pending = [];
    event.waitUntil = (promise) => pending.push(Promise.resolve(promise));
    listeners.get(type)(event);
    await Promise.all(pending);
  }

  return {
    notifications,
    openedUrls,
    setVisible(value) { visible = value; },
    async visit(space) {
      await dispatch("message", { data: { type: "SPACE_VISITED", space } });
    },
    async push(payload) {
      await dispatch("push", { data: { json: () => payload } });
    },
    async click(notification) {
      await dispatch("notificationclick", { notification });
    },
  };
}

test("only one notification is shown per unread space until it is visited", async () => {
  const worker = createServiceWorker();
  await worker.visit("gaming");

  await worker.push({ title: "Nove poruke u gaming" });
  await worker.push({ title: "Nove poruke u gaming" });

  assert.equal(worker.notifications.length, 1);
  assert.equal(worker.notifications[0].tag, "linkice-space-gaming");
  assert.equal(worker.notifications[0].title, "Nove poruke u gaming");

  await worker.visit("gaming");
  assert.equal(worker.notifications[0].closed, true);

  await worker.push({ space: "gaming" });
  assert.equal(worker.notifications.length, 2);
});

test("spaces are grouped independently and use the latest visited fallback", async () => {
  const worker = createServiceWorker();
  await worker.visit("latest-room");

  await worker.push({ title: "Nova poruka" });
  await worker.push({ space: "other-room" });
  await worker.push({ space: "other-room" });

  assert.deepEqual(
    worker.notifications.map((item) => item.tag),
    ["linkice-space-latest-room", "linkice-space-other-room"],
  );
});

test("a visible app suppresses the OS notification", async () => {
  const worker = createServiceWorker();
  worker.setVisible(true);

  await worker.push({ space: "gaming" });

  assert.equal(worker.notifications.length, 0);
});

test("clicking a notification clears unread state and opens its space", async () => {
  const worker = createServiceWorker();
  await worker.push({ space: "gaming" });

  await worker.click(worker.notifications[0]);

  assert.equal(worker.notifications[0].closed, true);
  assert.equal(worker.openedUrls[0], "https://example.test/app/?space=gaming");

  await worker.push({ space: "gaming" });
  assert.equal(worker.notifications.length, 2);
});
