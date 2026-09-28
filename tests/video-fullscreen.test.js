const assert = require("node:assert/strict");
const test = require("node:test");
const setup = require("./helpers/screen-ui");

test("fullscreen denial never enables screen audio", async () => {
  const {start, watched, warnings} = setup();
  const {wrapper} = start();
  wrapper.requestFullscreen = async () => {throw new Error("not granted");};
  await wrapper.fire("click");
  assert.deepEqual(watched, []);
  assert.equal(warnings.length, 1);
});

test("fullscreen entry enables its stream; Escape disables audio and hides controls", async () => {
  const {start, watched, document} = setup();
  const {wrapper, panel} = start();
  assert.equal(panel.hidden, true);
  await wrapper.fire("click");
  assert.equal(watched.at(-1), "234567");
  assert.equal(panel.hidden, false);
  await document.exitFullscreen();
  assert.equal(watched.at(-1), null);
  assert.equal(panel.hidden, true);
});

test("controls reveal near the bottom and hide after one second, but not while dragging", async () => {
  const {start, document, timers, tick} = setup();
  const {wrapper, panel} = start();
  await wrapper.fire("click");
  assert.equal([...timers.values()][0].delay, 1000);
  tick();
  assert.equal(panel.classList.contains("visible"), false);
  await wrapper.fire("pointermove", {clientY:100});
  assert.equal(panel.classList.contains("visible"), false);
  await wrapper.fire("pointermove", {clientY:850});
  assert.equal(panel.classList.contains("visible"), true);
  await panel.fire("pointerdown");
  tick();
  assert.equal(panel.classList.contains("visible"), true);
  await document.fire("pointerup");
  tick();
  assert.equal(panel.classList.contains("visible"), false);
});

test("slider input and keyboard focus preserve fullscreen and update only screen volume", async () => {
  const {start, document, adjusted, tick} = setup();
  const {wrapper, panel, input, output} = start();
  await wrapper.fire("click");
  input.value = "65";
  await input.fire("input");
  assert.deepEqual(adjusted.at(-1), [234567, "65"]);
  assert.equal(output.textContent, "65%");
  input.keyboardFocus = true;
  tick();
  assert.equal(panel.classList.contains("visible"), true);
  await panel.fire("click");
  assert.equal(document.fullscreenElement, wrapper);
});

test("presence refresh keeps playing video; removing a watched share clears audio and timers", async () => {
  const {window, start, track, watched, timers, document} = setup();
  const {wrapper} = start();
  await wrapper.fire("click");
  window.playVideoInCard(234567, track);
  assert.equal(track.calls.length, 1);
  window.removeVideoFromCard(234567);
  assert.equal(watched.at(-1), null);
  assert.equal(timers.size, 0);
  assert.equal(document.getElementById("video-wrapper-234567"), null);
});

test("local sharing uses a badge and never replaces or plays over the avatar", () => {
  const {window, track, document} = setup();
  window.playVideoInCard(123456, track);
  window.setLocalScreenSharing(123456, true);
  const card = document.getElementById("user-123456");
  assert.equal(card.querySelector(".sharing-badge").textContent, "🖥 Deliš ekran");
  assert.equal(card.querySelector(".video-container"), null);
  assert.notEqual(card.querySelector(".avatar").style.display, "none");
  assert.equal(track.calls.length, 0);
  window.setLocalScreenSharing(123456, false);
  assert.equal(card.querySelector(".sharing-badge"), null);
});
