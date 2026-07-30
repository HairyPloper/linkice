const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const rtcSource = fs.readFileSync(path.join(__dirname, "..", "js", "rtc.js"), "utf8");

function sourceBetween(start, end) {
  const startIndex = rtcSource.indexOf(start);
  const endIndex = rtcSource.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return rtcSource.slice(startIndex, endIndex);
}

function createFakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();

  function schedule(callback, delay, interval) {
    const id = nextId++;
    timers.set(id, { callback, at: now + delay, interval });
    return id;
  }

  function advance(milliseconds) {
    const target = now + milliseconds;
    while (true) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;

      const [id, timer] = due;
      now = timer.at;
      if (timer.interval === null) timers.delete(id);
      else timer.at += timer.interval;
      timer.callback();
    }
    now = target;
  }

  return {
    Date: { now: () => now },
    setTimeout: (callback, delay) => schedule(callback, delay, null),
    clearTimeout: (id) => timers.delete(id),
    setInterval: (callback, delay) => schedule(callback, delay, delay),
    clearInterval: (id) => timers.delete(id),
    advance,
  };
}

test("speech after the five-minute AFK warning postpones disconnect", () => {
  const clock = createFakeClock();
  const messages = [];
  let disconnects = 0;
  const listeners = new Map();
  const context = vm.createContext({
    ...clock,
    console,
    leaveChannel: async (reason) => {
      assert.equal(reason, "afk");
      disconnects++;
    },
    window: {
      APP_CONFIG: { afkTimeoutMs: 10 * 60_000, afkWarningMs: 5 * 60_000 },
      isVoiceJoined: true,
      client: { remoteUsers: [] },
      addEventListener() {},
      appendMessage: (_author, message) => messages.push(message),
    },
    document: {
      hidden: false,
      addEventListener(name, handler) { listeners.set(name, handler); },
    },
  });

  vm.runInContext(sourceBetween("const configuredAfkTimeout", "// SHARED HELPER"), context);
  context.startAfkTimer();
  clock.advance(5 * 60_000);
  assert.equal(messages.length, 1);

  context.markAfkActivity();
  clock.advance(5 * 60_000);
  assert.equal(disconnects, 0);

  clock.advance(5 * 60_000);
  assert.equal(disconnects, 1);
});

test("AFK stays disabled while another Agora user is connected", () => {
  const clock = createFakeClock();
  const messages = [];
  let disconnects = 0;
  const context = vm.createContext({
    ...clock,
    console,
    leaveChannel: async () => { disconnects++; },
    window: {
      APP_CONFIG: { afkTimeoutMs: 10 * 60_000, afkWarningMs: 5 * 60_000 },
      isVoiceJoined: true,
      client: { remoteUsers: [{ uid: 456 }] },
      addEventListener() {},
      appendMessage: (_author, message) => messages.push(message),
    },
    document: {
      hidden: false,
      addEventListener() {},
    },
  });

  vm.runInContext(sourceBetween("const configuredAfkTimeout", "// SHARED HELPER"), context);
  context.startAfkTimer();
  clock.advance(30 * 60_000);

  assert.equal(messages.length, 0);
  assert.equal(disconnects, 0);

  context.window.client.remoteUsers = [];
  context.syncAfkTimerWithOccupancy({ leavingUid: 456 });
  clock.advance(5 * 60_000);
  assert.equal(messages.length, 1);
  clock.advance(5 * 60_000);
  assert.equal(disconnects, 1);
});

test("local speech uses Agora track volume without an AudioContext", () => {
  const clock = createFakeClock();
  let activityCount = 0;
  const classes = new Set();
  const avatar = {
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
  };
  const context = vm.createContext({
    ...clock,
    console,
    window: { client: { uid: 123 } },
    document: { getElementById: () => avatar },
  });

  const monitorSource = sourceBetween("function stopLocalVolumeMonitor", "// SCREEN SHARE");
  vm.runInContext(`
    let localVolumeMonitor = null;
    let isMuted = false;
    const LOCAL_TRACK_SPEAKING_THRESHOLD = 0.08;
    const LOCAL_VOLUME_POLL_MS = 250;
    function markAfkActivity() { globalThis.activityCount++; }
    ${monitorSource}
  `, context);
  context.activityCount = activityCount;

  let level = 0;
  context.startLocalVolumeMonitor({ getVolumeLevel: () => level });
  level = 0.2;
  clock.advance(250);

  assert.equal(context.activityCount, 1);
  assert.equal(classes.has("speaking"), true);
  assert.equal("AudioContext" in context, false);
});
