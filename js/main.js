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
const queryName     = params.get("name");
const savedUsername = localStorage.getItem("savedUsername");
// Separate numeric ID purely for Agora — never exposed to users
window.myAgoraUID = Math.floor(100000 + Math.random() * 900000);
// Display name priority: URL param → saved → random guest
if (queryName) {
  window.myDisplayName = queryName;
  localStorage.setItem("savedUsername", queryName);
} else if (savedUsername) {
  window.myDisplayName = savedUsername;
} else {
  window.myDisplayName = `Gost_${Math.floor(10000 + Math.random() * 9000)}`;
  localStorage.setItem("savedUsername", window.myDisplayName);
}


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