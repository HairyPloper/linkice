const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const main = fs.readFileSync(path.join(__dirname, "..", "js", "main.js"), "utf8");
const source = main.slice(main.indexOf("window.supportsSpeakerSelection ="));

function setup(userAgent, supportsSink = true, saved = "removed-device") {
  const controls = new Map();
  const select = { options:[{}], value:"default", style:{display:"none"}, appendChild(option) { this.options.push(option); } };
  controls.set("speaker-select", select);
  for (const id of ["speaker-label", "speaker-hr"]) controls.set(id, {style:{display:"none"}});
  controls.set("audio-device-status", { textContent: "" });
  controls.set("microphone-label", { style: { display: "none" } });
  const microphone = { options: [{}], value: "default", style: { display: "none" }, appendChild(option) { this.options.push(option); } };
  controls.set("microphone-select", microphone);
  const calls = [];
  const applied = [];
  const storage = new Map([["speaker-device", saved]]);
  const micTrack = { getMediaStreamTrack: () => ({ getSettings: () => ({ deviceId: "mic-1" }) }) };
  const context = vm.createContext({
    navigator:{userAgent},
    HTMLMediaElement: {prototype:supportsSink ? {setSinkId() {}} : {}},
    console: {warn() {}},
    window:{isVoiceJoined:true, client:{remoteUsers:[]}, getMicrophoneTrack: () => micTrack,
      applySpeakerDevice: async device => { applied.push(device); return true; },
      switchMicrophone: async device => { applied.push(device); return true; }},
    document:{getElementById:id=>controls.get(id),createElement:()=>({})},
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    AgoraRTC:{getPlaybackDevices:async skip=>{calls.push(skip);return [{deviceId:"default",label:"Default output"}, {deviceId:"headset",label:"Headset"}];},
      getMicrophones: async skip => { calls.push(["microphones", skip]); return [{deviceId:"mic-1",label:"Mic 1"},{deviceId:"mic-2",label:"Mic 2"}]; }},
  });
  vm.runInContext(source, context);
  return {context, calls, select, microphone, storage, applied, controls};
}

test("Firefox, Safari and mobile do not show unsupported Agora speaker selection", async () => {
  for (const ua of ["Mozilla Firefox/143.0", "Version/26.0 Safari/605.1.15", "Android Chrome/140.0", "iPhone CriOS/140.0"]) {
    const {context,calls,select} = setup(ua);
    await context.loadSpeakers();
    assert.equal(context.window.supportsSpeakerSelection(), false, ua);
    assert.equal(calls.length, 0);
    assert.equal(select.style.display,"none");
  }
});

test("Chrome enumerates after join without opening a second microphone request", async () => {
  const {context,calls,select} = setup("Windows Chrome/140.0 Safari/537.36");
  await context.loadSpeakers();
  assert.deepEqual(calls,[true]);
  assert.equal(select.style.display,"block");
  assert.equal(select.value,"default", "a removed saved device must not blank the selection");
  assert.equal(select.options.length, 2, "only one default option is shown");
});

test("saved and newly chosen outputs are applied; failed switches roll back without saving", async () => {
  const { context, select, storage, applied } = setup("Windows Chrome/140.0", true, "headset");
  await context.loadSpeakers();
  assert.equal(select.value, "headset");
  assert.deepEqual(applied, ["headset"]);
  select.value = "default";
  await select.onchange();
  assert.equal(storage.get("speaker-device"), "default");
  context.window.applySpeakerDevice = async device => { applied.push(device); return device !== "headset"; };
  select.value = "headset";
  await select.onchange();
  assert.equal(storage.get("speaker-device"), "default");
  assert.equal(select.value, "default");
  assert.equal(context.window.getSpeakerDevice(), "default");
  assert.deepEqual(applied.slice(-2), ["headset", "default"]);
});

test("removed output preferences are corrected for all future tracks", async () => {
  const { context, storage, applied } = setup("Windows Chrome/140.0");
  await context.loadSpeakers();
  assert.equal(storage.get("speaker-device"), "default");
  assert.equal(context.window.getSpeakerDevice(), "default");
  assert.deepEqual(applied, ["default"]);
});

test("microphone picker is available on Chrome, Edge, Firefox, Safari and mobile", async () => {
  for (const ua of ["Windows Chrome/140.0", "Windows Edg/140.0", "Firefox/143.0", "Version/26.0 Safari/605.1.15", "Android Chrome/140.0", "iPhone CriOS/140.0"]) {
    const { context, microphone, storage, applied } = setup(ua);
    await context.loadMicrophones();
    assert.equal(microphone.style.display, "block", ua);
    microphone.value = "mic-2";
    await microphone.onchange();
    assert.equal(storage.get("microphone-device"), "mic-2", ua);
    assert.equal(applied.at(-1), "mic-2", ua);
    context.window.switchMicrophone = async () => false;
    microphone.value = "mic-1";
    await microphone.onchange();
    assert.equal(microphone.value, "mic-2", ua);
    assert.equal(storage.get("microphone-device"), "mic-2", ua);
  }
});

test("default microphone selection works when the browser only exposes concrete IDs", async () => {
  const { context, microphone, storage, applied } = setup("Firefox/143.0");
  await context.loadMicrophones();
  microphone.value = "default";
  await microphone.onchange();
  assert.equal(applied.at(-1), "mic-1");
  assert.equal(storage.get("microphone-device"), "default");
});

test("leaving during microphone selection never saves a stale result or restores controls", async () => {
  const { context, microphone, storage } = setup("Windows Chrome/140.0");
  await context.loadMicrophones();
  let finish;
  context.window.switchMicrophone = () => new Promise(resolve => { finish = resolve; });
  microphone.value = "mic-2";
  const changing = microphone.onchange();
  context.window.isVoiceJoined = false;
  context.window.hideAudioDevices();
  finish(true);
  await changing;
  assert.equal(storage.has("microphone-device"), false);
  assert.equal(microphone.style.display, "none");
});

test("enumeration failure and a leave during enumeration keep the call controls usable", async () => {
  const {context,select} = setup("Windows Chrome/140.0");
  context.AgoraRTC.getPlaybackDevices = async () => { throw new Error("device unavailable"); };
  await context.loadSpeakers();
  assert.equal(select.style.display,"none");
  context.AgoraRTC.getPlaybackDevices = async () => {
    context.window.isVoiceJoined = false;
    return [{deviceId:"default"}];
  };
  await context.loadSpeakers();
  assert.equal(select.style.display,"none");
});
