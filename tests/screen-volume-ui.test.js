const assert = require("node:assert/strict");
const test = require("node:test");
const setup = require("./helpers/screen-ui");

test("screen volume lives in the fullscreen player; voice stays on the card", async () => {
  const {window, document, start} = setup();
  const card = document.getElementById("user-234567");
  assert.equal(card.querySelector(".screen-volume-row"), null);
  assert.ok(card.querySelector(".voice-volume-row"));
  const {wrapper, panel, input, output} = start();
  window.setScreenAudioAvailable(234567, false, true);
  assert.equal(input.disabled, true);
  assert.equal(output.textContent, "Bez zvuka");
  assert.equal(panel.hidden, true);
  await wrapper.fire("click");
  assert.equal(panel.hidden, false);
  window.setScreenAudioAvailable(234567, true, true);
  assert.equal(input.disabled, false);
  assert.equal(output.textContent, "42%");
  window.setScreenAudioAvailable(234567, false, true);
  assert.equal(input.disabled, true);
  assert.equal(input.value, 42);
});
