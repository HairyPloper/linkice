const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const main = fs.readFileSync(path.join(__dirname, "..", "js", "main.js"), "utf8");
const source = main.slice(main.indexOf("window.supportsSpeakerSelection ="));

function setup(userAgent, supportsSink = true) {
  const controls = new Map();
  const select = { options:[{}], value:"default", style:{display:"none"}, appendChild(option) { this.options.push(option); } };
  controls.set("speaker-select", select);
  for (const id of ["speaker-label", "speaker-hr"]) controls.set(id, {style:{display:"none"}});
  const calls = [];
  const context = vm.createContext({
    navigator:{userAgent},
    HTMLMediaElement: {prototype:supportsSink ? {setSinkId() {}} : {}},
    console: {warn() {}},
    window:{isVoiceJoined:true, client:{remoteUsers:[]}},
    document:{getElementById:id=>controls.get(id),createElement:()=>({})},
    localStorage:{getItem:()=>"removed-device",setItem() {}},
    AgoraRTC:{getPlaybackDevices:async skip=>{calls.push(skip);return [{deviceId:"default",label:"Default output"}];}},
  });
  vm.runInContext(source, context);
  return {context, calls, select};
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
