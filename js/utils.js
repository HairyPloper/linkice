/**
 * js/utils.js
 * Shared utility functions used across the app.
 * All functions are attached to `window` so every script can access them.
 */

// ============================================================
// AGORA USERNAME SANITISER
// Agora UIDs must match a strict character whitelist.
// This function transliterates Serbian diacritics and strips any
// remaining disallowed characters so the username can be used as an Agora UID.
// e.g. "Žarko Šešelj" → "ZharkoSheshel"
// ============================================================
window.sanitizeForAgora = (name) => {
  // Map each Serbian diacritic to its ASCII equivalent
  const map = {
    š: "sh", Š: "Sh",
    ć: "ch", Ć: "Ch",
    č: "ch", Č: "Ch",
    ž: "zh", Ž: "Zh",
    đ: "dj", Đ: "Dj",
  };

  return name
    .replace(/[šćčžđ]/gi, (m) => map[m])  // Transliterate diacritics
    .replace(/\s+/g, "")                   // Remove all whitespace
    .replace(/[^a-zA-Z0-9!#$%&()+-:;<=.>?@[\]^_{|}~,]/g, ""); // Strip anything outside Agora's allowed charset
};

// ============================================================
// DISPLAY NAME EXTRACTOR
// Agora UIDs are stored in the format "Name_1234".
// This strips the random numeric suffix to produce a readable display name.
// Falls back to a plain string conversion for numeric UIDs (remote users).
// e.g. "Marko_4271" → "Marko"  |  12345678 → "12345678"
// ============================================================
window.uidNameMap = {};
window.getDisplayName = (uid) => {
  return window.uidNameMap[uid] || String(uid);
};

// ============================================================
// WAKE LOCK
// Requests a screen wake lock to prevent the device from sleeping
// during a call. Silently no-ops on browsers that don't support the API.
// The resulting sentinel is stored on window.wakeLock so rtc.js can release it on leave.
// ============================================================
window.requestWakeLock = async () => {
  try {
    if ("wakeLock" in navigator) {
      window.wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (err) {
    // Wake lock can be denied (e.g. low battery) — not critical, so just log it
    console.error("WakeLock greška:", err);
  }
};

// ============================================================
// TONE PLAYER
// Generates a short beep using the Web Audio API.
// Used in rtc.js to play join (660 Hz) and leave (440 Hz) sounds.
// Uses an exponential gain ramp for a natural fade-out instead of a hard cut.
// ============================================================
window._playTone = (freq, duration = 0.5) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o   = ctx.createOscillator();
    const g   = ctx.createGain();

    o.frequency.value = freq;

    // Ramp gain to near-zero over `duration` seconds to avoid a click at the end
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    o.connect(g);
    g.connect(ctx.destination);

    o.start();
    o.stop(ctx.currentTime + duration);
  } catch (e) {
    console.error("AudioTone greška:", e);
  }
};

// ============================================================
// HTML ESCAPER
// Converts user-supplied strings into safe HTML entities before
// injecting them into the DOM via innerHTML, preventing XSS attacks.
// Returns an empty string for null/undefined input.
// ============================================================
window.escapeHtml = (str) => {
  if (str === null || typeof str === "undefined") return "";
  return String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g,  "&#39;");
};