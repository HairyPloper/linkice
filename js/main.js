/**
 * js/main.js
 * App initialisation and global variables.
 * Runs first — all other scripts depend on the values set here.
 */

// ============================================================
// AGORA APP ID
// Public identifier for the Agora project (no secret required client-side)
// ============================================================
window.APP_ID = "beb2d2e844954540847d8bf07648926e";

// ============================================================
// USERNAME
// Read an optional ?name= query parameter, fall back to "Gost" (Guest).
// A random 4-digit suffix is appended to avoid collisions when multiple
// users share the same base name.
// e.g. ?name=Marko  →  "Marko_4271"
// ============================================================
const params   = new URLSearchParams(window.location.search);
let   baseName = params.get("name") || "Gost";
window.myUsername = `${baseName}_${Math.floor(10000 + Math.random() * 9000)}`;

// ============================================================
// WAKE LOCK
// Holds a WakeLockSentinel when active, preventing the screen from
// sleeping during a call. Managed in rtc.js.
// ============================================================
window.wakeLock = null;

// ============================================================
// AVATAR POOL
// Each participant is assigned a random animal emoji as their avatar icon.
// New entries can be added here without changing any other code.
// ============================================================
window.animals = [
  "🦁", "🦊", "🐨", "🐘", "🐯", "🐼", "🐙", "🦉", "🐸", "🦓",
  "🦄", "🐝", "🦒", "🦘", "🦥", "🦔", "🐇", "🐈", "🐕", "🐒",
  "🦍", "🦌", "🦬", "🐄", "🐳", "🐬", "🦈", "🐡", "🐢", "🦞",
  "🦀", "🐧", "🦜", "🦆", "🦅", "🦚", "🦋", "🐞", "🦂", "🐜",
];

// Pick one animal at random for this session
window.myIcon = window.animals[Math.floor(Math.random() * window.animals.length)];