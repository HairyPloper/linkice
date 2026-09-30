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

function createResolverContext(presence) {
  let reads = 0;
  const context = vm.createContext({
    console,
    setTimeout(callback) {
      callback();
      return 1;
    },
    firebase: {
      database() {
        return {
          ref() {
            return {
              async once() {
                reads++;
                return { val: () => presence };
              },
            };
          },
        };
      },
    },
    window: {
      CHANNEL: "test-room",
      animals: ["fox"],
      uidNameMap: {},
    },
  });

  vm.runInContext(
    sourceBetween("async function resolveRemoteName", "function stopLocalVolumeMonitor"),
    context,
  );

  return { context, getReads: () => reads };
}

test("a stale Agora UID without Firebase presence is not given a random avatar", async () => {
  const { context, getReads } = createResolverContext(null);

  const identity = await context.resolveRemoteName(123456);

  assert.equal(identity, null);
  assert.equal(getReads(), 3);
  assert.equal(context.window.uidNameMap[123456], undefined);
});

test("chat-only presence is not rendered as a voice participant", async () => {
  const { context } = createResolverContext({
    displayName: "Pospani Obrok",
    icon: "fox",
    voiceJoined: false,
  });

  assert.equal(await context.resolveRemoteName(123456), null);
});

test("user-joined draws only an Agora user verified by voice presence", async () => {
  const handlers = new Map();
  const drawn = [];
  const messages = [];
  const tones = [];
  const occupancyChanges = [];
  let nextIdentity = null;

  const context = vm.createContext({
    console,
    isDeafened: false,
    resolveRemoteName: async () => nextIdentity,
    syncAfkTimerWithOccupancy: (change) => occupancyChanges.push(change),
    window: {
      client: {
        uid: 999999,
        on(event, handler) {
          handlers.set(event, handler);
        },
      },
      drawUser: (...args) => drawn.push(args),
      appendMessage: (...args) => messages.push(args),
      _playTone: (...args) => tones.push(args),
    },
  });

  vm.runInContext(
    sourceBetween('window.client.on("user-joined"', "const speakingTimers"),
    context,
  );

  await handlers.get("user-joined")({ uid: 123456 });
  assert.equal(drawn.length, 0);
  assert.equal(messages.length, 0);
  assert.equal(tones.length, 0);
  assert.equal(occupancyChanges.length, 0);

  nextIdentity = { name: "Pospani Obrok", icon: "fox" };
  await handlers.get("user-joined")({ uid: 654321 });
  assert.deepEqual(drawn[0], [654321, "Pospani Obrok", "fox", false]);
  assert.equal(messages.length, 1);
  assert.equal(tones.length, 1);
  assert.equal(occupancyChanges.length, 1);
  context.isDeafened = true;
  await handlers.get("user-joined")({ uid: 765432 });
  assert.equal(drawn.length, 2);
  assert.equal(tones.length, 1, "joining participants do not play a tone while deafened");
});
