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

// ============================================================
// AUDIO SETTINGS
// AEC (Acoustic Echo Cancellation), AGC (Automatic Gain Control), ANS (Active Noise Suppression).
// These are Agora microphone track options that can be toggled by the user.
// The settings are saved in localStorage so they persist across sessions.
// ============================================================
// Load saved audio settings from localStorage, default all to true
const audioSettings = {
  aec: localStorage.getItem("setting-aec") !== "false",
  agc: localStorage.getItem("setting-agc") !== "false",
  ans: localStorage.getItem("setting-ans") !== "false",
};
// Apply saved state to checkboxes
document.getElementById("setting-aec").checked = audioSettings.aec;
document.getElementById("setting-agc").checked = audioSettings.agc;
document.getElementById("setting-ans").checked = audioSettings.ans;

// Save on change
["aec", "agc", "ans"].forEach(key => {
  document.getElementById(`setting-${key}`).onchange = (e) => {
    audioSettings[key] = e.target.checked;
    localStorage.setItem(`setting-${key}`, e.target.checked);
  };
});

window.audioSettings = audioSettings;


// ============================================================
// SPEAKER SELECTION
// Agora allows selecting the output device for remote audio tracks.
// This section populates the speaker selection dropdown with available
// devices and saves the user's choice in localStorage.
// Note: Browsers require a media permission to access device labels, so we only load the speakers after the user clicks "Join Call" and grants permission.
// ============================================================
const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);

if (!isMobile) {
  document.getElementById("join-btn").addEventListener("click", async () => {
    await loadSpeakers();
  });
}

async function loadSpeakers() {
  // Browser requires a media permission before listing devices with labels
  // Joining the call grants that permission, so we call this after join click
  const devices = await AgoraRTC.getPlaybackDevices();
  if (!devices.length) return;

  const select = document.getElementById("speaker-select");

  // Clear existing options except default
  select.options.length = 1;

  devices.forEach(device => {
    const opt = document.createElement("option");
    opt.value = device.deviceId;
    opt.text  = device.label || `Zvučnik ${select.options.length}`;
    select.appendChild(opt);
  });

  // Restore saved selection
  const saved = localStorage.getItem("speaker-device");
  if (saved) select.value = saved;

  select.onchange = (e) => {
    const deviceId = e.target.value;
    localStorage.setItem("speaker-device", deviceId);
    window.client.remoteUsers.forEach(user => {
      if (user.audioTrack) user.audioTrack.setPlaybackDevice(deviceId);
    });
  };

  // Show the elements
  document.getElementById("speaker-hr").style.display    = "block";
  document.getElementById("speaker-label").style.display = "block";
  select.style.display = "block";
}