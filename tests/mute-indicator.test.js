const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const rtc = fs.readFileSync(path.join(__dirname, "..", "js", "rtc.js"), "utf8");
const ui = fs.readFileSync(path.join(__dirname, "..", "js", "ui.js"), "utf8");

function setup(level = 0.8) {
  const elements = new Map();
  const timers = new Map();
  let timerId = 0;
  function avatar(uid) {
    const classes = new Set();
    const element = { classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
    } };
    elements.set(`avatar-${uid}`, element);
    return classes;
  }
  const self = avatar(123456);
  const remote = avatar(234567);
  const client = {
    uid: 123456, remoteUsers: [{ uid: 234567, hasAudio: true }], handlers: {},
    on(name, handler) { this.handlers[name] = handler; },
  };
  const presenceUpdates = [];
  const mic = { level, getVolumeLevel() { return this.level; }, async setEnabled() {} };
  const context = vm.createContext({
    mic, console: { ...console, error() {} },
    window: { addEventListener() {}, CHANNEL: "test", isVoiceJoined: true },
    document: { addEventListener() {}, getElementById: (id) => elements.get(id) },
    AgoraRTC: { createClient: () => client },
    firebase: { database: () => ({ ref: () => ({ update: (data) => presenceUpdates.push(data) }) }) },
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn) => { timers.set(++timerId, fn); return timerId; },
    clearInterval: (id) => timers.delete(id),
  });
  vm.runInContext(rtc, context);
  const start = ui.indexOf("window.setUserMuted =");
  vm.runInContext(ui.slice(start, ui.indexOf("// ============================================================", start)), context);
  vm.runInContext("localTracks.audioTrack = mic; startLocalVolumeMonitor(mic);", context);
  return { context, client, mic, self, remote, timers, presenceUpdates, window: context.window };
}

test("mute clears local speaking immediately and ignores all SDK local UID forms", async () => {
  const { window, client, mic, self, timers } = setup();
  assert.equal(self.has("speaking"), true);
  let finish;
  mic.setEnabled = () => new Promise((resolve) => { finish = resolve; });
  const muting = window.toggleMute();
  assert.equal(self.has("speaking"), false);
  assert.equal(timers.size, 0);
  for (const uid of [0, "0", 123456, "123456", 1000123456]) {
    client.handlers["volume-indicator"]([{ uid, level: 100 }]);
    assert.equal(self.has("speaking"), false);
  }
  finish();
  await muting;
  assert.equal(self.has("muted"), true);

  mic.setEnabled = async () => {};
  await window.toggleMute();
  assert.equal(self.has("muted"), false);
  assert.equal(self.has("speaking"), true);
  client.handlers["volume-indicator"]([{ uid: 0, level: 0 }]);
  assert.equal(self.has("speaking"), true, "SDK silence must not overwrite the local microphone monitor");
});

test("remote mute clears the glow and pending silence timer and blocks stale loud samples", () => {
  const { window, client, remote, timers } = setup();
  const volume = (level) => client.handlers["volume-indicator"]([{ uid: 234567, level }]);
  volume(100);
  assert.equal(remote.has("speaking"), true);
  volume(0);
  const beforeMute = timers.size;
  window.setUserMuted(234567, true);
  assert.equal(timers.size, beforeMute - 1);
  assert.equal(remote.has("speaking"), false);
  volume(100);
  assert.equal(remote.has("speaking"), false);
  window.setUserMuted(234567, false);
  volume(100);
  assert.equal(remote.has("speaking"), true);
  client.remoteUsers[0].hasAudio = false;
  volume(100);
  assert.equal(remote.has("speaking"), false);
});

test("screen audio does not light its owner's voice avatar; unpublish clears remote voice", () => {
  const { client, remote } = setup();
  client.handlers["volume-indicator"]([{ uid: 1000234567, level: 100 }]);
  assert.equal(remote.has("speaking"), false);
  client.handlers["volume-indicator"]([{ uid: 234567, level: 100 }]);
  assert.equal(remote.has("speaking"), true);
  client.handlers["user-unpublished"]({ uid: 234567 }, "audio");
  assert.equal(remote.has("speaking"), false);
});

test("failed mute restores the active microphone monitor without announcing a mute", async () => {
  const { window, mic, self, presenceUpdates } = setup();
  mic.setEnabled = async () => { throw new Error("mute failed"); };
  await window.toggleMute();
  assert.equal(self.has("speaking"), true);
  assert.equal(self.has("muted"), false);
  assert.equal(presenceUpdates.length, 0);
});

test("rapid mute clicks do not race microphone enable calls", async () => {
  const { window, mic, self } = setup();
  let finish;
  let calls = 0;
  mic.setEnabled = () => { calls++; return new Promise((resolve) => { finish = resolve; }); };
  const first = window.toggleMute();
  await window.toggleMute();
  assert.equal(calls, 1);
  finish();
  await first;
  assert.equal(self.has("muted"), true);
  assert.equal(self.has("speaking"), false);
});

test("faint input at join stays quiet on the new SDK meter; speech still lights the avatar", () => {
  // The previous 0.08 threshold incorrectly treated each of these as speech.
  for (const level of [0, 0.1, 0.2, 0.4, 0.59, 0.6]) {
    const { self, mic, timers } = setup(level);
    assert.equal(self.has("speaking"), false, `noise level ${level}`);
    mic.level = 0.75;
    [...timers.values()].forEach((tick) => tick());
    assert.equal(self.has("speaking"), true);
  }
});

test("browser-reported hardware mute or disabled input overrides stale high meter readings", () => {
  for (const state of [{ muted: true }, { enabled: false }, { readyState: "ended" }]) {
    const { self, mic, timers } = setup();
    assert.equal(self.has("speaking"), true);
    mic.getMediaStreamTrack = () => state;
    [...timers.values()].forEach((tick) => tick());
    assert.equal(self.has("speaking"), false);
    mic.getMediaStreamTrack = () => ({ muted: false, enabled: true, readyState: "live" });
    [...timers.values()].forEach((tick) => tick());
    assert.equal(self.has("speaking"), true);
  }
});

test("remote meter noise below the documented speech threshold stays quiet", () => {
  const { client, remote } = setup();
  for (const level of [0, 10, 20, 40, 59, 60]) {
    client.handlers["volume-indicator"]([{ uid: 234567, level }]);
    assert.equal(remote.has("speaking"), false);
  }
  client.handlers["volume-indicator"]([{ uid: 234567, level: 75 }]);
  assert.equal(remote.has("speaking"), true);
});

test("leaving during a pending mute does not restore UI or write stale presence", async () => {
  const { context, window, mic, presenceUpdates, timers } = setup();
  let complete;
  mic.setEnabled = () => new Promise(resolve => { complete = resolve; });
  const pending = window.toggleMute();
  vm.runInContext("localTracks.audioTrack = null; isMuted = false; window.client.uid = undefined;", context);
  complete();
  await pending;
  assert.equal(presenceUpdates.length, 0);
  assert.equal(timers.size, 0);
  assert.equal(vm.runInContext("isMuted", context), false);
});
