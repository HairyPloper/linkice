const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const createSource = require("./helpers/chat-history");
const source = fs.readFileSync(path.join(__dirname, "../js/chat.js"), "utf8");

async function setup(count = 125, configure = () => {}) {
  const backend = createSource(count);
  configure(backend);
  const rows = [];
  const controls = Object.fromEntries(["chat-history-controls", "load-older-messages", "chat-history-status"].map(id => [id, {}]));
  const window = {
    CHANNEL: "test", myAgoraUID: 42, myDisplayName: "Me", normalizeNickname: name => name?.toLowerCase(),
    isOwnChatMessage: data => data.username === "Me", appendSystemHTML() {},
    appendMessage(name, text, color, key, data, options = {}) {
      const row = { key, name, text, historical: options.historical,
        getBoundingClientRect: () => ({ top: rows.indexOf(row) * 20 - chatMessages.scrollTop }) };
      rows.splice(options.before ? rows.indexOf(options.before) : rows.length, 0, row);
    },
  };
  const chatMessages = { scrollTop: 120, querySelector: () => rows[0] };
  const context = vm.createContext({ window, chatMessages, welcomeArt: "", console: { warn() {} },
    escapeHtml: text => text, document: { getElementById: id => controls[id] || null },
    firebase: { database: () => ({ ref: key => key.startsWith("messages/") ? backend.ref
      : key.startsWith("whiteboard-game/") ? backend.game : { on() {} } }) },
  });
  vm.runInContext(source.slice(source.indexOf("const CHAT_PAGE_SIZE"), source.indexOf("function startPresenceListener()")), context);
  context.startChat();
  await new Promise(setImmediate);
  return { backend, window, context, rows, controls, chatMessages };
}

test("pages older records in order without overlap and preserves the existing scroll anchor", async () => {
  const { backend, window, rows, controls, chatMessages } = await setup();
  assert.equal(rows.length, 50);
  const anchor = rows[0];
  const top = anchor.getBoundingClientRect().top;
  await window.loadOlderMessages();
  assert.equal(rows.length, 100);
  assert.equal(anchor.getBoundingClientRect().top, top);
  assert.equal(backend.requests.at(-1).before, "-fixture0076");
  assert.equal(backend.requests.at(-1).limit, 51);
  assert.ok(rows.slice(0, 50).every(row => row.historical));
  await window.loadOlderMessages();
  assert.equal(rows.length, 125);
  assert.equal(new Set(rows.map(row => row.key)).size, 125);
  assert.deepEqual(rows.map(row => row.key), backend.records.map(record => record.key));
  assert.equal(controls["load-older-messages"].hidden, true);
  assert.equal(controls["chat-history-status"].textContent, "Nema starijih poruka.");
  assert.equal(chatMessages.scrollTop, 1620);
});

test("failed page requests can retry and rapid clicks do not send overlapping requests", async () => {
  const { backend, window, rows, controls } = await setup();
  backend.failNext = true;
  await window.loadOlderMessages();
  assert.equal(rows.length, 50);
  assert.match(controls["chat-history-status"].textContent, /Pokušaj ponovo/);
  backend.pauseNext = true;
  const loading = window.loadOlderMessages();
  const requests = backend.requests.length;
  await window.loadOlderMessages();
  assert.equal(backend.requests.length, requests);
  backend.add();
  backend.resume();
  await loading;
  assert.equal(rows.length, 101);
  assert.equal(rows.at(-1).text, "Live message");
});

test("history retains private-message filtering and does not run whiteboard transactions", async () => {
  const { backend, window, rows } = await setup(125, backend => {
    backend.records[27].data = { type: "private", username: "Someone", toSessionId: "99", text: "hidden" };
    backend.records[28].data = { type: "private", username: "Someone", toSessionId: "42", text: "visible" };
  });
  const transactions = backend.transactions;
  await window.loadOlderMessages();
  assert.equal(backend.transactions, transactions);
  assert.equal(rows.some(row => row.text === "hidden"), false);
  assert.equal(rows.some(row => row.text === "visible"), true);
});

test("history completing in a hidden tab leaves unread counts unchanged while live messages notify", async () => {
  const { window, backend, context, rows } = await setup();
  const badges = [];
  const notifications = fs.readFileSync(path.join(__dirname, "../js/notifications.js"), "utf8");
  context.document.title = "Linkice";
  context.navigator = {
    setAppBadge: count => { badges.push(count); return Promise.resolve(); },
    clearAppBadge: () => Promise.resolve(),
  };
  context.setTimeout = callback => callback();
  vm.runInContext(notifications.slice(0, notifications.indexOf("window.notificationManager = new NotificationManager();")), context);
  vm.runInContext(`window.notificationManager = Object.assign(Object.create(NotificationManager.prototype), {
    unreadCount: 0, originalTitle: "Linkice", isTabVisible: true, updateFavicon() {}
  });`, context);
  vm.runInContext(notifications.slice(notifications.indexOf("window.setupNotificationIntegration ="), notifications.indexOf('if (document.readyState === "loading")')), context);
  window.setupNotificationIntegration();

  backend.pauseNext = true;
  const loading = window.loadOlderMessages();
  window.notificationManager.isTabVisible = false;
  backend.resume();
  await loading;
  assert.equal(rows.length, 100);
  assert.equal(window.notificationManager.unreadCount, 0);
  assert.equal(context.document.title, "Linkice");
  assert.deepEqual(badges, []);

  backend.add();
  assert.equal(window.notificationManager.unreadCount, 1);
  assert.equal(context.document.title, "(1) Linkice");
  assert.deepEqual(badges, [1]);
  backend.add({ username: "Me" });
  assert.equal(window.notificationManager.unreadCount, 1);
});

test("pages containing only hidden private messages still advance the cursor", async () => {
  const { backend, window, rows } = await setup(125, backend => {
    backend.records.slice(25, 75).forEach(record => { record.data = { type: "private", toSessionId: "99" }; });
  });
  await window.loadOlderMessages();
  assert.equal(rows.length, 50);
  await window.loadOlderMessages();
  assert.equal(backend.requests.at(-1).before, "-fixture0026");
  assert.equal(rows.length, 75);
});

test("empty and short histories hide paging; an exact page detects the end on request", async () => {
  for (const count of [0, 12, 49]) {
    const { controls } = await setup(count);
    assert.equal(controls["chat-history-controls"].hidden, true);
  }
  const { window, rows, controls } = await setup(50);
  await window.loadOlderMessages();
  assert.equal(rows.length, 50);
  assert.equal(controls["load-older-messages"].hidden, true);
});

test("a failed initial history read can be retried", async () => {
  const { window, controls, rows } = await setup(125, backend => { backend.failNext = true; });
  assert.match(controls["chat-history-status"].textContent, /Pokušaj ponovo/);
  await window.loadOlderMessages();
  await window.loadOlderMessages();
  assert.equal(rows.length, 100);
});

test("clearing the local view invalidates an in-flight page but keeps live messages working", async () => {
  const { window, backend, rows, context, chatMessages, controls } = await setup();
  context.navigator = { userAgent: "test" };
  Object.defineProperty(chatMessages, "innerHTML", { set() { rows.length = 0; } });
  vm.runInContext(source.slice(source.indexOf("function handleCommand(text)"), source.indexOf("// FIREBASE LISTENERS")), context);
  backend.pauseNext = true;
  const request = window.loadOlderMessages();
  context.handleCommand("/clear");
  backend.resume();
  await request;
  assert.equal(rows.length, 0);
  assert.equal(controls["chat-history-controls"].hidden, true);
  backend.add();
  assert.equal(rows.length, 1);
});
