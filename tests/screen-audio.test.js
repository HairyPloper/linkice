const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "rtc.js"), "utf8");
const owner = 234567;
const screenUid = 1000000000 + owner;

function track() {
  return {
    events: {}, calls: [],
    on(name, handler) { this.events[name] = handler; },
    setVolume(value) { this.calls.push(["volume", value]); },
    play() { this.calls.push(["play"]); },
    stop() { this.calls.push(["stop"]); },
    close() { this.calls.push(["close"]); },
    async setPlaybackDevice(value) { this.calls.push(["device", value]); },
  };
}

function setup(storage) {
  const clients = [];
  const screenButton = { classList: { add() {}, remove() {} } };
  const visibility = [];
  const videos = [];
  const video = track();
  const audio = track();
  const window = {
    isVoiceJoined: true, APP_ID: "test", CHANNEL: "test", uidNameMap: {},
    addEventListener() {},
    setScreenAudioAvailable: (...args) => visibility.push(args),
    playVideoInCard: (...args) => videos.push(args),
    removeVideoFromCard: (uid) => videos.push([uid, null]),
    getDisplayName: () => "Test user", _playTone() {},
  };
  const sdk = {
    async createScreenVideoTrack() { return [video, audio]; },
    createClient() {
      const client = {
        uid: 123456, remoteUsers: [], events: {}, published: [], subscribed: [], left: 0,
        on(name, handler) { this.events[name] = handler; },
        async join(_app, _channel, _token, uid) { this.uid = uid; },
        async publish(tracks) { this.published.push(tracks); },
        async subscribe(user, type) { this.subscribed.push([user.uid, type]); },
        async leave() { this.left++; },
      };
      clients.push(client);
      return client;
    },
  };
  const context = vm.createContext({
    window, AgoraRTC: sdk, console: { ...console, error() {}, warn() {} },
    localStorage: storage || { getItem: () => "speaker-1" },
    document: {
      addEventListener() {},
      getElementById: (id) => id === "screen-btn" ? screenButton : null,
    },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
  });
  if (storage) {
    const utils = fs.readFileSync(path.join(__dirname, "..", "js", "utils.js"), "utf8");
    vm.runInContext(utils.slice(utils.indexOf("window.browserPreferences ="), utils.indexOf("window.uidNameMap =")), context);
  }
  vm.runInContext(source, context);
  return { window, context, clients, sdk, screenButton, visibility, videos, video, audio };
}

function enableMic(context) {
  context.mic = { async setEnabled() {}, getVolumeLevel: () => 0 };
  context.firebase = { database: () => ({ ref: () => ({ update() {} }) }) };
  vm.runInContext("localTracks.audioTrack = mic;", context);
}

test("deafen silences cached voice and screen tracks without changing saved gains", async () => {
  const { window, context, clients } = setup();
  enableMic(context);
  const voice = { uid: owner, audioTrack: track() };
  const screen = { uid: screenUid, audioTrack: track() };
  clients[0].remoteUsers.push(voice, screen);
  await clients[0].events["user-published"](voice, "audio");
  await clients[0].events["user-published"](screen, "audio");
  window.adjustVolume(owner, 0);
  window.adjustScreenVolume(owner, 61);
  window.setWatchedScreen(owner);
  const voiceAudio = voice.audioTrack;
  const screenAudio = screen.audioTrack;
  delete voice.audioTrack;
  delete screen.audioTrack;
  await window.toggleDeafen();
  assert.deepEqual(voiceAudio.calls.at(-1), ["volume", 0]);
  assert.deepEqual(screenAudio.calls.at(-1), ["volume", 0]);
  window.adjustVolume(owner, 37);
  window.adjustScreenVolume(owner, 73);
  window.restoreParticipantVolume(owner, "Alice");
  window.setWatchedScreen(null);
  window.setWatchedScreen(owner);
  assert.deepEqual(voiceAudio.calls.at(-1), ["volume", 0]);
  assert.deepEqual(screenAudio.calls.at(-1), ["volume", 0]);
  await window.toggleDeafen();
  assert.deepEqual(voiceAudio.calls.at(-1), ["volume", 37]);
  assert.deepEqual(screenAudio.calls.at(-1), ["volume", 73]);
  window.adjustVolume(owner, 0);
  await window.toggleDeafen();
  window.setWatchedScreen(null);
  await window.toggleDeafen();
  assert.deepEqual(voiceAudio.calls.at(-1), ["volume", 0]);
  assert.deepEqual(screenAudio.calls.at(-1), ["volume", 0], "screen previews remain silent after undeafen");
});

test("new voice and screen audio stay silent when they arrive while deafened", async () => {
  const { window, context, clients } = setup();
  enableMic(context);
  await window.toggleDeafen();
  window.setWatchedScreen(owner);
  for (const uid of [owner, screenUid]) {
    const user = { uid, audioTrack: track() };
    clients[0].remoteUsers.push(user);
    await clients[0].events["user-published"](user, "audio");
    assert.deepEqual(user.audioTrack.calls[0], ["volume", 0]);
    assert.deepEqual(user.audioTrack.calls.at(-1), ["play"]);
  }
  await window.toggleDeafen();
  assert.deepEqual(clients[0].remoteUsers[0].audioTrack.calls.at(-1), ["volume", 100]);
  assert.deepEqual(clients[0].remoteUsers[1].audioTrack.calls.at(-1), ["volume", 18]);
});

test("deafening during asynchronous speaker selection silences the track before playback", async () => {
  const { window, context, clients } = setup();
  enableMic(context);
  const user = { uid: owner, audioTrack: track() };
  let finish;
  user.audioTrack.setPlaybackDevice = () => new Promise(resolve => { finish = resolve; });
  clients[0].remoteUsers.push(user);
  const subscribing = clients[0].events["user-published"](user, "audio");
  await new Promise(setImmediate);
  await window.toggleDeafen();
  finish();
  await subscribing;
  assert.deepEqual(user.audioTrack.calls.at(-2), ["volume", 0]);
  assert.deepEqual(user.audioTrack.calls.at(-1), ["play"]);
});

test("name preferences survive reload and new UIDs, including zero and separate screen gain", async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const first = setup(storage);
  first.window.restoreParticipantVolume(owner, " Alice ");
  first.window.adjustVolume(owner, 0);
  first.window.adjustScreenVolume(owner, 63);
  const { window, clients } = setup(storage);
  const newUid = 345678;
  window.restoreParticipantVolume(newUid, "ALICE");
  assert.equal(window.getRemoteVolume(newUid), 0);
  assert.equal(window.getRemoteVolume(newUid, "screen"), 63);
  const voice = { uid: newUid, audioTrack: track() };
  clients[0].remoteUsers.push(voice);
  await clients[0].events["user-published"](voice, "audio");
  assert.deepEqual(voice.audioTrack.calls[0], ["volume", 0]);
  window.restoreParticipantVolume(newUid, "Bob");
  assert.equal(window.getRemoteVolume(newUid), 100);
  assert.equal(window.getRemoteVolume(newUid, "screen"), 18);
  window.restoreParticipantVolume(456789, "alice");
  assert.equal(window.getRemoteVolume(456789), 0);
});

test("late presence applies saved gain to playing audio and storage failures remain harmless", async () => {
  const values = new Map([["linkice:volume:alice:voice", "22"]]);
  const { window, clients } = setup({ getItem: key => values.get(key) ?? null, setItem() { throw new Error("blocked"); } });
  const voice = { uid: owner, audioTrack: track() };
  clients[0].remoteUsers.push(voice);
  await clients[0].events["user-published"](voice, "audio");
  window.restoreParticipantVolume(owner, "Alice");
  assert.deepEqual(voice.audioTrack.calls.at(-1), ["volume", 22]);
  window.adjustVolume(owner, 48);
  assert.equal(window.getRemoteVolume(owner), 48);
  for (const bad of ["broken", "null", '"20"', "-1", "101", "{}"] ) {
    values.set("linkice:volume:bob:voice", bad);
    window.restoreParticipantVolume(345678, "Bob");
    assert.equal(window.getRemoteVolume(345678), 100);
  }
  const blocked = setup({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } });
  blocked.window.restoreParticipantVolume(owner, "Alice");
  blocked.window.adjustVolume(owner, 37);
  assert.equal(blocked.window.getRemoteVolume(owner), 37);
});

test("output switching reaches voice and cached screen tracks and reports failures", async () => {
  const { window, clients } = setup();
  const voice = { uid: owner, audioTrack: track() };
  const screen = { uid: screenUid, audioTrack: track() };
  clients[0].remoteUsers.push(voice, screen);
  await clients[0].events["user-published"](screen, "audio");
  // Subscription tracks can outlive or differ from the SDK user object's track.
  const screenAudio = screen.audioTrack;
  delete screen.audioTrack;
  assert.equal(await window.applySpeakerDevice("headset"), true);
  assert.deepEqual(voice.audioTrack.calls.at(-1), ["device", "headset"]);
  assert.deepEqual(screenAudio.calls.at(-1), ["device", "headset"]);
  voice.audioTrack.setPlaybackDevice = async () => { throw new Error("device unplugged"); };
  assert.equal(await window.applySpeakerDevice("gone"), false);
});

test("new audio uses the active output; a failed saved output falls back before playback", async () => {
  const { window, clients } = setup();
  const voice = { uid: owner, audioTrack: track() };
  window.getSpeakerDevice = () => "headset";
  clients[0].remoteUsers.push(voice);
  voice.audioTrack.setPlaybackDevice = async device => {
    voice.audioTrack.calls.push(["device", device]);
    if (device === "headset") throw new Error("unplugged");
  };
  await clients[0].events["user-published"](voice, "audio");
  assert.deepEqual(voice.audioTrack.calls, [["volume", 100], ["device", "headset"], ["device", "default"], ["play"]]);
});

test("saved microphone is used at capture and only missing devices fall back to default", async () => {
  const { window, sdk } = setup();
  const calls = [];
  const saved = [];
  window.readAudioDevice = () => "preferred-mic";
  window.saveAudioDevice = (...args) => saved.push(args);
  window.audioSettings = { aec: false, agc: true, ans: false };
  const mic = track();
  sdk.createMicrophoneAudioTrack = async options => { calls.push(options); return mic; };
  assert.equal(await window.createPreferredMicrophone(), mic);
  assert.equal(calls[0].microphoneId, "preferred-mic");
  assert.equal(calls[0].AEC, false);
  assert.equal(calls[0].ANS, false);
  sdk.createMicrophoneAudioTrack = async options => {
    calls.push(options);
    if (options.microphoneId) throw { code: "DEVICE_NOT_FOUND" };
    return mic;
  };
  assert.equal(await window.createPreferredMicrophone(), mic);
  assert.equal(calls.at(-1).microphoneId, undefined);
  assert.deepEqual(saved, [["microphone", "default"]]);
  calls.length = 0;
  sdk.createMicrophoneAudioTrack = async options => { calls.push(options); throw { code: "PERMISSION_DENIED" }; };
  await assert.rejects(window.createPreferredMicrophone(), error => error.code === "PERMISSION_DENIED");
  assert.equal(calls.length, 1, "permission denial must not trigger a second capture request");
});

test("switching microphone preserves a muted track and ignores a result after leaving", async () => {
  const { window, context } = setup();
  const mic = { enabled: false, devices: [], async setDevice(id) { this.devices.push(id); } };
  context.mic = mic;
  vm.runInContext("localTracks.audioTrack = mic; isMuted = true;", context);
  assert.equal(await window.switchMicrophone("mic-2"), true);
  assert.equal(mic.enabled, false);
  assert.deepEqual(mic.devices, ["mic-2"]);
  let finish;
  mic.setDevice = () => new Promise(resolve => { finish = resolve; });
  const changing = window.switchMicrophone("mic-3");
  assert.equal(await window.switchMicrophone("mic-4"), false, "concurrent switches are ignored");
  vm.runInContext("localTracks.audioTrack = null;", context);
  window.isVoiceJoined = false;
  finish();
  assert.equal(await changing, false);
});

test("voice and screen volumes are independent, with gain set before playback", async () => {
  const { window, clients, visibility } = setup();
  const voice = { uid: owner, audioTrack: track() };
  const screen = { uid: screenUid, audioTrack: track() };
  clients[0].remoteUsers = [voice, screen];
  await clients[0].events["user-published"](voice, "audio");
  await clients[0].events["user-published"](screen, "audio");
  assert.deepEqual(voice.audioTrack.calls[0], ["volume", 100]);
  assert.deepEqual(screen.audioTrack.calls.slice(0, 3), [["volume", 0], ["device", "speaker-1"], ["play"]]);
  window.adjustVolume(owner, 0);
  assert.deepEqual(voice.audioTrack.calls.at(-1), ["volume", 0]);
  assert.deepEqual(screen.audioTrack.calls.at(-1), ["play"]);
  window.setWatchedScreen(owner);
  assert.deepEqual(screen.audioTrack.calls.at(-1), ["volume", 18]);
  window.adjustScreenVolume(owner, 65);
  assert.deepEqual(screen.audioTrack.calls.at(-1), ["volume", 65]);
  assert.deepEqual(voice.audioTrack.calls.at(-1), ["volume", 0]);
  assert.deepEqual(visibility.at(-1), [owner, true, true]);
});

test("screen restart restores its slider value and never resets the voice volume", async () => {
  const { window, clients, visibility } = setup();
  const screen = { uid: screenUid, audioTrack: track() };
  clients[0].remoteUsers = [screen];
  await clients[0].events["user-published"](screen, "audio");
  window.adjustScreenVolume(owner, 0);
  window.adjustVolume(owner, 42);
  clients[0].events["user-unpublished"](screen, "audio");
  assert.deepEqual(visibility.at(-1), [owner, false, false]);
  clients[0].events["user-left"](screen);
  screen.audioTrack = track();
  await clients[0].events["user-published"](screen, "audio");
  assert.deepEqual(screen.audioTrack.calls[0], ["volume", 0]);
  assert.equal(window.getRemoteVolume(owner), 42);
});

test("late participant card receives cached screen tracks; video-only share keeps its audio row visible but unavailable", async () => {
  const { window, clients, videos, visibility } = setup();
  const screen = { uid: screenUid, videoTrack: track() };
  clients[0].remoteUsers = [screen];
  await clients[0].events["user-published"](screen, "video");
  window.syncScreenShareCard(String(owner));
  assert.deepEqual(videos.at(-1), [String(owner), screen.videoTrack]);
  assert.deepEqual(visibility.at(-1), [String(owner), false, true]);
  clients[0].events["user-left"](screen);
  assert.deepEqual(videos.at(-1), [owner, null]);
});

test("screen publisher is excluded from participants, AFK occupancy and own playback", async () => {
  const { window, context, clients } = setup();
  const selfScreen = { uid: 1000000000 + clients[0].uid, audioTrack: track() };
  clients[0].remoteUsers = [selfScreen];
  await clients[0].events["user-joined"](selfScreen);
  await clients[0].events["user-published"](selfScreen, "audio");
  assert.equal(clients[0].subscribed.length, 0);
  assert.equal(context.isSoloInVoiceChannel(), true);
  assert.equal(window.getAfkStatus().solo, true);
  clients[0].remoteUsers.push({ uid: owner });
  assert.equal(context.isSoloInVoiceChannel(), false);
});

test("screen publisher owns both capture tracks and stopping does not leave voice", async () => {
  const { window, clients, screenButton, video, audio, context, videos } = setup();
  const badges = [];
  window.setLocalScreenSharing = (...args) => badges.push(args);
  await screenButton.onclick();
  assert.deepEqual(badges.at(-1), [123456, true]);
  assert.equal(videos.length, 0, "the sharer must not see a local screen preview");
  window.syncScreenShareCard(123456);
  assert.deepEqual(badges.at(-1), [123456, true]);
  assert.equal(clients.length, 2);
  assert.equal(clients[0].published.length, 0);
  assert.equal(clients[1].uid, 1000000000 + clients[0].uid);
  assert.equal(clients[1].published[0][0], video);
  assert.equal(clients[1].published[0][1], audio);
  assert.equal(clients[1].subscribed.length, 0);
  await Promise.all([context.stopScreenShare(), context.stopScreenShare()]);
  assert.equal(clients[0].left, 0);
  assert.equal(clients[1].left, 1);
  assert.deepEqual(video.calls, [["stop"], ["close"]]);
  assert.deepEqual(audio.calls, [["stop"], ["close"]]);
  assert.deepEqual(badges.at(-1), [123456, false]);
});

test("publish failure cleans up screen resources and permits another attempt", async () => {
  const { clients, sdk, screenButton, video, audio } = setup();
  const create = sdk.createClient;
  sdk.createClient = () => {
    const client = create();
    client.publish = async () => { throw new Error("publish failed"); };
    return client;
  };
  await screenButton.onclick();
  assert.equal(clients[1].left, 1);
  assert.deepEqual(video.calls.at(-1), ["close"]);
  assert.deepEqual(audio.calls.at(-1), ["close"]);
  assert.equal(screenButton.disabled, false);
  sdk.createClient = create;
  await screenButton.onclick();
  assert.equal(clients[2].published.length, 1);
});

test("leaving during the capture picker returns immediately and closes its eventual tracks", async () => {
  const { context, window, sdk, clients, screenButton, video, audio } = setup();
  let resolveCapture;
  sdk.createScreenVideoTrack = () => new Promise((resolve) => { resolveCapture = resolve; });
  const starting = screenButton.onclick();
  window.isVoiceJoined = false;
  await context.stopScreenShare();
  resolveCapture([video, audio]);
  await starting;
  assert.equal(clients.length, 1);
  assert.deepEqual(video.calls, [["stop"], ["close"]]);
  assert.deepEqual(audio.calls, [["stop"], ["close"]]);
});

test("a remote leave overtaking subscription cannot resurrect playback", async () => {
  const { clients } = setup();
  const screen = { uid: screenUid, audioTrack: track() };
  clients[0].remoteUsers = [screen];
  let finishSubscription;
  clients[0].subscribe = () => new Promise((resolve) => { finishSubscription = resolve; });
  const pending = clients[0].events["user-published"](screen, "audio");
  clients[0].remoteUsers = [];
  clients[0].events["user-left"](screen);
  finishSubscription();
  await pending;
  assert.equal(screen.audioTrack.calls.length, 0);
});

test("subscription return tracks are routed by UID even when SDK user objects differ", async () => {
  const { clients, visibility, videos } = setup();
  const audio = track();
  const video = track();
  clients[0].remoteUsers = [{ uid: String(screenUid) }];
  clients[0].subscribe = async (_user, type) => type === "audio" ? audio : video;
  await clients[0].events["user-published"]({ uid: screenUid }, "audio");
  await clients[0].events["user-published"]({ uid: screenUid }, "video");
  assert.deepEqual(visibility.at(-1), [owner, true, true]);
  assert.deepEqual(videos.at(-1), [owner, video]);
  assert.deepEqual(audio.calls[0], ["volume", 0]);
});

test("unsupported speaker selection cannot hide the screen slider or prevent playback", async () => {
  const { clients, visibility } = setup();
  const audio = track();
  audio.setPlaybackDevice = () => { throw new Error("NOT_SUPPORTED"); };
  const screen = { uid: screenUid, audioTrack: audio };
  clients[0].remoteUsers = [screen];
  await clients[0].events["user-published"](screen, "audio");
  assert.deepEqual(visibility.at(-1), [owner, true, true]);
  assert.deepEqual(audio.calls.at(-1), ["play"]);
});

test("an audio subscription failure is diagnosed while screen video still renders", async () => {
  const { window, clients, videos } = setup();
  const video = track();
  const screen = { uid: screenUid, hasAudio: true, hasVideo: true, videoTrack: video };
  clients[0].remoteUsers = [screen];
  clients[0].subscribe = async (_user, type) => {
    if (type === "audio") throw Object.assign(new Error("subscription failed"), { code: "TEST_FAILURE" });
    return video;
  };
  await clients[0].events["user-published"](screen, "audio");
  await clients[0].events["user-published"](screen, "video");
  assert.deepEqual(videos.at(-1), [owner, video]);
  const status = window.getScreenShareStatus().users[0];
  assert.equal(status.audioError, "TEST_FAILURE");
  assert.equal(status.receivedScreenVideo, true);
  clients[0].subscribe = async () => track();
  await clients[0].events["user-published"](screen, "audio");
  assert.equal(window.getScreenShareStatus().users[0].audioError, null);
});

test("unpublish invalidates an in-flight subscription even while the user stays connected", async () => {
  const { clients, visibility } = setup();
  const audio = track();
  const screen = { uid: screenUid, audioTrack: audio };
  clients[0].remoteUsers = [screen];
  let complete;
  clients[0].subscribe = () => new Promise((resolve) => { complete = resolve; });
  const pending = clients[0].events["user-published"](screen, "audio");
  clients[0].events["user-unpublished"](screen, "audio");
  complete(audio);
  await pending;
  assert.deepEqual(visibility.at(-1), [owner, false, false]);
  assert.equal(audio.calls.length, 0);
});

test("participant count excludes local and remote screen publishers", () => {
  const { window, clients } = setup();
  clients[0].remoteUsers = [{uid:owner}, {uid:screenUid}, {uid:1000123456}];
  assert.equal(window.getVoiceParticipantCount(), 2);
  window.isVoiceJoined = false;
  assert.equal(window.getVoiceParticipantCount(), 0);
});

test("screen audio can arrive after video and disappear without hiding the sharing row", async () => {
  const { clients, visibility } = setup();
  const screen = { uid: screenUid, videoTrack: track(), audioTrack: track() };
  clients[0].remoteUsers = [screen];
  await clients[0].events["user-published"](screen, "video");
  assert.deepEqual(visibility.at(-1), [owner, false, true]);
  await clients[0].events["user-published"](screen, "audio");
  assert.deepEqual(visibility.at(-1), [owner, true, true]);
  clients[0].events["user-unpublished"](screen, "audio");
  assert.deepEqual(visibility.at(-1), [owner, false, true]);
  clients[0].events["user-unpublished"](screen, "video");
  assert.deepEqual(visibility.at(-1), [owner, false, false]);
});

test("video-only capture informs the sharer without stopping the screen", async () => {
  const { window, sdk, video, screenButton, clients } = setup();
  const messages = [];
  sdk.createScreenVideoTrack = async () => video;
  window.appendMessage = (...args) => messages.push(args);
  await screenButton.onclick();
  assert.equal(clients[1].published[0], video);
  assert.equal(clients[1].left, 0);
  assert.match(messages[0][1], /bez zvuka/);
});

test("only the watched screen is audible; closing and video unpublish mute without changing saved levels", async () => {
  const {window, clients} = setup();
  const first = {uid:screenUid, audioTrack:track()};
  const second = {uid:1000345678, audioTrack:track()};
  clients[0].remoteUsers = [first, second];
  for (const screen of [first, second]) await clients[0].events["user-published"](screen, "audio");
  window.adjustScreenVolume(owner, 64);
  assert.deepEqual(first.audioTrack.calls.at(-1), ["volume", 0]);
  window.setWatchedScreen(owner);
  assert.deepEqual(first.audioTrack.calls.at(-1), ["volume", 64]);
  assert.deepEqual(second.audioTrack.calls.at(-1), ["volume", 0]);
  window.setWatchedScreen(345678);
  assert.deepEqual(first.audioTrack.calls.at(-1), ["volume", 0]);
  assert.deepEqual(second.audioTrack.calls.at(-1), ["volume", 18]);
  window.setWatchedScreen(null);
  assert.deepEqual(second.audioTrack.calls.at(-1), ["volume", 0]);
  window.setWatchedScreen(owner);
  clients[0].events["user-unpublished"](first, "video");
  assert.deepEqual(first.audioTrack.calls.at(-1), ["volume", 0]);
  assert.equal(window.getRemoteVolume(owner, "screen"), 64);
});

test("screen audio arriving after fullscreen opens uses the viewer's saved volume", async () => {
  const {window, clients} = setup();
  window.adjustScreenVolume(owner, 57);
  window.setWatchedScreen(owner);
  const screen = {uid:screenUid, audioTrack:track()};
  clients[0].remoteUsers = [screen];
  await clients[0].events["user-published"](screen, "audio");
  assert.deepEqual(screen.audioTrack.calls[0], ["volume", 57]);
  clients[0].events["user-left"](screen);
  assert.equal(window.getScreenShareStatus().watchedScreenUid, null);
});
