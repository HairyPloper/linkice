const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(require("node:path").join(__dirname, "../js/chat.js"), "utf8");
const start = source.indexOf("if (chatContainer && dragHandle) {");
const end = source.indexOf("// AI BOT", start);
function classes() {
  const items = new Set();
  return {
    contains: key => items.has(key),
    toggle(key, force = !items.has(key)) { force ? items.add(key) : items.delete(key); },
  };
}
function setup(saved, width = 1200) {
  let stored = saved;
  const events = {};
  const panel = {
    style: {}, classList: classes(), offsetWidth: 580,
    get offsetHeight() { return this.classList.contains("collapsed") ? 50 : 750; },
    get offsetTop() { return parseFloat(this.style.top) || 80; },
    get offsetLeft() { return parseFloat(this.style.left) || 0; },
  };
  const handle = {};
  const settings = { classList: classes() };
  const document = { getElementById: () => null };
  const window = {
    innerWidth: width, innerHeight: 900,
    addEventListener: (name, fn) => { events[name] = fn; },
    browserPreferences: { read: () => stored, write: (_key, value) => { stored = value; } },
  };
  vm.runInNewContext(source.slice(start, end), {
    window, document, chatContainer: panel, dragHandle: handle, settingsBtn: settings,
  });
  return { window, document, panel, handle, settings, events, saved: () => stored };
}

test("chat restores collapse and clamps saved desktop positions on restore and resize", () => {
  const app = setup({ left: 2000, top: 1200, collapsed: true });
  assert.equal(app.panel.style.left, "620px");
  assert.equal(app.panel.style.top, "850px");
  assert.equal(app.settings.classList.contains("hidden"), true);
  app.handle.onclick();
  assert.equal(app.panel.style.top, "150px");
  assert.equal(app.saved().collapsed, false);
  app.window.innerWidth = 800;
  app.events.resize();
  assert.equal(app.panel.style.left, "220px");
});

test("drag position persists across reload; mobile preserves its responsive layout", () => {
  const app = setup(null);
  app.handle.onmousedown({ button: 0, clientX: 0, clientY: 0 });
  app.document.onmousemove({ clientX: 100, clientY: 20 });
  app.document.onmouseup();
  app.handle.onclick();
  assert.equal(app.saved().left, 100);
  assert.equal(app.saved().top, 100);
  assert.equal(app.saved().collapsed, false);
  const restored = setup(app.saved());
  assert.equal(restored.panel.style.left, "100px");
  const mobile = setup(app.saved(), 390);
  assert.deepEqual(mobile.panel.style, {});
  mobile.handle.onclick();
  assert.equal(mobile.saved().left, 100);
  assert.equal(mobile.saved().collapsed, true);
});

test("malformed positions leave the default layout intact", () => {
  for (const saved of [null, {}, { left: "200", top: 10 }, { left: Infinity, top: 0 }]) {
    assert.deepEqual(setup(saved).panel.style, {});
  }
});
