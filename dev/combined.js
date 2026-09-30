/**
 * js/main.js
 * App initialisation and global variables.
 * Runs first — all other scripts depend on the values set here.
 */

// ============================================================
// AGORA APP ID
// Public identifier for the Agora project (no secret required client-side)
// ============================================================
//old one first new one second free
//window.APP_ID = "beb2d2e844954540847d8bf07648926e";
window.APP_ID = "a0fb9ac8d3f942488845aa6d4e931615";

window.APP_CONFIG = {
  aiProxyUrl: "https://my-proxy-vercel-kappa.vercel.app/api/gemini",
  notifyProxyUrl: "https://my-proxy-vercel-kappa.vercel.app/api/notify",
  corsProxyUrl: "https://corsproxy.io/?",
  notificationIcon: "icon-192.png",
  notificationBadge: "notification-badge.png",
  afkTimeoutMs: 30 * 60 * 1000,
  afkWarningMs: 15 * 60 * 1000,
};

// ============================================================
// PARTICIPANT IDENTITY
// URL and /nick names are saved. Anonymous funny names last for one page load;
// Firebase presence resolves active name and icon collisions per space.
// ============================================================
const params = new URLSearchParams(window.location.search);
const queryName = (params.get("name") || "").trim();
const savedUsername = (localStorage.getItem("savedUsername") || "").trim();
const savedUsernameKind = localStorage.getItem("savedUsernameKind");
const isLegacyGuest = (value) => /^Gost_\d+$/.test(value || "");

window.funnyNames = [
  "Znojava Rukica", "Ludi Crnogorac", "Velika Tiba", "Pospani Obrok",
  "Teska Stoja", "Pivska Pena", "Ljuta Paprika", "Lose Slusalice",
  "Turbo Osiguranje", "Levi Bok", "Desni Bok", "Nema Enerdzi",
  "Prokleti Tutankamon", "Konjska Glava", "Svetosavski Bal", "Dika Staka",
  "Laf Pljeska", "Kifla Sss", "Gej Krajisnik", "Shmik Shmek",
];

// Visible names may contain spaces, but identity comparisons use a compact,
// case-insensitive key ("Znojava Rukica" and "znojavarukica" are identical).
window.normalizeNickname = (value) =>
  String(value || "").replace(/\s+/g, "").toLowerCase();

// Separate numeric ID purely for Agora — never exposed to users
window.myAgoraUID = Math.floor(100000 + Math.random() * 900000);
// Display name priority: URL param → saved → generated funny name
window.isVoiceJoined = false;

let preferredName;
let usernameKind;
const hasSavedCustomName = savedUsername && (
  savedUsernameKind === "custom" ||
  (savedUsernameKind !== "generated" && !isLegacyGuest(savedUsername))
);

if (queryName) {
  preferredName = queryName;
  usernameKind = "custom";
} else if (hasSavedCustomName) {
  preferredName = savedUsername;
  usernameKind = "custom";
} else {
  preferredName = window.funnyNames[Math.floor(Math.random() * window.funnyNames.length)];
  usernameKind = "generated";
}

window.preferredDisplayName = preferredName;
window.usernameKind = usernameKind;
window.myDisplayName = preferredName;
if (usernameKind === "custom") {
  localStorage.setItem("savedUsername", preferredName);
  localStorage.setItem("savedUsernameKind", "custom");
} else {
  localStorage.removeItem("savedUsername");
  localStorage.removeItem("savedUsernameKind");
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

// Prefer the saved animal; collision checks can replace it for this space.
const savedIcon = localStorage.getItem("savedIcon");
window.myIcon = savedIcon || window.animals[Math.floor(Math.random() * window.animals.length)];
localStorage.setItem("savedIcon", window.myIcon);

function randomFrom(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function presenceValues(presence, ownUid) {
  return Object.entries(presence || {})
    .filter(([uid]) => String(uid) !== String(ownUid))
    .map(([, value]) => value)
    .filter(Boolean);
}

function pickFallbackName(usedNames) {
  const freeNames = window.funnyNames.filter(
    (name) => !usedNames.has(window.normalizeNickname(name)),
  );
  if (freeNames.length) return randomFrom(freeNames);

  const offset = Math.floor(Math.random() * 900);
  for (const base of window.funnyNames) {
    for (let numberIndex = 0; numberIndex < 900; numberIndex++) {
      const suffix = 100 + ((offset + numberIndex) % 900);
      const candidate = `${base}_${suffix}`;
      if (!usedNames.has(window.normalizeNickname(candidate))) return candidate;
    }
  }

  const fallbackBase = window.funnyNames[0];
  let extraSuffix = 1000;
  while (usedNames.has(window.normalizeNickname(`${fallbackBase}_${extraSuffix}`))) extraSuffix++;
  return `${fallbackBase}_${extraSuffix}`;
}

function pickFallbackIcon(usedIcons) {
  const freeIcons = window.animals.filter((icon) => !usedIcons.has(icon));
  if (freeIcons.length) return randomFrom(freeIcons);

  const pairCount = window.animals.length * window.animals.length;
  const offset = Math.floor(Math.random() * pairCount);
  for (let index = 0; index < pairCount; index++) {
    const pairIndex = (offset + index) % pairCount;
    const first = window.animals[Math.floor(pairIndex / window.animals.length)];
    const second = window.animals[pairIndex % window.animals.length];
    const candidate = `${first}${second}`;
    if (!usedIcons.has(candidate)) return candidate;
  }

  let pawSuffix = 1;
  while (usedIcons.has(`🐾${pawSuffix}`)) pawSuffix++;
  return `🐾${pawSuffix}`;
}

/** Keep custom names; make generated funny names and icons unique per session. */
window.selectAvailableIdentity = (presence, ownUid) => {
  const others = presenceValues(presence, ownUid);
  const usedNames = new Set(
    others
      .map((entry) => window.normalizeNickname(entry.identityKey || entry.displayName))
      .filter(Boolean),
  );
  const usedIcons = new Set(others.map((entry) => entry.icon).filter(Boolean));
  const preferred = window.preferredDisplayName;
  const generatedNameOccupied =
    window.usernameKind === "generated" &&
    usedNames.has(window.normalizeNickname(preferred));

  return {
    displayName: generatedNameOccupied ? pickFallbackName(usedNames) : preferred,
    icon: !usedIcons.has(window.myIcon) ? window.myIcon : pickFallbackIcon(usedIcons),
    temporaryName: false,
  };
};

window.applyIdentity = (identity) => {
  const previousName = window.myDisplayName;
  window.myDisplayName = identity.displayName;
  window.myIcon = identity.icon;
  localStorage.setItem("savedIcon", identity.icon);

  if (window.usernameKind === "generated") {
    window.preferredDisplayName = identity.displayName;
  }

  window.identityNotice = identity.temporaryName && identity.displayName !== previousName
    ? `Nadimak **${window.preferredDisplayName}** je zauzet u ovom prostoru. Privremeno koristiš **${identity.displayName}**.`
    : null;
};

window.identityReserved = false;

/** Reserve a chat identity before chat starts. */
window.prepareIdentityForSpace = async () => {
  try {
    await window.claimPresenceIdentity(window.myAgoraUID, { voiceJoined: false });
  } catch (error) {
    console.warn("Identity reservation failed; it will be retried after reconnecting.", error);
  }
};

/** Atomically claim a unique name and icon in this space. */
window.claimPresenceIdentity = async (
  uid,
  { voiceJoined = window.isVoiceJoined } = {},
) => {
  const presenceRef = firebase.database().ref(`presence/${window.CHANNEL}`);
  const ownPresenceRef = presenceRef.child(String(uid));
  const disconnectRegistration = ownPresenceRef.onDisconnect();

  // Register cleanup before writing presence. Otherwise a fast reload can
  // disconnect after the write but before onDisconnect is armed, leaving an
  // orphaned nickname reservation in Firebase.
  await disconnectRegistration.remove();

  let result;
  try {
    result = await presenceRef.transaction((currentPresence) => {
      const presence = { ...(currentPresence || {}) };
      const selected = window.selectAvailableIdentity(presence, uid);
      presence[String(uid)] = {
        ...(presence[String(uid)] || {}),
        displayName: selected.displayName,
        identityKey: window.normalizeNickname(selected.displayName),
        icon: selected.icon,
        voiceJoined,
        muted: voiceJoined ? (presence[String(uid)]?.muted === true) : false,
      };
      return presence;
    });
  } catch (error) {
    await disconnectRegistration.cancel().catch(() => {});
    throw error;
  }

  if (!result.committed) {
    await disconnectRegistration.cancel().catch(() => {});
    throw new Error("Identity claim was not committed.");
  }
  const claimed = result.snapshot.child(String(uid)).val();
  const selected = {
    displayName: claimed.displayName,
    icon: claimed.icon,
    temporaryName: false,
  };
  window.applyIdentity(selected);
  window.identityReserved = true;
  return selected;
};

/** Reclaim the page-level reservation after a Firebase disconnect. */
window.startIdentityConnectionMonitor = () => {
  if (window.identityConnectionMonitorStarted) return;
  window.identityConnectionMonitorStarted = true;
  let reconnectTimeout = null;

  firebase.database().ref(".info/connected").on("value", async (snapshot) => {
    if (snapshot.val() === false) {
      window.identityReserved = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (window.presencePageClosing) return;
      reconnectTimeout = setTimeout(() => firebase.database().goOnline(), 5000);
      return;
    }

    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
    if (window.identityReserved) return;

    try {
      await window.claimPresenceIdentity(window.myAgoraUID, {
        voiceJoined: window.isVoiceJoined,
      });
      window.uidNameMap[window.myAgoraUID] = window.myDisplayName;
      if (window.identityNotice && window.appendMessage) {
        window.appendMessage("Sistem", window.identityNotice, "#fbbf24");
        window.identityNotice = null;
      }
    } catch (error) {
      console.error("Presence identity could not be restored:", error);
    }
  });
};

// Mobile browsers can keep a refreshed/navigated page alive briefly. Closing
// the Firebase connection on pagehide makes the server execute the already
// armed onDisconnect removal instead of leaving the old presence session.
window.presencePageClosing = false;
window.addEventListener("pagehide", () => {
  window.presencePageClosing = true;
  window.identityReserved = false;
  firebase.database().goOffline();
});

// Restore a page returned from the back/forward cache and reclaim presence.
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  window.presencePageClosing = false;
  window.identityReserved = false;
  firebase.database().goOnline();
});

/** Change this session's display name; duplicate display names are allowed. */
window.changeNickname = async (newNick) => {
  const nickname = String(newNick || "").trim();
  if (!nickname) return false;

  const presenceRef = firebase.database().ref(`presence/${window.CHANNEL}`);
  const ownUid = window.client?.uid || window.myAgoraUID;

  const result = await presenceRef.transaction((currentPresence) => {
    const presence = { ...(currentPresence || {}) };
    presence[String(ownUid)] = {
      ...(presence[String(ownUid)] || {}),
      displayName: nickname,
      identityKey: window.normalizeNickname(nickname),
      icon: window.myIcon,
      voiceJoined: window.isVoiceJoined,
    };
    return presence;
  });
  if (!result.committed) return false;

  window.preferredDisplayName = nickname;
  window.myDisplayName = nickname;
  window.usernameKind = "custom";
  window.identityNotice = null;
  localStorage.setItem("savedUsername", nickname);
  localStorage.setItem("savedUsernameKind", "custom");
  window.uidNameMap[ownUid] = nickname;
  if (window.isVoiceJoined && window.client?.uid) {
    window.drawUser(window.client.uid, nickname, window.myIcon, true);
  }
  return true;
};

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
window.supportsSpeakerSelection = () =>
  !/iPhone|iPad|Android|Firefox|FxiOS/i.test(navigator.userAgent) &&
  /Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent) &&
  typeof HTMLMediaElement !== "undefined" &&
  typeof HTMLMediaElement.prototype.setSinkId === "function";

const audioDevicePreferences = new Map();
window.readAudioDevice = (kind) => {
  if (audioDevicePreferences.has(kind)) return audioDevicePreferences.get(kind);
  try { return localStorage.getItem(`${kind}-device`) || "default"; }
  catch { return "default"; }
};
window.saveAudioDevice = (kind, deviceId) => {
  audioDevicePreferences.set(kind, deviceId);
  try { localStorage.setItem(`${kind}-device`, deviceId); }
  catch { /* Device selection still works for this call without storage. */ }
};
window.showAudioDeviceStatus = (message = window.isVoiceJoined && !window.supportsSpeakerSelection()
  ? "Za izbor zvučnika koristi podešavanja uređaja ili desktop Chrome/Edge." : "") => {
  const status = document.getElementById("audio-device-status");
  if (status) status.textContent = message;
};
let selectedSpeaker = window.readAudioDevice("speaker");
window.getSpeakerDevice = () => selectedSpeaker;

function populateAudioDevices(select, devices, selected, fallbackLabel) {
  select.options.length = 1;
  const seen = new Set(["default"]);
  for (const device of devices) {
    if (!device.deviceId || seen.has(device.deviceId)) continue;
    seen.add(device.deviceId);
    const opt = document.createElement("option");
    opt.value = device.deviceId;
    opt.text = device.label || `${fallbackLabel} ${select.options.length}`;
    select.appendChild(opt);
  }
  select.value = seen.has(selected) ? selected : "default";
}

let audioDevicesGeneration = 0;
window.hideAudioDevices = () => {
  audioDevicesGeneration++;
  selectedSpeaker = window.readAudioDevice("speaker");
  for (const id of ["microphone-select", "microphone-label", "speaker-select", "speaker-label", "speaker-hr"]) {
    const element = document.getElementById(id);
    if (element) element.style.display = "none";
  }
  window.showAudioDeviceStatus("Izbor uređaja je dostupan nakon povezivanja.");
};

async function loadMicrophones() {
  const generation = audioDevicesGeneration;
  const track = window.getMicrophoneTrack?.();
  if (!window.isVoiceJoined || !track) return;
  try {
    const devices = await AgoraRTC.getMicrophones(true);
    if (!window.isVoiceJoined || generation !== audioDevicesGeneration || track !== window.getMicrophoneTrack()) return;
    const select = document.getElementById("microphone-select");
    if (!select || !devices.length || select.disabled) return;
    const saved = window.readAudioDevice("microphone");
    const actual = track.getMediaStreamTrack?.().getSettings?.().deviceId;
    populateAudioDevices(select, devices, saved === "default" ? "default" : actual || saved, "Mikrofon");
    let selectedMicrophone = select.value;
    select.onchange = async () => {
      const previous = selectedMicrophone;
      const deviceId = select.value;
      select.disabled = true;
      try {
        const target = deviceId === "default" && !devices.some(device => device.deviceId === "default")
          ? devices[0].deviceId : deviceId;
        if (!await window.switchMicrophone(target)) throw new Error("Microphone switch failed");
        if (generation !== audioDevicesGeneration) return;
        selectedMicrophone = deviceId;
        window.saveAudioDevice("microphone", deviceId);
        window.showAudioDeviceStatus();
      } catch (error) {
        if (generation !== audioDevicesGeneration) return;
        select.value = previous;
        window.showAudioDeviceStatus("Promena mikrofona nije uspela. Pokušaj ponovo.");
      } finally {
        select.disabled = false;
      }
    };
    select.style.display = "block";
    document.getElementById("microphone-label").style.display = "block";
  } catch (error) {
    console.warn("Microphone enumeration unavailable:", error);
  }
}

async function loadSpeakers() {
  // Run after successful join, not concurrently with microphone acquisition.
  // Agora does not support output switching on Firefox or Safari.
  if (!window.supportsSpeakerSelection()) return;
  const generation = audioDevicesGeneration;
  let devices;
  try {
    devices = await AgoraRTC.getPlaybackDevices(true);
  } catch (error) {
    console.warn("Speaker enumeration unavailable:", error);
    return;
  }
  if (!window.isVoiceJoined || generation !== audioDevicesGeneration) return;
  if (!devices.length) return;

  const select = document.getElementById("speaker-select");
  if (!select || select.disabled) return;
  populateAudioDevices(select, devices, selectedSpeaker, "Zvučnik");
  selectedSpeaker = select.value;
  select.disabled = true;
  try {
    const applied = await window.applySpeakerDevice?.(selectedSpeaker);
    if (generation !== audioDevicesGeneration) return;
    if (applied === false) {
      selectedSpeaker = select.value = "default";
      const fallback = await window.applySpeakerDevice?.("default");
      if (generation !== audioDevicesGeneration) return;
      window.showAudioDeviceStatus(fallback === false
        ? "Promena zvučnika nije uspela. Proveri audio podešavanja."
        : "Sačuvani zvučnik nije dostupan. Koristi se podrazumevani izlaz.");
    }
    window.saveAudioDevice("speaker", selectedSpeaker);
  } finally {
    select.disabled = false;
  }
  if (!window.isVoiceJoined || generation !== audioDevicesGeneration) return;

  select.onchange = async () => {
    const previous = selectedSpeaker;
    selectedSpeaker = select.value;
    select.disabled = true;
    try {
      const applied = await window.applySpeakerDevice(selectedSpeaker);
      if (generation !== audioDevicesGeneration) return;
      if (!applied) {
        selectedSpeaker = select.value = previous;
        await window.applySpeakerDevice(previous);
        if (generation !== audioDevicesGeneration) return;
        window.showAudioDeviceStatus("Promena zvučnika nije uspela. Pokušaj ponovo.");
        return;
      }
      window.saveAudioDevice("speaker", selectedSpeaker);
      window.showAudioDeviceStatus();
    } finally {
      select.disabled = false;
    }
  };

  // Show the elements
  document.getElementById("speaker-hr").style.display    = "block";
  document.getElementById("speaker-label").style.display = "block";
  select.style.display = "block";
}

window.loadAudioDevices = async () => {
  window.showAudioDeviceStatus(window.supportsSpeakerSelection()
    ? "" : "Za izbor zvučnika koristi podešavanja uređaja ili desktop Chrome/Edge.");
  await Promise.all([loadMicrophones(), loadSpeakers()]);
};
navigator.mediaDevices?.addEventListener?.("devicechange", () => {
  if (window.isVoiceJoined) void window.loadAudioDevices();
});
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
// Preferences are optional: blocked storage or malformed values must not break UI.
window.browserPreferences = {
  read(key) {
    try { return JSON.parse(localStorage.getItem(`linkice:${key}`)); }
    catch { return null; }
  },
  write(key, value) {
    try { localStorage.setItem(`linkice:${key}`, JSON.stringify(value)); }
    catch { /* Keep the current session usable when storage is unavailable. */ }
  },
  nameKey(name) {
    return typeof name === "string" ? name.normalize("NFC").trim().toLowerCase() : "";
  },
  volume(name, kind) {
    const key = this.nameKey(name);
    const value = key ? this.read(`volume:${encodeURIComponent(key)}:${kind}`) : null;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
      ? value : null;
  },
  saveVolume(name, kind, value) {
    const key = this.nameKey(name);
    if (key) this.write(`volume:${encodeURIComponent(key)}:${kind}`, value);
  },
};

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
window._sharedAudioCtx = null;

window._playTone = (freq, duration = 0.5) => {
  try {
    // Lazily create the shared context on first use (must be after a user gesture)
    if (!window._sharedAudioCtx) {
      window._sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = window._sharedAudioCtx;

    // Resume in case the context was suspended (browser autoplay policy)
    if (ctx.state === "suspended") ctx.resume();

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
/**
 * js/ui.js
 * User interface logic — video background, background music,
 */

// ============================================================
// DOM REFERENCES
// ============================================================
const bgVideo     = document.getElementById("bgVideo");
const videoToggle = document.getElementById("videoToggle");
const audio       = document.getElementById("myAudio");
const audioBtn    = document.getElementById("audioToggle");

// ============================================================
// BACKGROUND MUSIC
// Start at a low volume so it doesn't startle users on toggle
// ============================================================
if (audio) audio.volume = 0.1;

// ============================================================
// VIDEO BACKGROUND TOGGLE
// Play/pause the ambient background video and update the button icon
// ============================================================
if (videoToggle && bgVideo) {
  videoToggle.onclick = () => {
    if (bgVideo.paused) {
      bgVideo.play();
      videoToggle.innerText = "🎬"; // Playing state
    } else {
      bgVideo.pause();
      videoToggle.innerText = "🚫"; // Paused state
    }
  };
}

// ============================================================
// BACKGROUND VIDEO AUTOPLAY WARP SPEED
// Start the video at a high playback rate and slow down to normal speed.
if (bgVideo) {
  bgVideo.playbackRate = 4.0;
  bgVideo.play();

  const slowDown = setInterval(() => {
    const current = bgVideo.playbackRate;

    if (current <= 1.0) {
      bgVideo.playbackRate = 1.0;
      clearInterval(slowDown);
      return;
    }

    bgVideo.playbackRate = Math.max(1.0, current * 0.9);

  }, 100);
}

// ============================================================
// MOBILE AUTOPLAY FIX
// Covers Chrome, Firefox, Safari, Edge, Brave on mobile
// ============================================================
if (bgVideo && bgVideo.paused) {
  // Force properties before attempting play
  bgVideo.muted = true;
  bgVideo.playsInline = true; 

  const playOnInteraction = () => {
    bgVideo.play()
      .catch((err) => {
        console.warn("bg video play failed:", err);
      });
  };

  // Using 'once: true' is good, but keep it consistent across all listeners
  const events = ["touchstart", "touchend", "click", "keydown"];
  events.forEach(evt => {
    document.addEventListener(evt, playOnInteraction, { once: true });
  });
}

// ============================================================
// AUDIO TOGGLE
// Play/pause background music and reflect state via icon + CSS class
// ============================================================
if (audioBtn && audio) {
  audioBtn.onclick = () => {
    if (audio.paused) {
      audio.play();
      audioBtn.innerText = "🔊";
      audioBtn.classList.add("playing");    // Triggers pink glow style in CSS
    } else {
      audio.pause();
      audioBtn.innerText = "🎵";
      audioBtn.classList.remove("playing");
    }
  };
}


// ============================================================
// USER CARD RENDERER
// Builds and inserts a participant card into #user-grid.
// FIX: if a card already exists for this uid, update the name label
// instead of silently returning — this handles the case where the card
// was created with a raw numeric UID before the Firebase lookup completed.
// ============================================================
window.drawUser = (uid, username, icon, isMe = false) => {
  if (!isMe) window.restoreParticipantVolume?.(uid, username);
  const existing = document.getElementById(`user-${uid}`);
  if (existing) {
    // Card already exists — just patch the name label and bail out.
    // This covers the race where user-published fires before user-joined's
    // Firebase callback populates uidNameMap with the real display name.
    const nameEl = existing.querySelector(".username");
    if (nameEl) {
      nameEl.textContent = `${username}${isMe ? " (Ti)" : ""}`;
    }
    const avatarEl = existing.querySelector(".avatar");
    if (avatarEl && icon) {
      avatarEl.textContent = icon;
      avatarEl.classList.toggle("paired-icon", !window.animals.includes(icon));
    }
    window.syncScreenShareCard?.(uid);
    const slider = existing.querySelector(".voice-volume-row input");
    const output = existing.querySelector(".voice-volume-row output");
    if (slider) slider.value = window.getRemoteVolume?.(uid) ?? 100;
    if (output && slider) output.textContent = `${slider.value}%`;
    return;
  }

  // Local user keeps their pre-assigned icon; remote users get a random animal
  const displayIcon = icon || window.animals[Math.floor(Math.random() * window.animals.length)];

  const grid = document.getElementById("user-grid");
  if (!grid) return;

  // --- Card wrapper ---
  const card = document.createElement("div");
  card.id        = `user-${uid}`;
  card.className = "user-card";
  // Local user card toggles mute on click; remote cards expand the volume slider
  card.onclick = isMe
    ? () => window.toggleMute()
    : () => card.classList.toggle("active");

  // --- Avatar ---
  const avatarContainer = document.createElement("div");
  avatarContainer.className = "avatar-container";

  const avatar = document.createElement("div");
  avatar.className  = "avatar";
  avatar.id         = `avatar-${uid}`; // Used by the volume-indicator listener in rtc.js
  avatar.textContent = displayIcon;
  avatar.classList.toggle("paired-icon", !window.animals.includes(displayIcon));

  avatarContainer.appendChild(avatar);
  card.appendChild(avatarContainer);

  // --- Username label ---
  const nameDiv = document.createElement("div");
  nameDiv.className = "username";
  // textContent prevents HTML in user-provided names from being interpreted.
  nameDiv.textContent = `${username}${isMe ? " (Ti)" : ""}`;
  card.appendChild(nameDiv);

  // --- Volume slider (remote users only) ---
  if (!isMe) {
    const vc = document.createElement("div");
    vc.className = "volume-controls";
    // Stop clicks on the slider from bubbling up and toggling the card's active state
    vc.addEventListener("click", (e) => e.stopPropagation());

    const addSlider = (kind, title, adjust) => {
      const row = document.createElement("label");
      row.className = `volume-row ${kind}-volume-row`;
      const caption = document.createElement("span");
      caption.className = "volume-caption";
      const text = document.createElement("span");
      text.textContent = kind === "voice" ? "" : title;
      const value = document.createElement("output");
      const input = document.createElement("input");
      input.type = "range";
      input.className = "volume-slider";
      input.min = 0;
      input.max = 100;
      input.value = window.getRemoteVolume?.(uid, kind) ?? (kind === "screen" ? 18 : 100);
      input.setAttribute("aria-label", `${title}: ${username}`);
      value.textContent = `${input.value}%`;
      input.addEventListener("input", () => {
        value.textContent = `${input.value}%`;
        adjust(uid, input.value);
      });
      caption.append(text, value);
      row.append(caption, input);
      row.hidden = kind === "screen";
      vc.appendChild(row);
    };
    addSlider("voice", "Glas", (id, value) => window.adjustVolume(id, value));
    card.appendChild(vc);
  }

  grid.appendChild(card);
  window.syncScreenShareCard?.(uid);
};

window.setScreenAudioAvailable = (uid, available, sharing = available) => {
  const card = document.getElementById(`user-${uid}`);
  if (!card) return;
  const row = card.querySelector(".screen-volume-row");
  if (row) {
    const input = row.querySelector("input");
    input.disabled = !available;
    row.querySelector("output").textContent = available ? `${input.value}%` : "Bez zvuka";
    row.title = available ? "" : "Zvuk ekrana nije primljen. Osoba koja deli ekran treba da uključi deljenje zvuka.";
  }
  card.classList.toggle("has-screen-audio", available);
  card.classList.toggle("has-screen-share", sharing);
};

window.setLocalScreenSharing = (uid, sharing) => {
  const card = document.getElementById(`user-${uid}`);
  if (!card) return;
  let badge = card.querySelector(".sharing-badge");
  if (sharing && !badge) {
    badge = document.createElement("div");
    badge.className = "sharing-badge";
    badge.textContent = "🖥 Deliš ekran";
    badge.setAttribute("role", "status");
    card.prepend(badge);
  }
  if (!sharing) badge?.remove();
};

window.setUserMuted = (uid, muted) => {
  const avatar = document.getElementById(`avatar-${uid}`);
  if (!avatar) return;
  avatar.classList.toggle("muted", muted);
  if (muted) window.clearSpeakingIndicator?.(uid);
};

// Each remote preview owns a fullscreen panel. Audio follows the real
// fullscreen element, never the click or the requestFullscreen promise.
const screenViews = new Map();
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;

function revealScreenControls(view) {
  if (fullscreenElement() !== view.wrapper) return;
  clearTimeout(view.hideTimer);
  view.panel.classList.add("visible");
  view.hideTimer = setTimeout(() => {
    if (!view.dragging && !view.panel.querySelector(":focus-visible")) {
      view.panel.classList.remove("visible");
    }
  }, 1000);
}

function syncFullscreenScreen() {
  let watching = null;
  for (const [uid, view] of screenViews) {
    const active = fullscreenElement() === view.wrapper;
    view.panel.hidden = !active;
    view.wrapper.setAttribute("aria-label", active ? "Zatvori deljeni ekran" : "Otvori deljeni ekran");
    if (active) {
      watching = uid;
      revealScreenControls(view);
    } else {
      clearTimeout(view.hideTimer);
      view.panel.classList.remove("visible");
      view.dragging = false;
    }
  }
  window.setWatchedScreen?.(watching);
}
document.addEventListener("fullscreenchange", syncFullscreenScreen);
document.addEventListener("webkitfullscreenchange", syncFullscreenScreen);
for (const event of ["pointerup", "pointercancel"]) {
  document.addEventListener(event, () => {
    for (const view of screenViews.values()) {
      if (view.dragging) {
        view.dragging = false;
        revealScreenControls(view);
      }
    }
  });
}

window.playVideoInCard = (uid, track) => {
  // Never replace the sharer's own avatar or play their screen locally.
  if (String(uid) === String(window.client?.uid)) {
    window.setLocalScreenSharing(uid, true);
    return;
  }
  const container = document.querySelector(`#user-${uid} .avatar-container`);
  if (!container) return;
  const key = String(uid);
  let view = screenViews.get(key);
  if (view && view.wrapper.parentNode !== container) {
    window.removeVideoFromCard(uid);
    view = null;
  }
  container.querySelector(".avatar").style.display = "none";
  if (!view) {
    const wrapper = document.createElement("div");
    wrapper.id = `video-wrapper-${uid}`;
    wrapper.className = "video-container";
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "button");
    wrapper.setAttribute("aria-label", "Otvori deljeni ekran");
    wrapper.title = "Klikni za ceo ekran i zvuk";
    const media = document.createElement("div");
    media.id = `screen-media-${uid}`;
    media.className = "screen-media";
    const panel = document.createElement("div");
    panel.className = "screen-player-controls";
    panel.hidden = true;
    const row = document.createElement("label");
    row.className = "volume-row screen-volume-row";
    const caption = document.createElement("span");
    caption.className = "volume-caption";
    const title = document.createElement("span");
    title.textContent = "Jačina";
    const output = document.createElement("output");
    const input = document.createElement("input");
    input.type = "range";
    input.className = "volume-slider";
    input.min = 0;
    input.max = 100;
    input.value = window.getRemoteVolume?.(uid, "screen") ?? 18;
    input.setAttribute("aria-label", "Jačina");
    input.disabled = true;
    output.textContent = "Bez zvuka";
    caption.append(title, output);
    row.append(caption, input);
    panel.append(row);
    wrapper.append(media, panel);
    container.append(wrapper);
    view = { wrapper, media, panel, track: null, hideTimer: null, dragging: false };
    screenViews.set(key, view);

    const toggleFullscreen = async () => {
      try {
        if (fullscreenElement() === wrapper) {
          const exit = document.exitFullscreen || document.webkitExitFullscreen;
          await exit?.call(document);
        } else {
          const request = wrapper.requestFullscreen || wrapper.webkitRequestFullscreen;
          if (!request) throw new Error("Fullscreen is not supported");
          await request.call(wrapper);
        }
      } catch (error) {
        console.warn("Fullscreen unavailable:", error);
        window.appendMessage?.("Sistem", "Pregledač nije dozvolio ceo ekran. Klikni ponovo na deljeni ekran.", "#fbbf24");
      }
    };
    wrapper.onclick = (event) => {
      event.stopPropagation();
      // A touch near the bottom reveals controls without closing the stream.
      if (fullscreenElement() === wrapper && event.clientY >= wrapper.getBoundingClientRect().bottom - 120) {
        revealScreenControls(view);
        return;
      }
      return toggleFullscreen();
    };
    wrapper.addEventListener("keydown", (event) => {
      if (event.target === wrapper && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        void toggleFullscreen();
      }
    });
    wrapper.addEventListener("pointermove", (event) => {
      if (event.clientY >= wrapper.getBoundingClientRect().bottom - 120) revealScreenControls(view);
    });
    panel.addEventListener("click", (event) => event.stopPropagation());
    panel.addEventListener("pointerdown", () => {
      view.dragging = true;
      revealScreenControls(view);
    });
    panel.addEventListener("focusin", () => revealScreenControls(view));
    panel.addEventListener("focusout", () => revealScreenControls(view));
    input.addEventListener("input", () => {
      output.textContent = `${input.value}%`;
      window.adjustScreenVolume(uid, input.value);
      revealScreenControls(view);
    });
  }
  // Presence updates and audio arrivals must not restart a playing video.
  if (view.track !== track) {
    view.track = track;
    track.play(view.media.id);
  }
};

window.removeVideoFromCard = (uid) => {
  const view = screenViews.get(String(uid));
  if (view) {
    clearTimeout(view.hideTimer);
    screenViews.delete(String(uid));
    view.wrapper.remove();
    syncFullscreenScreen();
  }
  const avatar = document.querySelector(`#user-${uid} .avatar`);
  if (avatar) avatar.style.display = "flex";
};
/**
 * js/rtc.js
 * Agora WebRTC integration — handles joining/leaving the channel,
 * microphone publishing, screen sharing, volume indicators,
 * and remote user events.
 */

// ============================================================
// AGORA CLIENT
// RTC mode for real-time calls; VP8 codec for broad browser support
// ============================================================
window.client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

// ============================================================
// LOCAL STATE
// ============================================================

// Holds the local microphone track once the user joins
let localTracks = { audioTrack: null };

// Tracks whether the local mic is currently muted
let isMuted = false;
let isDeafened = false;
let mutedBeforeDeafen = false;
let muteToggleInFlight = false;
let microphoneSwitchInFlight = false;
const remoteVoiceTracks = new Map();

// A second publisher keeps screen audio separate from the microphone stream.
let screenSession = null;
const SCREEN_UID_OFFSET = 1000000000;
const DEFAULT_SCREEN_VOLUME = 18;
const remoteScreenVolumes = new Map();
const remoteScreenTracks = new Map();
const remoteMediaSubscriptions = new Map();
const remoteScreenErrors = new Map();
let watchedScreenUid = null;

// Keep subscribed previews silent. Only the fullscreen viewer opens this gate.
window.setWatchedScreen = (uid) => {
  watchedScreenUid = uid == null ? null : String(uid);
  for (const [owner, tracks] of remoteScreenTracks) {
    tracks.audio?.setVolume(getPlaybackVolume(owner, "screen"));
  }
};

// Participant IDs are six-digit numbers. Reserve a disjoint numeric range for
// their screen publishers, keeping Agora's UID type consistent across clients.
window.isScreenShareUid = (uid) => {
  const owner = Number(uid) - SCREEN_UID_OFFSET;
  return Number.isInteger(owner) && owner >= 100000 && owner <= 999999;
};
const screenOwnerUid = (uid) => Number(uid) - SCREEN_UID_OFFSET;
window.getVoiceParticipantCount = () => window.isVoiceJoined
  ? 1 + window.client.remoteUsers.filter((user) => !window.isScreenShareUid(user.uid)).length
  : 0;

// Keep the UI volume stable when Agora republishes/replaces a remote track.
const remoteVolumes = new Map();
const remotePreferenceNames = new Map();

// Agora 4.24 uses a normalized logarithmic level, not the old weighted FFT
// level. Its documented speech thresholds are 0.6 locally and 60 remotely.
// Keeping the old 0.08/8 thresholds would classify faint noise as speech.
const LOCAL_TRACK_SPEAKING_THRESHOLD = 0.6;
const LOCAL_VOLUME_POLL_MS = 250;
const REMOTE_SPEAKING_THRESHOLD = 60;
let localVolumeMonitor = null;

// ============================================================
// AFK AUTO-DISCONNECT
// Stops a voice connection from consuming Agora minutes while its user is alone.
// User interaction and local microphone speech both count as activity.
// ============================================================
const configuredAfkTimeout = Number(window.APP_CONFIG?.afkTimeoutMs);
const AFK_TIMEOUT_MS = Number.isFinite(configuredAfkTimeout) && configuredAfkTimeout > 0
  ? configuredAfkTimeout
  : 10 * 60 * 1000;
const configuredAfkWarning = Number(window.APP_CONFIG?.afkWarningMs);
const AFK_WARNING_MS = Math.min(
  Number.isFinite(configuredAfkWarning) && configuredAfkWarning >= 0
    ? configuredAfkWarning
    : 5 * 60 * 1000,
  AFK_TIMEOUT_MS,
);
const AFK_ACTIVITY_THROTTLE_MS = 1000;
const AFK_MESSAGES = {
  warning: (minutes) =>
    `Neaktivan si. Bićeš automatski isključen iz glasovnog kanala za ${minutes} minuta.`,
  disconnected:
    "Isključen si iz glasovnog kanala zbog neaktivnosti. Ni leba nije džabe",
};
let afkWarningTimer = null;
let afkDisconnectTimer = null;
let lastAfkActivityAt = Date.now();

function isSoloInVoiceChannel() {
  return !(window.client?.remoteUsers || []).some(
    (user) => !window.isScreenShareUid?.(user.uid),
  );
}

function clearAfkTimers() {
  if (afkWarningTimer) clearTimeout(afkWarningTimer);
  if (afkDisconnectTimer) clearTimeout(afkDisconnectTimer);
  afkWarningTimer = null;
  afkDisconnectTimer = null;
}

function scheduleAfkTimers() {
  clearAfkTimers();
  if (!window.isVoiceJoined || !isSoloInVoiceChannel()) return;

  const elapsed = Date.now() - lastAfkActivityAt;
  const warningDelay = Math.max(0, AFK_TIMEOUT_MS - AFK_WARNING_MS - elapsed);
  const disconnectDelay = Math.max(0, AFK_TIMEOUT_MS - elapsed);

  if (AFK_WARNING_MS > 0) {
    afkWarningTimer = setTimeout(() => {
      if (!window.isVoiceJoined || !isSoloInVoiceChannel()) return;
      const warningMinutes = Math.ceil(AFK_WARNING_MS / 60000);
      if (window.appendMessage) {
        window.appendMessage(
          "Sistem",
          AFK_MESSAGES.warning(warningMinutes),
          "#fbbf24",
        );
      }
    }, warningDelay);
  }

  afkDisconnectTimer = setTimeout(async () => {
    if (!window.isVoiceJoined || !isSoloInVoiceChannel()) return;
    const elapsedNow = Date.now() - lastAfkActivityAt;
    if (elapsedNow < AFK_TIMEOUT_MS) {
      scheduleAfkTimers();
      return;
    }
    try {
      await leaveChannel("afk");
    } catch (error) {
      console.error("AFK auto-disconnect failed:", error);
    }
  }, disconnectDelay);
}

function markAfkActivity() {
  if (!window.isVoiceJoined || !isSoloInVoiceChannel()) return;
  const now = Date.now();
  if (now - lastAfkActivityAt < AFK_ACTIVITY_THROTTLE_MS) return;
  lastAfkActivityAt = now;
  scheduleAfkTimers();
}

function startAfkTimer() {
  lastAfkActivityAt = Date.now();
  scheduleAfkTimers();
}

function syncAfkTimerWithOccupancy({ remoteJoined = false, leavingUid = null } = {}) {
  const remainingRemoteUsers = (window.client?.remoteUsers || []).filter(
    (user) => String(user.uid) !== String(leavingUid) && !window.isScreenShareUid?.(user.uid),
  );

  // Event ordering differs between Agora SDK releases, so use the event itself
  // instead of assuming remoteUsers has already been updated.
  if (!window.isVoiceJoined || remoteJoined || remainingRemoteUsers.length > 0) {
    clearAfkTimers();
    return;
  }

  // Becoming solo starts a fresh inactivity period.
  startAfkTimer();
}

// Read-only AFK diagnostics for testing from the browser console.
window.getAfkStatus = () => {
  const voiceJoined = window.isVoiceJoined === true;
  const solo = voiceJoined && isSoloInVoiceChannel();
  const elapsedMs = Math.max(0, Date.now() - lastAfkActivityAt);

  return {
    voiceJoined,
    solo,
    elapsedSeconds: Math.floor(elapsedMs / 1000),
    warningInSeconds: solo
      ? Math.max(0, Math.ceil((AFK_TIMEOUT_MS - AFK_WARNING_MS - elapsedMs) / 1000))
      : null,
    disconnectInSeconds: solo
      ? Math.max(0, Math.ceil((AFK_TIMEOUT_MS - elapsedMs) / 1000))
      : null,
  };
};

["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
  document.addEventListener(eventName, markAfkActivity, { passive: true });
});
document.addEventListener("scroll", markAfkActivity, { passive: true, capture: true });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) markAfkActivity();
});
window.addEventListener("focus", markAfkActivity);

// ============================================================
// SHARED HELPER — resolveRemoteName
// Returns a Promise<{name, icon} | null> for a remote Agora UID.
// Always does a fresh Firebase read so it's not affected by
// the race between user-joined and user-published.
// Result is also cached in uidNameMap for getDisplayName().
// ============================================================
async function resolveRemoteName(uid) {
  const MAX_ATTEMPTS = 3;
  const BASE_DELAY   = 200;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const snap = await firebase.database()
      .ref(`presence/${window.CHANNEL}/${uid}`)
      .once("value");

    const data = snap.val();

    if (data?.displayName && data.voiceJoined === true) {
      window.uidNameMap[uid] = data.displayName;
      const icon = data.icon || window.animals[Math.floor(Math.random() * window.animals.length)];
      return { name: data.displayName, icon };
    }

    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise(res => setTimeout(res, BASE_DELAY * Math.pow(2, attempt)));
    }
  }

  // A refreshed page can briefly see its previous Agora connection after
  // Firebase has already removed that session. Do not turn that stale UID into
  // a synthetic participant card; a valid presence event will render real users.
  delete window.uidNameMap[uid];
  return null;
}

function stopLocalVolumeMonitor() {
  document.getElementById(`avatar-${window.client.uid}`)?.classList.remove("speaking");
  if (!localVolumeMonitor) return;
  localVolumeMonitor.active = false;
  if (localVolumeMonitor.intervalId) {
    clearInterval(localVolumeMonitor.intervalId);
  }
  if (localVolumeMonitor.silenceTimer) {
    clearTimeout(localVolumeMonitor.silenceTimer);
  }
  localVolumeMonitor = null;
}

function startLocalVolumeMonitor(localAudioTrack) {
  stopLocalVolumeMonitor();
  let silenceTimer = null;
  const DEACTIVATE_DELAY = 600;
  const monitor = {
    active: true,
    intervalId: null,
    silenceTimer: null,
  };
  localVolumeMonitor = monitor;

  const tick = () => {
    if (!monitor.active) return;
    // Use Agora's track meter instead of a separate AudioContext. Browsers can
    // suspend Web Audio contexts in quiet/background tabs even while the
    // microphone track is still being published, which made real speech look
    // like AFK silence after the warning had appeared.
    const mediaTrack = localAudioTrack.getMediaStreamTrack?.();
    const inputMuted = isMuted || localAudioTrack.enabled === false ||
      localAudioTrack.muted === true || mediaTrack?.muted === true ||
      mediaTrack?.enabled === false || mediaTrack?.readyState === "ended";
    const level = inputMuted ? 0 : (Number(localAudioTrack.getVolumeLevel?.()) || 0);
    const isSpeaking = !inputMuted && level > LOCAL_TRACK_SPEAKING_THRESHOLD;
    if (isSpeaking) markAfkActivity();

    const avatar = document.getElementById(`avatar-${window.client.uid}`);
    if (!avatar) return;

    if (inputMuted) {
      // Hardware/browser mute can leave a stale nonzero SDK meter reading.
      avatar.classList.remove("speaking");
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = null;
      monitor.silenceTimer = null;
    } else if (isSpeaking) {
      avatar.classList.add("speaking");
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
        monitor.silenceTimer = null;
      }
    } else {
      // Silence — only deactivate after holdoff
      if (avatar.classList.contains("speaking") && !silenceTimer) {
        silenceTimer = setTimeout(() => {
          avatar.classList.remove("speaking");
          silenceTimer = null;
          monitor.silenceTimer = null;
        }, DEACTIVATE_DELAY);
        monitor.silenceTimer = silenceTimer;
      }
    }
  };

  tick();
  monitor.intervalId = setInterval(tick, LOCAL_VOLUME_POLL_MS);
}

// ============================================================
// SCREEN SHARE
// Toggle screen sharing on/off via the screen-btn button
// ============================================================
const screenBtn = document.getElementById("screen-btn");

// Serialize start/stop so leaving while the capture picker is open cannot
// strand a publisher or continue sharing after the voice connection is closed.
if (screenBtn) screenBtn.onclick = async () => {
  if (screenSession) {
    await stopScreenShare();
    return;
  }
  if (!window.isVoiceJoined) return;

  const session = { client: null, video: null, audio: null, cancelled: false, capturePending: true };
  screenSession = session;
  screenBtn.disabled = true;
  session.ready = (async () => {
    let result;
    try {
      result = await AgoraRTC.createScreenVideoTrack({
        encoderConfig: { width: 1920, height: 1080, frameRate: 30, bitrateMax: 4780 },
        optimizationMode: "motion",
      }, "auto");
    } finally {
      session.capturePending = false;
    }
    [session.video, session.audio] = Array.isArray(result) ? result : [result, null];
    session.video.on("track-ended", () => { void stopScreenShare(); });
    if (session.cancelled || !window.isVoiceJoined) return;

    // This client only publishes. Never subscribe here, or listeners hear
    // duplicate playback. The primary client also skips its own screen UID.
    session.client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    await session.client.join(
      window.APP_ID, window.CHANNEL, null, SCREEN_UID_OFFSET + Number(window.client.uid),
    );
    if (session.cancelled || !window.isVoiceJoined) return;
    await session.client.publish(
      session.audio ? [session.video, session.audio] : session.video,
    );
    if (session.cancelled || !window.isVoiceJoined) return;
    screenBtn.innerHTML = "<span>🖥️</span> Prekini";
    screenBtn.classList.add("active");
    session.published = true;
    window.setLocalScreenSharing?.(window.client.uid, true);
    if (!session.audio) {
      window.appendMessage?.("Sistem", "Ekran se deli bez zvuka. Za zvuk ponovo pokreni deljenje i uključi opciju „Share audio” ako je pregledač nudi.", "#fbbf24");
    }
  })();

  try {
    await session.ready;
    if (session.cancelled || !window.isVoiceJoined) await stopScreenShare();
  } catch (error) {
    console.error("Screen sharing failed:", error);
    await stopScreenShare();
  } finally {
    screenBtn.disabled = false;
  }
};

async function stopScreenShare() {
  const session = screenSession;
  if (!session) return;
  session.cancelled = true;
  // A browser capture picker cannot be cancelled programmatically. Let voice
  // leave immediately; the pending start closes any later capture result.
  if (session.capturePending) return;
  if (session.stopping) return session.stopping;
  session.stopping = (async () => {
    // Install the shared stopping promise before close can fire track-ended.
    await Promise.resolve();
    // Release captured media before waiting on a possibly disconnected SDK.
    for (const track of [session.video, session.audio]) {
      track?.stop();
      track?.close();
    }
    await session.ready.catch(() => {});
    await session.client?.leave().catch((error) => console.warn("Screen client leave failed:", error));
    window.setLocalScreenSharing?.(window.client.uid, false);
    screenSession = null;
    if (screenBtn) {
      screenBtn.innerHTML = "<span>🖥️</span> Podeli ekran";
      screenBtn.classList.remove("active");
    }
  })();
  return session.stopping;
}

// Presence can render the card after media arrives. Reapply the cached tracks
// and controls whenever the card is created or updated.
window.syncScreenShareCard = (uid) => {
  if (String(uid) === String(window.client.uid)) {
    window.setLocalScreenSharing?.(uid, !!screenSession?.published && !screenSession.cancelled);
    return;
  }
  const tracks = remoteScreenTracks.get(String(uid));
  if (tracks?.video) window.playVideoInCard(uid, tracks.video);
  window.setScreenAudioAvailable?.(uid, !!tracks?.audio, !!(tracks?.video || tracks?.audio));
};

// ============================================================
// AGORA EVENT LISTENERS
// ============================================================

const playbackDeviceChanges = new WeakMap();
window.setRemotePlaybackDevice = (track, deviceId) => {
  if (window.supportsSpeakerSelection?.() === false) return Promise.resolve(false);
  const change = (playbackDeviceChanges.get(track) || Promise.resolve()).then(async () => {
    try {
      await track.setPlaybackDevice(deviceId || "default");
      return true;
    } catch (error) {
      console.warn("Speaker selection failed:", error);
      return false;
    }
  });
  playbackDeviceChanges.set(track, change);
  return change;
};
window.applySpeakerDevice = async (deviceId) => {
  const tracks = new Set(window.client.remoteUsers.map(user => user.audioTrack).filter(Boolean));
  for (const remote of remoteScreenTracks.values()) if (remote.audio) tracks.add(remote.audio);
  const results = await Promise.all([...tracks].map(track => window.setRemotePlaybackDevice(track, deviceId)));
  return results.every(Boolean);
};

/**
 * Fired when a remote user publishes an audio or video track.
 * Subscribe through the primary client and route screen media to its owner's
 * card. Firebase presence remains responsible for creating participant cards.
 */
window.client.on("user-published", async (user, mediaType) => {
  if (mediaType !== "audio" && mediaType !== "video") return;
  const isScreen = window.isScreenShareUid(user.uid);
  const ownerUid = isScreen ? screenOwnerUid(user.uid) : user.uid;
  if (isScreen && String(ownerUid) === String(window.client.uid)) return;
  const key = `${user.uid}:${mediaType}`;
  const subscription = {};
  remoteMediaSubscriptions.set(key, subscription);
  const isCurrent = () => remoteMediaSubscriptions.get(key) === subscription;
  try {
    const subscribedTrack = await window.client.subscribe(user, mediaType);
    // Match Agora users by UID, not JavaScript object identity. Invalidate the
    // request on unpublish/leave so delayed results cannot revive old media.
    const currentUser = window.client.remoteUsers.find((remote) => String(remote.uid) === String(user.uid));
    if (!isCurrent() || !currentUser) return;
    const track = subscribedTrack || (mediaType === "audio" ? currentUser.audioTrack : currentUser.videoTrack);
    if (!track) throw new Error(`No ${mediaType} track returned after subscribing`);

    if (isScreen) {
      remoteScreenErrors.delete(key);
      const tracks = remoteScreenTracks.get(String(ownerUid)) || {};
      tracks[mediaType] = track;
      remoteScreenTracks.set(String(ownerUid), tracks);
      // Show available controls before playback or speaker selection, neither
      // of which should prevent a successfully received stream reaching the UI.
      window.syncScreenShareCard(ownerUid);
    }
    if (mediaType === "audio") {
      if (!isScreen) remoteVoiceTracks.set(String(ownerUid), track);
      const kind = isScreen ? "screen" : "voice";
      const volume = getPlaybackVolume(ownerUid, kind);
      track.setVolume(volume);
      let device = window.getSpeakerDevice?.();
      if (!device) {
        try { device = localStorage.getItem("speaker-device") || "default"; }
        catch { device = "default"; }
      }
      if (device && track.setPlaybackDevice) {
        // Firefox does not support selecting an output device in Agora. A
        // rejected device change must not interrupt playback or screen UI.
        const applied = await window.setRemotePlaybackDevice(track, device);
        if (!isCurrent()) return;
        if (!applied && device !== "default" && window.supportsSpeakerSelection?.() !== false) {
          await window.setRemotePlaybackDevice(track, "default");
          window.showAudioDeviceStatus?.("Izabrani zvučnik nije dostupan. Proveri audio podešavanja.");
        }
      }
      if (!isCurrent()) return;
      const currentVolume = getPlaybackVolume(ownerUid, kind);
      if (currentVolume !== volume) track.setVolume(currentVolume);
      track.play();
    } else if (!isScreen) {
      window.playVideoInCard(ownerUid, track);
    }
  } catch (error) {
    if (!isCurrent()) return;
    const detail = String(error?.code || error?.message || error);
    if (isScreen) remoteScreenErrors.set(key, detail);
    console.error(`Could not receive ${isScreen ? "screen " : ""}${mediaType} from ${user.uid}:`, error);
  }
});

window.client.on("user-unpublished", (user, mediaType) => {
  remoteMediaSubscriptions.delete(`${user.uid}:${mediaType}`);
  remoteScreenErrors.delete(`${user.uid}:${mediaType}`);
  const isScreen = window.isScreenShareUid(user.uid);
  const ownerUid = isScreen ? screenOwnerUid(user.uid) : user.uid;
  if (isScreen && String(ownerUid) === String(window.client.uid)) return;
  if (isScreen) {
    if (mediaType === "video" && watchedScreenUid === String(ownerUid)) window.setWatchedScreen(null);
    const tracks = remoteScreenTracks.get(String(ownerUid));
    tracks?.[mediaType]?.stop();
    if (tracks) delete tracks[mediaType];
    window.syncScreenShareCard(ownerUid);
  }
  if (!isScreen && mediaType === "audio") {
    remoteVoiceTracks.delete(String(ownerUid));
    window.clearSpeakingIndicator(ownerUid);
  }
  if (mediaType === "video") window.removeVideoFromCard(ownerUid);
});

/**
 * Fired when a remote user leaves the channel.
 * Plays a low tone and posts a system message. Firebase presence owns card
 * removal so a temporary Agora disconnect cannot hide a still-present user.
 */
window.client.on("user-left", (user) => {
  for (const mediaType of ["audio", "video"]) {
    remoteMediaSubscriptions.delete(`${user.uid}:${mediaType}`);
    remoteScreenErrors.delete(`${user.uid}:${mediaType}`);
  }
  if (window.isScreenShareUid(user.uid)) {
    const ownerUid = screenOwnerUid(user.uid);
    if (String(ownerUid) === String(window.client.uid)) return;
    if (watchedScreenUid === String(ownerUid)) window.setWatchedScreen(null);
    const tracks = remoteScreenTracks.get(String(ownerUid));
    tracks?.audio?.stop();
    tracks?.video?.stop();
    remoteScreenTracks.delete(String(ownerUid));
    window.removeVideoFromCard(ownerUid);
    window.syncScreenShareCard(ownerUid);
    return;
  }
  window.clearSpeakingIndicator(user.uid);
  const displayName = window.getDisplayName(user.uid);
  delete window.uidNameMap[user.uid];
  remoteVolumes.delete(String(user.uid));
  remoteVoiceTracks.delete(String(user.uid));
  remotePreferenceNames.delete(String(user.uid));
  remoteScreenVolumes.delete(String(user.uid));
  if (!isDeafened) window._playTone(440, 0.2); // Lower tone = departure
  if (window.appendMessage)
    window.appendMessage("Sistem", `**${displayName}** je otišao.`, "#fbbf24");

  syncAfkTimerWithOccupancy({ leavingUid: user.uid });

});

/**
 * Fired when a remote user joins the channel.
 * Resolves their display name from Firebase, caches it, draws their card,
 * and plays a higher tone to signal arrival.
 */
window.client.on("user-joined", async (user) => {
  if (window.isScreenShareUid?.(user.uid)) return;
  const identity = await resolveRemoteName(user.uid);
  if (!identity) return;

  syncAfkTimerWithOccupancy({ remoteJoined: true });
  const { name, icon } = identity;
  // Idempotent recovery path: Firebase normally creates the card, but an
  // Agora reconnect must also restore it if an earlier event removed it.
  window.drawUser(user.uid, name, icon, false);
  if (window.appendMessage)
    window.appendMessage("Sistem", `**${name}** se priključio.`, "#fbbf24");
  if (!isDeafened && user.uid !== window.client.uid) window._playTone(660, 0.1);
});

/**
 * Volume indicator — fires every 2 s with audio levels for all active speakers.
 * Adds/removes the .speaking class on avatars to drive the neon pulse animation.
 */
const speakingTimers = new Map();
const SPEAKING_LINGER_MS = 400;

window.clearSpeakingIndicator = (uid) => {
  const key = String(uid);
  if (speakingTimers.has(key)) {
    clearTimeout(speakingTimers.get(key));
    speakingTimers.delete(key);
  }
  document.getElementById(`avatar-${uid}`)?.classList.remove("speaking");
};

window.client.on("volume-indicator", (volumes) => {
  volumes.forEach((vol) => {
    if (window.isScreenShareUid(vol.uid)) return;
    // The microphone monitor exclusively owns the local indicator. Agora can
    // still report local levels while the microphone is disabled.
    const id = String(vol.uid);
    if (id === "0" || id === String(window.client.uid)) return;
    const avatar = document.getElementById(`avatar-${id}`);
    if (!avatar) return;
    const remote = window.client.remoteUsers.find((user) => String(user.uid) === id);
    if (avatar.classList.contains("muted") || remote?.hasAudio === false) {
      window.clearSpeakingIndicator(id);
      return;
    }

    if (vol.level > REMOTE_SPEAKING_THRESHOLD) {
      avatar.classList.add("speaking");
      if (speakingTimers.has(id)) {
        clearTimeout(speakingTimers.get(id));
        speakingTimers.delete(id);
      }
    } else {
      if (!speakingTimers.has(id)) {
        speakingTimers.set(id, setTimeout(() => {
          avatar.classList.remove("speaking");
          speakingTimers.delete(id);
        }, SPEAKING_LINGER_MS));
      }
    }
  });
});

//** Fired when the connection state changes (e.g. due to network issues).
// Updates the header status text and color to reflect reconnecting/disconnected states,
// and posts system messages on disconnect/reconnect events.
// Note: Agora automatically tries to reconnect, so we don't need to do anything here
// except update the UI to keep the user informed. */
window.client.on("connection-state-change", async (curState, prevState) => {
  if (curState === "DISCONNECTED" && window.isVoiceJoined && !isLeavingChannel &&
      (prevState === "RECONNECTING" || prevState === "CONNECTED")) {
    await leaveChannel("connection-lost");
  }
  const s = document.getElementById("status");
  if (!s) return;

  if (curState === "RECONNECTING") {
    s.innerText   = "⏳ Ponovno povezivanje...";
    s.style.color = "#fbbf24";
  }

  if (curState === "DISCONNECTED" && (prevState === "RECONNECTING" || prevState === "CONNECTED")) {
    s.innerText   = "Veza prekinuta";
    s.style.color = "#f87171";
  }

  if (curState === "CONNECTED" && prevState === "RECONNECTING") {
    syncVoiceControls();
    if (window.appendMessage)
      console.log("Veza obnovljena, postavljanje statusa...");
      // window.appendMessage("Sistem", "Veza je obnovljena. ✅", "#4ade80");
  }
});

// ============================================================
// JOIN
// Acquires mic, publishes audio, and updates the UI to "connected" state
// ============================================================
const joinBtn = document.getElementById("join-btn");

window.getMicrophoneTrack = () => localTracks.audioTrack;
window.createPreferredMicrophone = async () => {
  const options = {
    AEC: window.audioSettings?.aec !== false,
    AGC: window.audioSettings?.agc !== false,
    ANS: window.audioSettings?.ans !== false,
  };
  const microphoneId = window.readAudioDevice?.("microphone") || "default";
  try {
    return await AgoraRTC.createMicrophoneAudioTrack({
      ...options, ...(microphoneId !== "default" ? { microphoneId } : {}),
    });
  } catch (error) {
    // A removed device must not prevent joining; permission errors still surface.
    if (microphoneId === "default" || !/DEVICE_NOT_FOUND|CONSTRAINT_NOT_SATISFIED|NotFoundError|OverconstrainedError/.test(`${error.code} ${error.name}`)) throw error;
    const track = await AgoraRTC.createMicrophoneAudioTrack(options);
    window.saveAudioDevice?.("microphone", "default");
    window.appendMessage?.("Sistem", "Sačuvani mikrofon nije dostupan. Koristi se podrazumevani mikrofon.", "#fbbf24");
    return track;
  }
};
window.switchMicrophone = async (deviceId) => {
  const track = localTracks.audioTrack;
  if (!window.isVoiceJoined || !track || microphoneSwitchInFlight || muteToggleInFlight) return false;
  microphoneSwitchInFlight = track;
  syncVoiceControls();
  try {
    // Switch the existing track so publishing and the mute state are preserved.
    await track.setDevice(deviceId || "default");
    if (localTracks.audioTrack !== track) return false;
    if (!isMuted) startLocalVolumeMonitor(track);
    return true;
  } catch (error) {
    console.warn("Microphone selection failed:", error);
    return false;
  } finally {
    if (microphoneSwitchInFlight === track) microphoneSwitchInFlight = false;
    if (localTracks.audioTrack === track) syncVoiceControls();
  }
};

if (joinBtn) joinBtn.onclick = async () => {
  const btn = joinBtn;
  btn.disabled = true;

  try {
    // --- 1. ACQUIRE MICROPHONE ---
    let audioTrack;
    try {
      audioTrack = await window.createPreferredMicrophone();
    } catch (micErr) {
      console.error("Mikrofon nije dostupan:", micErr);

      const s = document.getElementById("status");
      if (s) {
        s.innerText = "⚠️ Mikrofon nije dostupan";
        s.style.color = "#f87171";
      }
      if (window.appendMessage)
        window.appendMessage("Sistem", "Greška: Mikrofon nije dostupan ili je odbijen.", "#ef4444");

      btn.disabled = false; 
      return; 
    }

    // --- 2. ATOMICALLY CLAIM A UNIQUE PRESENCE IDENTITY ---
    localTracks.audioTrack = audioTrack;
    window.isVoiceJoined = true;
    await window.claimPresenceIdentity(window.myAgoraUID, { voiceJoined: true });
    window.uidNameMap[window.myAgoraUID] = window.myDisplayName;
    if (window.identityNotice && window.appendMessage) {
      window.appendMessage("Sistem", window.identityNotice, "#fbbf24");
      window.identityNotice = null;
    }

    // --- 3. JOIN AGORA CHANNEL ---
    await window.client.join(window.APP_ID, window.CHANNEL, null, window.myAgoraUID);
    window.client.enableAudioVolumeIndicator();

    // --- 4. PUBLISH AUDIO TRACK ---
    startLocalVolumeMonitor(localTracks.audioTrack);
    await window.client.publish(localTracks.audioTrack);
    window.isVoiceJoined = true;
    startAfkTimer();
    void window.loadAudioDevices?.();

    // --- 5. PRESENCE IDENTITY IS NOW MARKED AS VOICE-JOINED ---
    window.uidNameMap[window.client.uid] = window.myDisplayName;
      
    if (window.appendMessage)
      window.appendMessage("Sistem", `Povezan **${window.myDisplayName}**`, "#fbbf24");

    // --- 6. UPDATE UI TO CONNECTED STATE ---
    window.drawUser(window.client.uid, window.myDisplayName, window.myIcon, true);
    window.requestWakeLock();

    btn.style.display = "none";
    const leaveBtn = document.getElementById("leave-btn");
    if (leaveBtn)  leaveBtn.style.display = "flex";
    if (screenBtn) screenBtn.style.display = "flex";
    syncVoiceControls();

    if (window.innerWidth < 768) {
      window.chatContainer.classList.add("collapsed");
      document.getElementById("settings-btn").classList.add("hidden");
    }

  } catch (e) {
    console.error(e);
    // Attempt to clean up Agora state if join/publish failed after partial success
    window.isVoiceJoined = false;
    syncVoiceControls();
    window.hideAudioDevices?.();
    window.setWatchedScreen(null);
    clearAfkTimers();
    stopLocalVolumeMonitor();
    if (localTracks.audioTrack) {
      localTracks.audioTrack.stop();
      localTracks.audioTrack.close();
      localTracks.audioTrack = null;
    }
    try { await window.client.leave(); } catch (_) {}
    try {
      await window.claimPresenceIdentity(window.myAgoraUID, { voiceJoined: false });
    } catch (presenceError) {
      console.error("Chat identity could not be restored after join failure:", presenceError);
    }

    const s = document.getElementById("status");
    if (s) { s.innerText = "Greška pri povezivanju"; s.style.color = "#f87171"; }

    btn.disabled = false;
  }
};

// ============================================================
// LEAVE CHANNEL
// Cleans up all Agora resources and resets the UI to pre-join state.
// Called by the leave button — no page reload needed.
// ============================================================
let isLeavingChannel = false;

async function leaveChannel(reason = "manual") {
  if (isLeavingChannel) return;
  isLeavingChannel = true;
  try {
    window.isVoiceJoined = false;
    syncVoiceControls();
    window.hideAudioDevices?.();
    window.setWatchedScreen(null);
    clearAfkTimers();

    // --- 1. WAKE LOCK ---
    if (window.wakeLock) {
      void window.wakeLock.release().catch((error) => console.warn("Wake lock release failed:", error));
      window.wakeLock = null;
    }

    // --- 2. LOCAL AUDIO TRACK ---
    stopLocalVolumeMonitor();
    if (localTracks.audioTrack) {
      localTracks.audioTrack.stop();
      localTracks.audioTrack.close();
      localTracks.audioTrack = null;
    }

    // --- 3. SCREEN SHARE ---
    const screenCleanup = stopScreenShare();
    if (reason === "connection-lost") void screenCleanup.catch((error) => console.warn("Screen cleanup failed:", error));
    else await screenCleanup;

    // --- 4. AGORA CLIENT and PRESENCE ---
    const voiceCleanup = window.client.leave().catch((error) => console.warn("Voice client leave failed:", error));
    if (reason !== "connection-lost") await voiceCleanup;
    // Firebase writes can wait indefinitely while offline. Local microphone
    // and UI cleanup must not wait for the presence transaction to reconnect.
    void window.claimPresenceIdentity(window.myAgoraUID, { voiceJoined: false }).catch((presenceError) => {
      console.error("Chat identity could not be preserved after leaving voice:", presenceError);
    });

    // --- 5. RESET LOCAL STATE ---
    isMuted = false;
    isDeafened = false;
    mutedBeforeDeafen = false;
    muteToggleInFlight = false;
    microphoneSwitchInFlight = false;
    remoteVoiceTracks.clear();
    syncVoiceControls();
    speakingTimers.forEach((timer) => clearTimeout(timer));
    speakingTimers.clear();
    remoteVolumes.clear();
    remotePreferenceNames.clear();
    remoteScreenVolumes.clear();
    for (const uid of remoteScreenTracks.keys()) {
      window.removeVideoFromCard(uid);
      window.setScreenAudioAvailable?.(uid, false);
    }
    remoteScreenTracks.clear();
    remoteMediaSubscriptions.clear();
    remoteScreenErrors.clear();

    // --- 6. BUTTONS ---
    const leaveBtn = document.getElementById("leave-btn");
    const joinBtn  = document.getElementById("join-btn");
    if (leaveBtn)  leaveBtn.style.display  = "none";
    if (screenBtn) screenBtn.style.display = "none";
    if (joinBtn) {
      joinBtn.style.display = "flex";
      joinBtn.disabled = false;
    }

    // --- 7. HEADER STATUS ---
    const status = document.getElementById("status");
    if (status) {
      status.innerText    = "";
      status.style.color  = "#cbd5e1";
    }

    // --- 8. CHAT — re-expand if collapsed on mobile after joining ---
    if (window.chatContainer) {
      window.chatContainer.classList.remove("collapsed");
      document.getElementById("settings-btn").classList.remove("hidden");
      //TODO: settings btn should show on mobile when not in a call, but it's currently tied to the chat header which is hidden when collapsed — consider moving it outside the chat container
    }

    // --- 9. SYSTEM MESSAGE ---
    if (window.appendMessage) {
      const leaveMessage = reason === "afk"
        ? AFK_MESSAGES.disconnected
        : reason === "connection-lost" ? "Veza je prekinuta. Možeš ponovo da se povežeš." : "Izašao si iz kanala.";
      window.appendMessage("Sistem", leaveMessage, "#fbbf24");
    }
  } finally {
    isLeavingChannel = false;
  }
}

// Wire up the leave button
const leaveBtn = document.getElementById("leave-btn");
if (leaveBtn) leaveBtn.onclick = () => leaveChannel("manual");


// ============================================================
// VOICE CONTROLS
// Deafen gates playback without overwriting individual volume preferences.
// ============================================================
function syncVoiceControls() {
  const joined = window.isVoiceJoined && !!localTracks.audioTrack;
  const busy = !!(muteToggleInFlight || microphoneSwitchInFlight);
  const mute = document.getElementById("mute-btn");
  const deafen = document.getElementById("deafen-btn");
  const row = document.getElementById("voice-controls-row");
  if (row) {
    row.hidden = !joined;
    row.style.display = joined ? "flex" : "none";
  }
  for (const [button, pressed] of [[mute, isMuted], [deafen, isDeafened]]) {
    if (!button) continue;
    button.hidden = !joined;
    button.style.display = joined ? "flex" : "none";
    button.disabled = !joined || busy || (button === mute && isDeafened);
    button.setAttribute("aria-pressed", String(pressed));
    button.setAttribute("aria-busy", String(busy));
  }
  if (mute) {
    mute.title = isDeafened ? "Prvo uključi zvuk da bi koristio mikrofon" : isMuted ? "Uključi mikrofon" : "Isključi mikrofon";
    mute.setAttribute("aria-label", mute.title);
  }
  if (deafen) {
    deafen.title = isDeafened
      ? (mutedBeforeDeafen ? "Uključi zvuk; mikrofon ostaje isključen" : "Uključi zvuk i mikrofon")
      : "Isključi zvuk i mikrofon";
    deafen.setAttribute("aria-label", deafen.title);
  }
  const muteLabel = document.getElementById("mute-label");
  const deafenLabel = document.getElementById("deafen-label");
  if (muteLabel) muteLabel.textContent = isMuted ? "Mutiran" : "Mikrofon";
  if (deafenLabel) deafenLabel.textContent = isDeafened ? "Utišan" : "Zvuk";
  if (!joined) return;
  window.setUserMuted?.(window.client.uid, isMuted);
  const status = document.getElementById("status");
  if (status) {
    status.innerText = isDeafened ? "Zvuk i mikrofon isključeni" : isMuted ? "Mikrofon isključen" : "Povezan • Live";
    status.style.color = isMuted ? "#f87171" : "#4ade80";
  }
}

function getPlaybackVolume(uid, kind = "voice") {
  if (isDeafened || (kind === "screen" && watchedScreenUid !== String(uid))) return 0;
  return window.getRemoteVolume(uid, kind);
}

function applyIncomingVolumes() {
  const voiceTracks = new Map(remoteVoiceTracks);
  for (const user of window.client.remoteUsers) {
    if (!window.isScreenShareUid(user.uid) && user.audioTrack && !voiceTracks.has(String(user.uid))) {
      voiceTracks.set(String(user.uid), user.audioTrack);
    }
  }
  for (const [uid, track] of voiceTracks) track.setVolume(getPlaybackVolume(uid));
  for (const [uid, tracks] of remoteScreenTracks) tracks.audio?.setVolume(getPlaybackVolume(uid, "screen"));
}

async function changeVoiceState(muted, deafened) {
  if (!window.isVoiceJoined || !localTracks.audioTrack || muteToggleInFlight || microphoneSwitchInFlight) return;
  const audioTrack = localTracks.audioTrack;
  const uid = window.client.uid;
  muteToggleInFlight = audioTrack;
  const wasMuted = isMuted;
  const wasDeafened = isDeafened;
  const previousMic = mutedBeforeDeafen;
  if (deafened && !wasDeafened) mutedBeforeDeafen = wasMuted;
  isMuted = muted;
  isDeafened = deafened;
  syncVoiceControls();
  applyIncomingVolumes();

  if (isMuted) {
    stopLocalVolumeMonitor();
    window.clearSpeakingIndicator(window.client.uid);
  }

  try {
    // setEnabled(false) disables microphone publishing without destroying it.
    if (isMuted !== wasMuted) await audioTrack.setEnabled(!isMuted);
  } catch (error) {
    if (localTracks.audioTrack !== audioTrack) return;
    isMuted = wasMuted;
    isDeafened = wasDeafened;
    mutedBeforeDeafen = previousMic;
    applyIncomingVolumes();
    if (!isMuted && localTracks.audioTrack) startLocalVolumeMonitor(localTracks.audioTrack);
    console.error("Microphone mute change failed:", error);
    window.appendMessage?.("Sistem", "Promena zvuka nije uspela. Pokušaj ponovo.", "#ef4444");
    return;
  } finally {
    if (muteToggleInFlight === audioTrack) muteToggleInFlight = false;
    if (localTracks.audioTrack === audioTrack) syncVoiceControls();
  }
  // A user can leave while the SDK is toggling capture. Do not restore the
  // old call's UI or write presence under an undefined/new participant UID.
  if (localTracks.audioTrack !== audioTrack) return;

  if (!isMuted && localTracks.audioTrack) {
    startLocalVolumeMonitor(localTracks.audioTrack);
  }

  // Update mute state in Firebase so remote users can see it in their UI
  Promise.resolve(firebase.database()
  .ref(`presence/${window.CHANNEL}/${uid}`)
  .update({ muted: isMuted })).catch(error => console.warn("Mute presence update failed:", error));
}

window.toggleMute = () => {
  if (isDeafened) return;
  return changeVoiceState(!isMuted, false);
};
window.toggleDeafen = () => changeVoiceState(isDeafened ? mutedBeforeDeafen : true, !isDeafened);
const muteBtn = document.getElementById("mute-btn");
const deafenBtn = document.getElementById("deafen-btn");
if (muteBtn) muteBtn.onclick = () => window.toggleMute();
if (deafenBtn) deafenBtn.onclick = () => window.toggleDeafen();

// ============================================================
// VOLUME ADJUSTMENT
// Sets the playback volume for a specific remote user (0–100)
// ============================================================
window.adjustVolume = (uid, vol) => {
  const volume = Math.max(0, Math.min(100, Number.parseInt(vol, 10) || 0));
  remoteVolumes.set(String(uid), volume);
  window.browserPreferences?.saveVolume(window.uidNameMap[uid], "voice", volume);
  const track = remoteVoiceTracks.get(String(uid)) || window.client.remoteUsers.find((u) => u.uid == uid)?.audioTrack;
  track?.setVolume(getPlaybackVolume(uid));
};

window.getRemoteVolume = (uid, kind = "voice") => {
  const volumes = kind === "screen" ? remoteScreenVolumes : remoteVolumes;
  return volumes.get(String(uid))
    ?? window.browserPreferences?.volume(window.uidNameMap?.[uid], kind)
    ?? (kind === "screen" ? DEFAULT_SCREEN_VOLUME : 100);
};

// Presence can arrive after the media track. Apply the preference then too.
window.restoreParticipantVolume = (uid, name) => {
  const previousName = remotePreferenceNames.get(String(uid));
  remotePreferenceNames.set(String(uid), name);
  window.uidNameMap[uid] = name;
  for (const [kind, volumes] of [["voice", remoteVolumes], ["screen", remoteScreenVolumes]]) {
    if (previousName && previousName !== name) volumes.delete(String(uid));
    if (!previousName && volumes.has(String(uid))) {
      window.browserPreferences?.saveVolume(name, kind, volumes.get(String(uid)));
    }
  }
  const track = remoteVoiceTracks.get(String(uid)) || window.client.remoteUsers.find((u) => String(u.uid) === String(uid))?.audioTrack;
  track?.setVolume(getPlaybackVolume(uid));
  remoteScreenTracks.get(String(uid))?.audio?.setVolume(getPlaybackVolume(uid, "screen"));
};

window.adjustScreenVolume = (uid, vol) => {
  const volume = Math.max(0, Math.min(100, Number.parseInt(vol, 10) || 0));
  remoteScreenVolumes.set(String(uid), volume);
  window.browserPreferences?.saveVolume(window.uidNameMap[uid], "screen", volume);
  remoteScreenTracks.get(String(uid))?.audio?.setVolume(getPlaybackVolume(uid, "screen"));
};

// Read-only diagnostics for cross-browser screen-share troubleshooting.
window.getScreenShareStatus = () => ({
  sdkVersion: AgoraRTC.VERSION,
  receiverVersion: "screen-audio-7",
  watchedScreenUid,
  connection: window.client.connectionState,
  users: window.client.remoteUsers.map((user) => {
    const isScreen = window.isScreenShareUid(user.uid);
    const ownerUid = isScreen ? screenOwnerUid(user.uid) : user.uid;
    const tracks = remoteScreenTracks.get(String(ownerUid));
    return {
      uid: user.uid, ownerUid, isScreen,
      publishedAudio: user.hasAudio, publishedVideo: user.hasVideo,
      receivedScreenAudio: !!tracks?.audio, receivedScreenVideo: !!tracks?.video,
      ownerCardPresent: !!document.getElementById(`user-${ownerUid}`),
      audioError: remoteScreenErrors.get(`${user.uid}:audio`) || null,
      videoError: remoteScreenErrors.get(`${user.uid}:video`) || null,
    };
  }),
});
/**
 * js/chat.js
 * Handles all chat logic: rendering messages, slash commands,
 * emoji picker, file uploads, autocomplete, drag-to-move, and AI bot.
 */

// ============================================================
// DOM REFERENCES
// ============================================================
const chatInput    = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");
const autoMenu     = document.getElementById("autocomplete-menu");
const sendBtn      = document.getElementById("send-btn");
const emojiBtn     = document.getElementById("emoji-btn");
const emojiPicker  = document.getElementById("emoji-picker");
const chatContainer = document.getElementById("chat-container");
const dragHandle   = document.getElementById("chat-drag-handle");
const uploadBtn    = document.getElementById("upload-btn");
const fileInput    = document.getElementById("file-input");
const settingsBtn  = document.getElementById("settings-btn");
const settingsMenu = document.getElementById("settings-menu");
const AI_PROXY_URL = window.APP_CONFIG?.aiProxyUrl || "https://my-proxy-vercel-kappa.vercel.app/api/gemini";
const CORS_PROXY_URL = window.APP_CONFIG?.corsProxyUrl || "https://corsproxy.io/?";

// ASCII art banner shown in chat on first load
const welcomeArt = `
<pre style="font-family: monospace; color: #805ff5; line-height: 1.2; font-size: 10px;">
 _      _____ _   _ _   _______ _____ _____ 
| |    |_   _| \\ | | | / /_   _/  __ \\  ___|
| |      | | |  \\| | |/ /  | | | /  \\/ |__  
| |      | | | . \` |    \\  | | | |   |  __| 
| |____ _| |_| |\\  | |\\  \\_| |_| \\__/\\ |___ 
\\_____/\\___/\\_| \\_\\_| \\_/\\___/ \\____/\\____/
</pre>
<small style="color: #805ff5;">/help za listu komadni</small>`;

// ============================================================
// STATE
// ============================================================

// Stores previously sent messages/commands for up/down arrow navigation
let commandHistory = [];
let historyIndex = -1;

// Expose chatContainer globally so other scripts can reference it
window.chatContainer = chatContainer;

// Tracks which autocomplete item is currently highlighted
let selectedIndex = 0;

// ============================================================
// FIREBASE AUTH
// Waits for anonymous auth before initialising the chat listener
// ============================================================
firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    // Chat users can receive push without joining voice: sync existing subscription on auth.
    if (window.notificationManager) {
      window.notificationManager.ensurePushSubscription(false).catch(() => {});
    }
    await window.prepareIdentityForSpace();
    startChat();
    startPresenceListener();
    window.startIdentityConnectionMonitor();
    if (window.identityNotice) {
      window.appendMessage("Sistem", window.identityNotice, "#fbbf24");
      window.identityNotice = null;
    }
    // Safety net: remove the skeleton loader after 5 s if no messages arrive
    setTimeout(() => {
      const skeleton = document.getElementById("chat-skeleton-loader");
      if (skeleton) skeleton.remove();
    }, 5000);
  } else {
    // Sign in anonymously — no account needed
    firebase.auth().signInAnonymously();
  }
});

// ============================================================
// SKELETON LOADER
// Show placeholder bubbles immediately while messages are loading
// ============================================================
if (chatMessages) {
  chatMessages.innerHTML = `
    <div id="chat-skeleton-loader" class="chat-loading-skeleton">
      <div class="skeleton-bubble med"></div>
      <div class="skeleton-bubble long"></div>
      <div class="skeleton-bubble short"></div>
      <div class="skeleton-bubble med"></div>
    </div>
  `;
}

// ============================================================
// MESSAGE RENDERING
// appendMessage — creates and appends a single chat bubble
// ============================================================
function getChatSenderMetadata() {
  return {
    senderSessionId: String(window.myAgoraUID),
    senderUserId: firebase.auth().currentUser?.uid || null,
  };
}

window.isOwnChatMessage = (data) => {
  if (!data) return false;

  const current = getChatSenderMetadata();
  const hasStableIdentity = !!data.senderUserId;
  const sameUser = !!(
    data.senderUserId &&
    current.senderUserId &&
    data.senderUserId === current.senderUserId
  );
  if (hasStableIdentity) return sameUser;

  // Legacy messages did not store stable sender metadata.
  return window.normalizeNickname(data.username) ===
    window.normalizeNickname(window.myDisplayName);
};

window.appendMessage = (
  name,
  text = "",
  color = "#805ff5",
  snapshotKey = null,
  data = null,
  { historical = false, before = null } = {},
) => {
  if (!chatMessages) return;
  if (snapshotKey && document.getElementById(`chat-msg-${snapshotKey}`)) return;
  const followLatest = !historical &&
    chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 60;

  // Build a HH:MM timestamp if the message carries one
  let timeString = "";
  if (data && data.timestamp) {
    const date    = new Date(data.timestamp);
    const hours   = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    timeString = `<span class="chat-time" style="font-size: 0.75rem; opacity: 0.5; margin-right: 5px;">${hours}:${minutes}</span>`;
  }

  const msgDiv = document.createElement("div");
  msgDiv.className = "chat-msg";
  if (snapshotKey) msgDiv.id = `chat-msg-${snapshotKey}`;

  // Align own messages to the right and tint them green
  const isSystem = name === "Sistem" || (data && data.username === "Sistem");
  const isMe = !isSystem && window.isOwnChatMessage(data);
  msgDiv.classList.add(isSystem ? "chat-msg--system" : isMe ? "chat-msg--own" : "chat-msg--other");
  msgDiv.style.alignSelf = isMe ? "flex-end" : "flex-start";
  if (isMe) msgDiv.style.backgroundColor = "rgba(74, 222, 128, 0.1)";

  // Coloured left/right border indicates the sender
  msgDiv.style[isMe ? "borderRight" : "borderLeft"] = `3px solid ${color}`;
  msgDiv.style.setProperty("--msg-accent", color);

  // Delegate to the appropriate renderer based on message type
  if (data && data.type === "poll") {
    renderPoll(msgDiv, snapshotKey, data, color, timeString);
  } else {
    renderStandardMessage(msgDiv, name, text, color, timeString, data);
  }

  const previousMessage = [
    ...chatMessages.querySelectorAll(".chat-msg:not(.system-msg):not(.chat-msg--system)"),
  ].pop();
  if (
    !historical && !isSystem &&
    previousMessage &&
    previousMessage.classList.contains(isMe ? "chat-msg--own" : "chat-msg--other")
  ) {
    msgDiv.classList.add("chat-msg--connected");
  }

  chatMessages.insertBefore(msgDiv, before);
  // Increment unread badge if chat is collapsed
  if (!historical && chatContainer.classList.contains("collapsed") && name !== "Sistem" && !isMe) {
    const badge = document.getElementById("unread-badge");
    if (badge) {
      const current = parseInt(badge.innerText) || 0;
      badge.innerText = current + 1;
      badge.classList.remove("hidden");
    }
  }
  if (!historical && (followLatest || isMe)) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
    const settledScrollTop = chatMessages.scrollTop;
    // Do not pull readers away from history if they scroll during media loading.
    setTimeout(() => {
      if (Math.abs(chatMessages.scrollTop - settledScrollTop) < 2) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }, 200);
  }

  return msgDiv;
};

// ============================================================
// STANDARD MESSAGE RENDERER
// Handles bot messages differently — splits question/answer visually
// ============================================================
function renderStandardMessage(msgDiv, name, text, color, timeString, data) {
  msgDiv.innerHTML = "";
  if (timeString) msgDiv.insertAdjacentHTML("beforeend", timeString);

  const nameEl = document.createElement("b");
  nameEl.style.color = color;
  nameEl.textContent = `${name}: `;
  msgDiv.appendChild(nameEl);

  const contentEl = document.createElement("span");
  msgDiv.appendChild(contentEl);

  const isBotMessage = /\bBot(?:\s*\(|$)/.test(String(name));
  if (isBotMessage) {
    const parts = String(text).split("\n");
    if (parts.length >= 2) {
      const questionEl = document.createElement("div");
      questionEl.style.cssText = "color: #fbbf24; margin-bottom: 5px;";
      questionEl.textContent = parts[0];

      const answerEl = document.createElement("div");
      answerEl.style.color = "#ffffff";
      answerEl.textContent = parts.slice(1).join("\n");

      contentEl.append(questionEl, answerEl);
      return;
    }
  }

  renderTextWithMedia(contentEl, text, data);
}

function renderTextWithMedia(container, text, data = null) {
  const value = String(text || "");
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(value)) !== null) {
    const url = match[0];
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(value.slice(lastIndex, match.index)));
    }
    const mediaElement = createMediaElement(url, data);
    container.appendChild(mediaElement);
    scheduleFileExpiry(mediaElement, url, data);
    lastIndex = match.index + url.length;
  }

  if (lastIndex < value.length) {
    container.appendChild(document.createTextNode(value.slice(lastIndex)));
  }
}

function getUrlFileName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "fajl");
  } catch (_) {
    return url.split("/").pop().split("?")[0] || "fajl";
  }
}

function getFileExtension(fileName) {
  const match = String(fileName || "").match(/\.([a-z0-9]{1,8})$/i);
  return match ? match[1].toUpperCase() : "FAJL";
}

function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size < 0) return "";
  if (size < 1024) return `${size} B`;

  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const decimals = value >= 10 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

const FILE_EXPIRY_MS = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "72h": 72 * 60 * 60 * 1000,
};

function getFileExpiry(messageData) {
  if (!messageData) return null;

  const explicitExpiry = Number(messageData.fileExpiresAt);
  if (Number.isFinite(explicitExpiry) && explicitExpiry > 0) return explicitExpiry;

  // Messages created just before fileExpiresAt was introduced can still use
  // their timestamp and the old "Dostupno 24h" text as a reliable fallback.
  const legacyMatch = String(messageData.text || "").match(/^Dostupno\s+(1h|24h|72h):/i);
  const expiryKey = messageData.fileExpiry || legacyMatch?.[1]?.toLowerCase();
  const duration = FILE_EXPIRY_MS[expiryKey];
  const createdAt = Number(messageData.timestamp);
  return duration && Number.isFinite(createdAt) ? createdAt + duration : null;
}

function isFileUploadMessage(messageData, url) {
  if (!messageData) return false;
  const hasUploadPrefix = /^Dostupno\s+(?:trajno|1h|24h|72h):\s*https?:\/\//i
    .test(String(messageData.text || ""));
  return (messageData.type === "file" || hasUploadPrefix) &&
    (!messageData.fileUrl || messageData.fileUrl === url);
}

function createExpiredFileElement(fileName, fileSize) {
  const ext = getFileExtension(fileName);
  const card = document.createElement("div");
  card.className = "media-card media-card--doc media-card--expired";
  card.setAttribute("aria-label", `${fileName}, fajl je istekao`);

  const icon = document.createElement("span");
  icon.className = "media-doc-icon";
  icon.textContent = ext.slice(0, 4);
  icon.setAttribute("aria-hidden", "true");

  const info = document.createElement("div");
  info.className = "media-doc-info";
  const name = document.createElement("span");
  name.className = "media-doc-name";
  name.textContent = fileName;
  name.title = fileName;
  const details = document.createElement("span");
  details.className = "media-doc-ext";
  details.textContent = [ext, formatFileSize(fileSize)].filter(Boolean).join(" / ");
  info.append(name, details);

  const expired = document.createElement("span");
  expired.className = "media-doc-expired";
  expired.textContent = "Istekao";
  card.append(icon, info, expired);
  return card;
}

function scheduleFileExpiry(element, url, messageData) {
  const expiresAt = getFileExpiry(messageData);
  if (!expiresAt || expiresAt <= Date.now()) return;

  setTimeout(() => {
    if (element.isConnected) {
      element.replaceWith(createMediaElement(url, messageData));
    }
  }, expiresAt - Date.now() + 100);
}

function createMediaElement(url, messageData = null) {
  const isUploadedFile = isFileUploadMessage(messageData, url);
  const fileName = isUploadedFile && messageData.fileName
    ? String(messageData.fileName)
    : getUrlFileName(url);
  const expiresAt = isUploadedFile ? getFileExpiry(messageData) : null;
  if (expiresAt && expiresAt <= Date.now()) {
    return createExpiredFileElement(fileName, messageData.fileSize);
  }

  const mimeType = isUploadedFile ? String(messageData.fileMimeType || "") : "";
  const hostedFileName = getUrlFileName(url);
  const matchesExtension = (pattern) => pattern.test(fileName) || pattern.test(hostedFileName);
  const isImage   = mimeType.startsWith("image/") || matchesExtension(/\.(jpeg|jpg|gif|png|webp)$/i);
  const isVideo   = mimeType.startsWith("video/") || matchesExtension(/\.(mp4|webm|ogg)$/i);
  const isAudio   = mimeType.startsWith("audio/") || matchesExtension(/\.(mp3|wav)$/i);
  const isDoc     = isUploadedFile || matchesExtension(/\.(zip|rar|7z|pdf|doc|docx|txt)$/i);
  const ytMatch   = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  const spotifyMatch = url.match(/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/);

  if (isImage) {
    const card = document.createElement("div");
    card.className = "media-card";

    const img = document.createElement("img");
    img.src = url;
    img.className = "media-img";
    img.addEventListener("click", () => {
      img.requestFullscreen?.() || window.open(url, "_blank", "noopener");
    });

    const link = createMediaLink(url, fileName, "media-link");
    card.append(img, link);
    return card;
  }

  if (isVideo) {
    const card = document.createElement("div");
    card.className = "media-card";

    const video = document.createElement("video");
    video.controls = true;
    video.className = "media-video";
    const source = document.createElement("source");
    source.src = url;
    video.appendChild(source);

    const link = createMediaLink(url, fileName, "media-link");
    card.append(video, link);
    return card;
  }

  if (isAudio) {
    const card = document.createElement("div");
    card.className = "media-card media-card--audio";

    const icon = document.createElement("span");
    icon.className = "media-audio-icon";
    icon.textContent = "♫";

    const info = document.createElement("div");
    info.className = "media-audio-info";
    const name = document.createElement("span");
    name.className = "media-audio-name";
    name.textContent = fileName;
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.className = "media-audio";
    const source = document.createElement("source");
    source.src = url;
    audio.appendChild(source);
    info.append(name, audio);

    card.append(icon, info);
    return card;
  }

  if (isDoc) {
    const ext = getFileExtension(fileName);

    const card = document.createElement("div");
    card.className = "media-card media-card--doc";
    const icon = document.createElement("span");
    icon.className = "media-doc-icon";
    icon.textContent = ext.slice(0, 4);
    icon.setAttribute("aria-hidden", "true");

    const info = document.createElement("div");
    info.className = "media-doc-info";
    const name = document.createElement("span");
    name.className = "media-doc-name";
    name.textContent = fileName;
    name.title = fileName;
    const extEl = document.createElement("span");
    extEl.className = "media-doc-ext";
    const fileSize = isUploadedFile ? formatFileSize(messageData.fileSize) : "";
    extEl.textContent = [ext, fileSize].filter(Boolean).join(" / ");
    info.append(name, extEl);

    const download = createMediaLink(url, "Preuzmi", "media-doc-btn");
    download.setAttribute("aria-label", `Preuzmi ${fileName}`);
    download.download = fileName;
    download.title = `Preuzmi ${fileName}`;
    card.append(icon, info, download);
    return card;
  }

  if (ytMatch) {
    const card = document.createElement("div");
    card.className = "media-card media-card--yt";
    const wrap = document.createElement("div");
    wrap.className = "media-yt-wrap";
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube.com/embed/${ytMatch[1]}`;
    iframe.className = "media-yt";
    iframe.allowFullscreen = true;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer-when-downgrade";
    wrap.appendChild(iframe);
    card.append(wrap, createMediaLink(url, "â–¶ YouTube", "media-link"));
    return card;
  }

  if (spotifyMatch) {
    const [, type, id] = spotifyMatch;
    const heightMap = {
      track: 152,
      episode: 152,
      album: 352,
      playlist: 352,
      artist: 352,
    };
    const h = heightMap[type] ?? 152;
    const isFull = h > 152;

    const card = document.createElement("div");
    card.className = `media-card media-card--spotify ${isFull ? "media-card--spotify-full" : ""}`;
    const iframe = document.createElement("iframe");
    iframe.src = `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
    iframe.width = "100%";
    iframe.height = String(h);
    iframe.style.border = "0";
    iframe.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    iframe.loading = "lazy";
    iframe.className = "media-spotify";
    card.appendChild(iframe);
    return card;
  }

  return createMediaLink(url, url, "media-link-plain");
}

function createMediaLink(url, label, className) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = className;
  link.textContent = label;
  return link;
}

function getPollVoteKey(option) {
  return encodeURIComponent(option).replace(/\./g, "%2E");
}

function getPollVoteCount(votes, option) {
  if (!votes) return 0;
  return votes[getPollVoteKey(option)] || votes[option] || 0;
}

// ============================================================
// MEDIA LINK FORMATTER
// Detects URL type and returns the appropriate HTML embed/card
// ============================================================
function formatMediaLinks(url) {
  const isImage   = /\.(jpeg|jpg|gif|png|webp)$/i.test(url);
  const isVideo   = /\.(mp4|webm|ogg)$/i.test(url);
  const isAudio   = /\.(mp3|wav)$/i.test(url);
  const isDoc     = /\.(zip|rar|7z|pdf|doc|docx|txt)$/i.test(url);
  const ytMatch   = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  const spotifyMatch = url.match(/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/);

  // Extract a human-readable filename from the URL
  const fileName = url.split("/").pop().split("?")[0];

  // --- Image ---
  if (isImage) {
    return `
      <div class="media-card">
        <img src="${url}" class="media-img" onclick="this.closest('.media-card').querySelector('.media-img').requestFullscreen?.() || window.open('${url}')" />
        <a href="${url}" target="_blank" class="media-link">🖼 ${fileName}</a>
      </div>`;
  }

  // --- Video ---
  if (isVideo) {
    return `
      <div class="media-card">
        <video controls class="media-video">
          <source src="${url}">
        </video>
        <a href="${url}" target="_blank" class="media-link">🎬 ${fileName}</a>
      </div>`;
  }

  // --- Audio ---
  if (isAudio) {
    return `
      <div class="media-card media-card--audio">
        <span class="media-audio-icon">🎵</span>
        <div class="media-audio-info">
          <span class="media-audio-name">${fileName}</span>
          <audio controls class="media-audio">
            <source src="${url}">
          </audio>
        </div>
      </div>`;
  }

  // --- Document (ZIP, PDF, DOCX, etc.) ---
  if (isDoc) {
    const ext = fileName.split(".").pop().toUpperCase();
    const icons = {
      ZIP: "🗜", RAR: "🗜", "7Z": "🗜",
      PDF: "📄", DOC: "📝", DOCX: "📝", TXT: "📃",
    };
    const icon = icons[ext] || "📁";
    return `
      <div class="media-card media-card--doc">
        <span class="media-doc-icon">${icon}</span>
        <div class="media-doc-info">
          <span class="media-doc-name">${fileName}</span>
          <span class="media-doc-ext">${ext}</span>
        </div>
        <a href="${url}" target="_blank" class="media-doc-btn">Preuzmi</a>
      </div>`;
  }

  // --- YouTube embed ---
  if (ytMatch) {
    return `
      <div class="media-card media-card--yt">
        <div class="media-yt-wrap">
          <iframe src="https://www.youtube.com/embed/${ytMatch[1]}"
            class="media-yt" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        </div>
        <a href="${url}" target="_blank" class="media-link">▶ YouTube</a>
      </div>`;
  }

  // --- Spotify embed (track, album, or playlist) ---
  if (spotifyMatch) {
    const [, type, id] = spotifyMatch;

    // Track = compact (80px), single song = standard (152px),
    // playlist/album = full view with native volume slider (352px)
    const heightMap = {
      track: 152,
      episode: 152,
      album: 352,
      playlist: 352,
      artist: 352,
    };
    const h = heightMap[type] ?? 152;
    const isFull = h > 152;

    return `
      <div class="media-card media-card--spotify ${isFull ? "media-card--spotify-full" : ""}">
        <iframe
          src="https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0"
          width="100%"
          height="${h}"
          style="border: 0;"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          class="media-spotify"
        ></iframe>
      </div>`;
  }

  // --- Fallback: plain hyperlink ---
  return `<a href="${url}" target="_blank" class="media-link-plain">🔗 ${url}</a>`;
}

// ============================================================
// POLL RENDERER
// Builds an interactive voting card inside a message bubble
// ============================================================
function renderPoll(msgDiv, snapshotKey, data, color, timeString) {
  const safeName     = escapeHtml(data.username);
  const safeQuestion = escapeHtml(data.question || "");

  msgDiv.innerHTML = `${timeString}<b style="color: ${color}">${safeName} je pokrenuo anketu:</b><br>`;

  // Poll question heading
  const qDiv = document.createElement("div");
  qDiv.style.cssText = "margin: 10px 0; font-size: 1.1rem; font-weight: bold; color: white;";
  qDiv.textContent = safeQuestion;
  msgDiv.appendChild(qDiv);

  // One button per option — clicking calls window.vote()
  if (data.options) {
    data.options.forEach((opt) => {

      const count  = getPollVoteCount(data.votes, opt);
      // Encode ONLY for the ID attribute
      const safeIdPart = getPollVoteKey(opt);

      const button = document.createElement("button");
      button.className = "poll-btn";
      
      // ID format lets child_changed listener update the count in real time
      button.innerHTML = `<span class="opt-text">${escapeHtml(opt)}</span>
                          <span class="opt-count" id="count-${snapshotKey}-${safeIdPart}">${count}</span>`;
      button.onclick = () => window.vote && window.vote(snapshotKey, opt);
      msgDiv.appendChild(button);
    });
  }
}

// ============================================================
// SEND MESSAGE
// Validates input, records history, checks for a command, then pushes to Firebase
// ============================================================
let messageSendPending = false;
window.sendMessage = async () => {
  if (messageSendPending) return;
  const draft = chatInput?.value || "";
  const text = draft.trim();
  if (!text || !window.chatRef) return;

  // Record in command history (capped at 50 entries)
  commandHistory.unshift(text);
  if (commandHistory.length > 50) commandHistory.pop();
  historyIndex = -1; // Reset navigation index

  // If it's a slash command, handle it locally and skip Firebase push
  if (handleCommand(text)) {
    chatInput.value = "";
    chatInput.focus();
    return;
  }

  // Push regular message to Firebase Realtime Database
  messageSendPending = true;
  if (sendBtn) sendBtn.disabled = true;
  try {
    // Ensure push subscription from a chat user gesture (not only voice join).
    if (window.notificationManager && !window.notificationManager.hasEnsuredPushThisSession) {
      // Optional notifications must never block chat delivery.
      void window.notificationManager.ensurePushSubscription(true).catch(() => {});
    }

    await window.chatRef.push({
      username: window.myDisplayName,
      text:      text,
      color:     window.myColor || "#805ff5",
      ...getChatSenderMetadata(),
      timestamp: firebase.database.ServerValue.TIMESTAMP,
    });
    // The user may already be composing their next message.
    if (chatInput.value === draft) chatInput.value = "";
    chatInput.focus();

    // Trigger a global push notification for firebase notification subscribers (e.g. mobile users who have left the tab)
    if (window.notificationManager) {
      window.notificationManager.triggerGlobalPush(window.myDisplayName, text);
    }
  } catch (err) {
    console.error("Greška pri slanju:", err);
    window.appendMessage("Sistem", "Poruka nije poslata. Pokušaj ponovo.", "#ef4444");
  } finally {
    messageSendPending = false;
    if (sendBtn) sendBtn.disabled = false;
  }
};

if (sendBtn) sendBtn.onclick = (e) => {
  e.preventDefault(); // Prevent button from stealing focus
  chatInput.focus();  // Refocus immediately inside the click gesture
  window.sendMessage();
};

// ============================================================
// SLASH COMMAND HANDLER
// Returns true if the input was a recognised command (suppresses Firebase push)
// ============================================================
function handleCommand(text) {
  if (!text.startsWith("/")) return false;

  const args    = text.split(" ");
  const command = args[0].toLowerCase();
  const isDesktop = !/iPhone|iPad|Android/i.test(navigator.userAgent);
  switch (command) {

    // Wipe the local chat view
    case "/clear":
      if (chatHistory) {
        chatHistory.version++;
        chatHistory.loading = false;
        chatHistory.hasMore = false;
        chatHistory.cleared = true;
        updateChatHistoryControls();
      }
      chatMessages.innerHTML = "";
      return true;

    // Change the user's display name for this session
    case "/nick":
      const newNick = args.slice(1).join(" ");
      if (newNick) {
        window.changeNickname(newNick)
          .then((changed) => {
            if (changed) {
              window.appendMessage("Sistem", `Nadimak promenjen u: **${newNick}**`, "#fbbf24");
            } else {
              window.appendMessage("Sistem", "Promena nadimka trenutno nije uspela.", "#ef4444");
            }
          })
          .catch((error) => {
            console.error("Promena nadimka nije uspela:", error);
            window.appendMessage("Sistem", "Promena nadimka trenutno nije uspela.", "#ef4444");
          });
      }
      return true;

    // Roll a random number between 1 and max (default 100)
    case "/roll":
      const max = parseInt(args[1]) || 100;
      window.chatRef.push({
        username: "Sistem",
        text: `🎲 **${window.myDisplayName}** rola: **${Math.floor(Math.random() * max) + 1}** (1-${max})`,
        color: "#fbbf24",
      });
      return true;
    case "/space":
      const spaceArg = args[1];
      if (!spaceArg) {
        window.appendMessage("Sistem", "Format: /space {naziv-prostora}", "#ef4444");
        return true;
      }
      const spaceName = window.sanitizeSpace(spaceArg);
      if (!spaceName) {
        window.appendMessage("Sistem", "Naziv prostora sadrži nedozvoljene karaktere.", "#ef4444");
        return true;
      }
      localStorage.setItem(window.SPACE_STORAGE_KEY || "activeSpace", spaceName);
      window.location.href = `?space=${spaceName}`;
      return true;  
    case "/crtkica":
      if (/iPhone|iPad|Android/i.test(navigator.userAgent)) {
        window.appendMessage("Sistem", "Crtkica nije dostupna na mobilnom uređaju.", "#ef4444");
        return true;
      }
      const wb = document.getElementById("whiteboard-container");
      if (wb) {
        wb.classList.toggle("hidden");
        if (!wb.classList.contains("hidden")) {
          setTimeout(() => {
            if (window.resizeWhiteboardCanvas) window.resizeWhiteboardCanvas();
            if (window.loadWhiteboardSnapshot) window.loadWhiteboardSnapshot();
          }, 50);
        }
      }
      return true;
    // Ask the AI bot a question
    case "/bot":
      const prompt = args.slice(1).join(" ");
      if (!prompt) {
        window.appendMessage("Sistem", "Format: /Bot Koliko je 2+2?", "#ef4444");
      } else {
        window.askAI(prompt);
      }
      return true;

    // Create a real-time poll with multiple options
    case "/poll":
      const pollData = args.slice(1).join(" ").split(",");
      if (pollData.length < 2) {
        window.appendMessage("Sistem", "Format: /poll Pitanje , Opcija1 , Opcija2...", "#ef4444");
        return true;
      }
      const question = pollData[0].trim();
      const options  = pollData.slice(1).map((opt) => opt.trim()).filter((opt) => opt !== "");
      const pollVotes = {};
      options.forEach((opt) => (pollVotes[getPollVoteKey(opt)] = 0));

      window.chatRef.push({
        username:  window.myDisplayName,
        ...getChatSenderMetadata(),
        type:      "poll",
        question:  question,
        options:   options,
        votes:     pollVotes,
        text:      "",
        timestamp: Date.now(),
      });
      return true;

    // Show Agora network stats (RTT + user count)
    case "/ping":
      if (window.client && typeof window.client.getRTCStats === "function") {
        const rtc = window.client.getRTCStats();
        window.appendMessage("Sistem", `📊 Mreža: ${rtc.RTT}ms | Korisnika: ${window.getVoiceParticipantCount()}`, "#fbbf24");
      }
      return true;

    // Send a private message visible only to sender and recipient
    case "/msg":
      const msgArguments = text.slice(args[0].length).trim();
      const knownNames = [...new Set(Object.values(window.uidNameMap || {}))]
        .filter(Boolean)
        .sort((left, right) => right.length - left.length);
      let target = "";
      let privateMsg = "";

      const quotedTarget = msgArguments.match(/^"([^"]+)"\s+(.+)$/);
      if (quotedTarget) {
        target = quotedTarget[1].trim();
        privateMsg = quotedTarget[2].trim();
      } else {
        const lowerArguments = msgArguments.toLowerCase();
        const visibleTarget = knownNames.find((name) =>
          lowerArguments.startsWith(`${name.toLowerCase()} `),
        );
        const firstSpace = msgArguments.indexOf(" ");
        const compactTarget = firstSpace === -1 ? msgArguments : msgArguments.slice(0, firstSpace);
        const compactMatch = knownNames.find((name) =>
          window.normalizeNickname(name) === window.normalizeNickname(compactTarget),
        );

        target = visibleTarget || compactMatch || compactTarget;
        const consumedLength = visibleTarget
          ? visibleTarget.length
          : firstSpace === -1 ? msgArguments.length : firstSpace;
        privateMsg = msgArguments.slice(consumedLength).trim();
      }

      if (target && privateMsg) {
        const sessionSuffix = target.match(/^(.*)#(\d+)$/);
        const targetName = (sessionSuffix ? sessionSuffix[1] : target).trim();
        const requestedSessionId = sessionSuffix ? sessionSuffix[2] : null;
        const matchingSessions = Object.entries(window.uidNameMap || {})
          .filter(([, name]) =>
            window.normalizeNickname(name) === window.normalizeNickname(targetName),
          );

        let targetSessionId = requestedSessionId;
        if (requestedSessionId) {
          const exactSession = matchingSessions.some(
            ([uid]) => String(uid) === String(requestedSessionId),
          );
          if (!exactSession) {
            window.appendMessage("Sistem", `Sesija **${target}** nije pronađena.`, "#ef4444");
            return true;
          }
        } else if (matchingSessions.length === 1) {
          targetSessionId = String(matchingSessions[0][0]);
        } else if (matchingSessions.length > 1) {
          const choices = matchingSessions
            .map(([uid, name]) => `**${name}#${uid}**`)
            .join(", ");
          window.appendMessage(
            "Sistem",
            `Više sesija koristi ime **${targetName}**. Izaberi: ${choices}`,
            "#ef4444",
          );
          return true;
        } else {
          window.appendMessage("Sistem", `Korisnik **${targetName}** nije prisutan.`, "#ef4444");
          return true;
        }

        window.chatRef.push({
          username:  window.myDisplayName,
          ...getChatSenderMetadata(),
          text:      privateMsg,
          to:        targetName,
          toSessionId: targetSessionId,
          type:      "private",
          timestamp: Date.now(),
        });
      } else {
        window.appendMessage("Sistem", "Greška: Koristi /msg SpojenoIme Poruka ili /msg \"Ime Sa Razmacima\" Poruka", "#ef4444");
      }
      return true;

    // Display an inline command reference card
    case "/help":
      const helpHtml = `
        <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; border: 1px solid rgba(74, 222, 128, 0.3);">
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; font-size: 0.85rem;">
            <code style="color: #fbbf24;text-align: left;">/nick Ime</code>        <span>Promena imena</span>
            <code style="color: #fbbf24;text-align: left;">/poll P, O1, O2</code>  <span>Anketa</span>
            <code style="color: #fbbf24;text-align: left;">/roll 100</code>         <span>Kockica</span>
            <code style="color: #fbbf24;text-align: left;">/clear</code>            <span>Očisti čet</span>
            <code style="color: #fbbf24;text-align: left;">/space Naziv</code>       <span>Promeni prostor</span>
            <code style="color: #fbbf24;text-align: left;">/ping</code>             <span>Ping test Agora</span>
            <code style="color: #fbbf24;text-align: left;">/msg {ime[#sesija]} {poruka}</code> <span>Kod duplih imena izaberi sesiju</span>
            ${isDesktop ? `<code style="color: #fbbf24;text-align: left;">/crtkica</code> <span>Otvori/zatvori crtkicu</span>` : ""}
            <code style="color: #fbbf24;text-align: left;">/bot {pitanje}</code>    <span>Postavi pitanje botu</span>
          </div>
        </div>`;
      window.appendSystemHTML(helpHtml);
      return true;

    default:
      return false;
  }
}

// ============================================================
// FIREBASE LISTENERS
// startChat — called once after auth, sets up child_added and child_changed
// ============================================================
const CHAT_PAGE_SIZE = 50;
let chatHistory = null;

function updateChatHistoryControls(message = "") {
  const controls = document.getElementById("chat-history-controls");
  const button = document.getElementById("load-older-messages");
  const status = document.getElementById("chat-history-status");
  if (!controls || !button || !status) return;
  controls.hidden = !chatHistory || chatHistory.cleared || (!chatHistory.hasMore && !message);
  button.hidden = !chatHistory?.hasMore;
  button.disabled = !!chatHistory?.loading;
  button.textContent = chatHistory?.loading ? "Učitavanje…" : "Učitaj starije poruke";
  status.textContent = message;
}

async function readInitialChatHistory(state) {
  const version = state.version;
  state.loading = true;
  updateChatHistoryControls();
  try {
    const snapshot = await state.query.once("value");
    if (state !== chatHistory || version !== state.version) return;
    // child_added delivers the initial window before this value snapshot.
    // Keep the earliest received key even if new messages moved that window.
    snapshot.forEach(child => {
      if (!state.oldestKey || child.key < state.oldestKey) state.oldestKey = child.key;
    });
    state.ready = true;
    state.hasMore = snapshot.numChildren() >= CHAT_PAGE_SIZE;
    document.getElementById("chat-skeleton-loader")?.remove();
  } catch (error) {
    if (state !== chatHistory || version !== state.version) return;
    console.warn("Initial chat history unavailable:", error);
    state.loading = false;
    updateChatHistoryControls("Istorija nije učitana. Pokušaj ponovo.");
    return;
  }
  if (state !== chatHistory || version !== state.version) return;
  state.loading = false;
  updateChatHistoryControls();
}

window.loadOlderMessages = async () => {
  const state = chatHistory;
  if (!state || state.loading || !state.hasMore || state.cleared) return;
  if (!state.ready) return readInitialChatHistory(state);
  if (!state.oldestKey) return;
  const version = state.version;
  state.loading = true;
  updateChatHistoryControls();
  try {
    // An exclusive key cursor is stable even when timestamps are identical.
    // Fetch one extra record to know whether another page remains.
    const snapshot = await state.ref.orderByKey().endBefore(state.oldestKey)
      .limitToLast(CHAT_PAGE_SIZE + 1).once("value");
    if (state !== chatHistory || version !== state.version) return;
    const records = [];
    snapshot.forEach(child => { records.push(child); });
    const page = records.slice(-CHAT_PAGE_SIZE);
    const before = chatMessages.querySelector(".chat-msg[id]");
    const anchorTop = before?.getBoundingClientRect().top;
    for (const child of page) {
      if (state.seen.has(child.key)) continue;
      state.seen.add(child.key);
      state.render(child, { historical: true, before });
    }
    if (page.length) state.oldestKey = page[0].key;
    state.hasMore = records.length > CHAT_PAGE_SIZE;
    state.loading = false;
    updateChatHistoryControls(state.hasMore ? "" : "Nema starijih poruka.");
    // Account for browser scroll anchoring and changes in the controls' height.
    if (before) chatMessages.scrollTop += before.getBoundingClientRect().top - anchorTop;
  } catch (error) {
    if (state !== chatHistory || version !== state.version) return;
    console.warn("Older chat messages unavailable:", error);
    state.loading = false;
    updateChatHistoryControls("Poruke nisu učitane. Pokušaj ponovo.");
  }
};
const loadOlderButton = document.getElementById("load-older-messages");
if (loadOlderButton) loadOlderButton.onclick = () => window.loadOlderMessages();

function startChat() {
  if (chatHistory) chatHistory.query.off("child_added", chatHistory.receive);
  window.chatRef = firebase.database().ref(`messages/${window.CHANNEL}`);
  const state = chatHistory = {
    ref: window.chatRef, query: window.chatRef.orderByKey().limitToLast(CHAT_PAGE_SIZE),
    oldestKey: null, hasMore: true, loading: true, ready: false, version: 0, seen: new Set(),
  };

  // Prepend the welcome banner (ASCII art)
  window.appendSystemHTML(welcomeArt, true);

  // Listen to the last 50 messages; also fires for each new incoming message
  state.render = (snapshot, options = {}) => {

    // Remove skeleton loader on first real message
    const skeleton = document.getElementById("chat-skeleton-loader");
    if (skeleton) skeleton.remove();

    const message = snapshot.val();
    if (!message) return;
    const message_key  = snapshot.key;

    // Private messages are only shown to the sender and the named recipient
    if (message.type === "private") {
      const isMeSender = window.isOwnChatMessage(message);
      const isMeTarget = message.toSessionId
        ? String(message.toSessionId) === String(window.myAgoraUID)
        : window.normalizeNickname(message.to) ===
          window.normalizeNickname(window.myDisplayName);

      if (isMeSender || isMeTarget) {
        const prefix = isMeSender
          ? `[privatna za ${escapeHtml(message.to || "")}]`
          : `[Privatna od ${escapeHtml(message.username || "")}]`;
        window.appendMessage(prefix, message.text, "#d1d5db", message_key, message, options);
      }
      return;
    }
    // Check if the message is a guess in an active whiteboard game
    if (!options.historical && message.username !== "Sistem") {
      const gameRef = firebase.database().ref(`whiteboard-game/${window.CHANNEL}`);
      // Transaction runs atomically — only one client wins the race
      gameRef.transaction((game) => {
        // If there's no active game, or the guess is from the drawer, or it's incorrect, abort the transaction
        if (!game || !game.active) return;
        // child_added replays history on every join. Only messages created
        // during this round can be guesses (timestamps come from Firebase).
        if (typeof game.startedAt !== "number" || typeof message.timestamp !== "number" ||
            message.timestamp < game.startedAt ||
            (game.endsAt && message.timestamp > game.endsAt)) return;
        const isDrawerGuess = game.drawerSessionId && message.senderSessionId
          ? String(message.senderSessionId) === String(game.drawerSessionId)
          : (message.username || "") === game.drawer;
        if (isDrawerGuess) return;
        if ((message.text || "").toLowerCase().trim() !== game.word.toLowerCase()) return;
        // update the game state to mark it as inactive (ended)
        return { ...game, active: false };
      }, (error, committed, snapshot) => {
        if (!committed) return;
        const game = snapshot.val();
        if (window.launchWhiteboardConfetti) window.launchWhiteboardConfetti();
        if (window.resetWordButton) window.resetWordButton();
        // Announce the winner in chat and clean up the game state
        window.chatRef.push({
          username:  "Sistem",
          text:      `🎉 ${message.username} pogodio reč: ${game.word}!`,
          color:     "#fbbf24",
          timestamp: Date.now(),
        });
        // A new round can start while the winning transaction completes.
        gameRef.transaction((current) => current?.roundId === game.roundId && !current.active ? null : undefined);
        clearInterval(window.timerInterval);
      });
    }
        // Standard messages and polls
    window.appendMessage(message.username, message.text, message.color || "#805ff5", message_key, message, options);
  };
  state.receive = (snapshot) => {
    if (state !== chatHistory) return;
    if (!state.oldestKey || snapshot.key < state.oldestKey) state.oldestKey = snapshot.key;
    if (state.seen.has(snapshot.key)) return;
    state.seen.add(snapshot.key);
    state.render(snapshot);
  };
  state.query.on("child_added", state.receive);
  void readInitialChatHistory(state);

  // Listen for updates to existing messages (used for live poll vote counts)
  window.chatRef.on("child_changed", (snapshot) => {
    const message = snapshot.val();
    const messageKey = snapshot.key;
    if (message && message.type === "poll" && Array.isArray(message.options)) {
      message.options.forEach((opt) => {
        const el = document.getElementById(`count-${messageKey}-${getPollVoteKey(opt)}`);
        if (el) el.innerText = getPollVoteCount(message.votes, opt);
      });
    }
  });

  // Presence listener — updates muted state on remote avatars
  firebase.database()
    .ref(`presence/${window.CHANNEL}`)
    .on("child_changed", (snapshot) => {
      const data = snapshot.val();
      const uid  = snapshot.key;
      if (!data?.displayName) return;
      window.uidNameMap[uid] = data.displayName;
      if (data.voiceJoined === false) {
        document.getElementById(`user-${uid}`)?.remove();
        return;
      }
      const isMe = uid === String(window.myAgoraUID);
      window.drawUser(uid, data.displayName, data.icon, isMe);
      window.setUserMuted(uid, data.muted === true);
    });
}

// Presence listener — adds/removes users from the grid as they join/leave
function startPresenceListener() {
  firebase.database()
    .ref(`presence/${window.CHANNEL}`)
    .on("child_added", (snap) => {
      const data = snap.val();
      const uid  = snap.key;
      if (!data?.displayName) return;
      window.uidNameMap[uid] = data.displayName;
      if (data.voiceJoined === false) return;
      const isMe = uid === String(window.myAgoraUID);
      window.drawUser(uid, data.displayName, data.icon, isMe);
      window.setUserMuted(uid, data.muted === true);
    });

  firebase.database()
    .ref(`presence/${window.CHANNEL}`)
    .on("child_removed", (snap) => {
      delete window.uidNameMap[snap.key];
      const el = document.getElementById(`user-${snap.key}`);
      if (el) el.remove();
    });
}

// ============================================================
// VOTING
// Uses a Firebase transaction to safely increment a vote counter
// Prevents double-voting by recording the poll ID in localStorage
// ============================================================
const pendingVotes = new Set();
window.vote = async (pollId, option) => {
  const votedKey = `voted_${pollId}`;
  if (pendingVotes.has(votedKey)) return;
  if (localStorage.getItem(votedKey)) {
    window.appendMessage("Sistem", "Već si glasao u ovoj anketi.", "#ef4444");
    return;
  }

  const pollRef = window.chatRef.child(`${pollId}/votes/${getPollVoteKey(option)}`);

  pendingVotes.add(votedKey);
  try {
    const result = await pollRef.transaction((currentVotes) => (currentVotes || 0) + 1);
    if (!result.committed) throw new Error("Vote was not committed");
    localStorage.setItem(votedKey, "true");
  } catch (error) {
    console.error("Vote failed:", error);
    window.appendMessage("Sistem", "Glas nije sačuvan. Pokušaj ponovo.", "#ef4444");
  } finally {
    pendingVotes.delete(votedKey);
  }
};

// ============================================================
// FILE UPLOAD
// Tries Catbox/Litterbox directly, falls back to a CORS proxy
// ============================================================
async function uploadFile(file, expiry) {
  const formData = new FormData();
  formData.append("reqtype", "fileupload");
  formData.append("fileToUpload", file);

  // Permanent storage → Catbox; temporary → Litterbox with a time limit
  let apiUrl = "https://catbox.moe/user/api.php";
  if (expiry !== "trajno") {
    formData.append("time", expiry);
    apiUrl = "https://litterbox.catbox.moe/resources/internals/api.php";
  }

  try {
    const response = await fetch(apiUrl, { method: "POST", body: formData });
    return (await response.text()).trim();
  } catch (e) {
    // Direct request failed (likely CORS) — retry via proxy
    console.error("Direktan upload nije uspeo, pokušavam preko proxy-ja...", e);
    try {
      const proxyRes = await fetch(CORS_PROXY_URL + apiUrl, {
        method: "POST",
        body: formData,
      });
      return (await proxyRes.text()).trim();
    } catch (err) {
      return null;
    }
  }
}

/** Uploads a file and posts the resulting URL as a chat message */
window.handleFileUpload = async (file) => {
  const uploadStatus = window.appendMessage
    ? window.appendMessage("Sistem", `Slanje fajla: ${file.name}...`, "#fbbf24")
    : null;

  const expirySelect = document.getElementById("upload-expiry");
  const expiry  = expirySelect ? expirySelect.value : "trajno";
  const uploadStartedAt = Date.now();
  const fileUrl = await uploadFile(file, expiry);
  uploadStatus?.remove();

  if (fileUrl && fileUrl.startsWith("http")) {
    const expiryDuration = FILE_EXPIRY_MS[expiry];
    const fileExpiresAt = expiryDuration ? uploadStartedAt + expiryDuration : null;
    // Post the URL to chat — the media formatter will embed it appropriately
    window.chatRef.push({
      username:  window.myDisplayName,
      ...getChatSenderMetadata(),
      type:      "file",
      fileName:  file.name,
      fileSize:  file.size,
      fileMimeType: file.type || "",
      fileUrl,
      fileExpiry: expiry,
      ...(fileExpiresAt ? { fileExpiresAt } : {}),
      text:      `Dostupno ${expiry}: ${fileUrl}`,
      timestamp: Date.now(),
    });
  } else {
    const errorDetail = fileUrl || "Problem sa serverom";
    if (window.appendMessage)
      window.appendMessage("Sistem", `Greška pri slanju: ${errorDetail}`, "#ef4444");
  }
}

// ============================================================
// PASTE & DRAG-AND-DROP INTO CHAT INPUT
// ============================================================
if (chatInput) {

  // Handle images/files pasted from the clipboard
  chatInput.onpaste = async (e) => {
    const items = e.clipboardData && e.clipboardData.items ? e.clipboardData.items : [];
    for (let item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) handleFileUpload(file);
      }
    }
  };

  // Handle files dropped onto the input field
  chatInput.ondrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    chatInput.classList.remove("drag-active");

    const files = e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files : null;
    if (files && files.length > 0) handleFileUpload(files[0]);
  };

  // Visual feedback while a file is being dragged over the input
  chatInput.ondragover = (e) => {
    e.preventDefault();
    chatInput.style.background = "rgba(74, 222, 128, 0.05)";
    chatInput.classList.add("drag-active");
  };

  // Restore normal styling when the drag leaves
  chatInput.ondragleave = () => {
    chatInput.style.background = "transparent";
    chatInput.classList.remove("drag-active");
  };
}

// ============================================================
// CHAT INPUT — AUTOCOMPLETE & KEYBOARD SHORTCUTS
// ============================================================
if (chatInput) {

  // Show autocomplete menu when the user starts typing a slash command
  chatInput.oninput = () => {
    const val = chatInput.value;
    if (val.startsWith("/")) {
      const matches = (window.commands || []).filter((c) =>
        c.cmd.startsWith(val.toLowerCase())
      );
      if (matches.length > 0) {
        autoMenu.innerHTML = matches
          .map((c) => `
            <div class="autocomplete-item" onclick="applyCommand('${c.cmd}')">
              <span>${escapeHtml(c.cmd)}</span>
              <span class="command-desc">${escapeHtml(c.desc)}</span>
            </div>`)
          .join("");
        autoMenu.style.display = "block";
      } else {
        autoMenu.style.display = "none";
      }
    } else {
      autoMenu.style.display = "none";
    }
  };

  chatInput.onkeydown = (e) => {
    if (e.key === "Enter") {
      // Send message and close any open overlays
      if (emojiPicker) emojiPicker.classList.add("hidden");
      if (autoMenu)    autoMenu.style.display = "none";
      window.sendMessage();

    } else if (e.key === "ArrowUp") {
      // Navigate backwards through command history
      if (historyIndex < commandHistory.length - 1) {
        historyIndex++;
        chatInput.value = commandHistory[historyIndex];
      }
      e.preventDefault();

    } else if (e.key === "ArrowDown") {
      // Navigate forwards through command history (empty = clear input)
      if (historyIndex > 0) {
        historyIndex--;
        chatInput.value = commandHistory[historyIndex];
      } else {
        historyIndex    = -1;
        chatInput.value = "";
      }
      e.preventDefault();
    }
  };
}

// ============================================================
// FILE UPLOAD BUTTON
// Clicking the ➕ button opens the hidden file picker
// ============================================================
if (uploadBtn && fileInput) {
  uploadBtn.onclick = () => fileInput.click();

  fileInput.onchange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      window.handleFileUpload(selectedFile);
      fileInput.value = ""; // Reset so the same file can be re-selected
    }
  };
}
// ============================================================
// AUTOCOMPLETE — apply selected command to input
// ============================================================
window.applyCommand = (cmd) => {
  chatInput.value = cmd + " "; // Trailing space so the user can type args immediately
  chatInput.focus();
  autoMenu.style.display = "none";
};

// ============================================================
// EMOJI PICKER
// Toggle visibility on button click; close when clicking outside
// ============================================================
if (emojiBtn && emojiPicker) {
  emojiBtn.onclick = (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle("hidden");
  };

  document.addEventListener("click", (e) => {
    if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
      emojiPicker.classList.add("hidden");
    }
  });
}

// ============================================================
// EMOJI INSERTER
// Inserts an emoji at the current cursor position in the input
// ============================================================
window.addEmoji = (emoji) => {
  if (!chatInput) return;
  const start = chatInput.selectionStart;
  chatInput.value =
    chatInput.value.slice(0, start) +
    emoji +
    chatInput.value.slice(chatInput.selectionEnd);
  chatInput.focus();
  if (emojiPicker) emojiPicker.classList.add("hidden");
};

// ============================================================
// DRAGGABLE CHAT PANEL
// Lets the user reposition #chat-container by dragging the handle
// Click without drag toggles the collapsed state
// ============================================================
if (chatContainer && dragHandle) {
  let x = 0, y = 0, initialX = 0, initialY = 0, isDragging = false;
  const savedLayout = window.browserPreferences?.read("chat-layout");
  let position = savedLayout && Number.isFinite(savedLayout.left) && Number.isFinite(savedLayout.top)
    ? { left: savedLayout.left, top: savedLayout.top } : null;
  const saveLayout = () => window.browserPreferences?.write("chat-layout", {
    ...position,
    collapsed: chatContainer.classList.contains("collapsed"),
  });
  const applyPosition = () => {
    // Mobile has a dedicated full-width layout; retain the desktop position.
    if (!position || window.innerWidth <= 767) return;
    const left = Math.max(0, Math.min(position.left, window.innerWidth - chatContainer.offsetWidth));
    const top = Math.max(0, Math.min(position.top, window.innerHeight - chatContainer.offsetHeight));
    chatContainer.style.left = `${left}px`;
    chatContainer.style.top = `${top}px`;
    chatContainer.style.bottom = "auto";
    chatContainer.style.right = "auto";
  };
  if (typeof savedLayout?.collapsed === "boolean") {
    chatContainer.classList.toggle("collapsed", savedLayout.collapsed);
    settingsBtn?.classList.toggle("hidden", savedLayout.collapsed);
  }
  applyPosition();
  window.addEventListener("resize", applyPosition);

  dragHandle.onmousedown = (e) => {
    if (e.button !== 0) return; // Left-click only
    if (window.innerWidth <= 767) return;

    isDragging = false;
    initialX   = e.clientX;
    initialY   = e.clientY;

    document.onmousemove = (e) => {
      isDragging = true;
      x = initialX - e.clientX;
      y = initialY - e.clientY;
      initialX = e.clientX;
      initialY = e.clientY;

      // Move the panel by the delta, clearing right/bottom anchors
      position = { top: chatContainer.offsetTop - y, left: chatContainer.offsetLeft - x };
      applyPosition();
    };

    document.onmouseup = () => {
      document.onmousemove = null;
      document.onmouseup = null;
      if (isDragging) {
        position = { top: chatContainer.offsetTop, left: chatContainer.offsetLeft };
        saveLayout();
      }
    };
  };

  // Distinguish a click (collapse toggle) from a drag (reposition)
  dragHandle.onclick = () => {
    if (!isDragging) {
      chatContainer.classList.toggle("collapsed");
      settingsBtn.classList.toggle("hidden");
      applyPosition();
      saveLayout();

      // Clear badge when opening chat
      if (!chatContainer.classList.contains("collapsed")) {
        const badge = document.getElementById("unread-badge");
        if (badge) {
          badge.innerText = "0";
          badge.classList.add("hidden");
        }
      }
    }
  };
}

// ============================================================
// AI BOT (/bot command handler)
// Tries Gemini models in order, falling back if rate-limited or unavailable
// ============================================================
window.askAI = async (prompt) => {
  const models = ["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
  const thinkingMessageId = `temp-bot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const removeThinkingMessage = () => {
    document.getElementById(`chat-msg-${thinkingMessageId}`)?.remove();
  };

  // Show a "thinking" placeholder immediately
  window.appendMessage("🤖", "Razmišljam...", "#fbbf24", thinkingMessageId, { username: "🤖" });

  for (let modelName of models) {
    try {
      const response = await fetch(
        AI_PROXY_URL,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ prompt, model: modelName }),
        }
      );

      const data = await response.json();

      // 429 = rate limited, 404 = model unavailable → try the next one
      if (response.status === 429 || response.status === 404) {
        console.warn(`Model ${modelName} nije uspeo, pokušavam sledeći...`);
        continue;
      }

      if (data.candidates && data.candidates[0].content.parts[0].text) {
        const aiText = data.candidates[0].content.parts[0].text;
        removeThinkingMessage();

        // Push the answer to Firebase so all users see the bot response
        window.chatRef.push({
          username:  `🤖 Bot (${modelName})`,
          text:      `${window.myDisplayName} pita: ${prompt}\n ${aiText}`,
          color:     "#fbbf24",
          timestamp: Date.now(),
        });
        return;
      }
    } catch (err) {
      console.error("Greška sa modelom " + modelName, err);
    }
  }

  // All models failed
  removeThinkingMessage();
  window.appendMessage("Sistem", "Svi Bot modeli su trenutno zauzeti. Pokušajte kasnije.", "#ef4444");
};

// ============================================================
// SYSTEM HTML MESSAGES
// Renders arbitrary HTML into the chat (used by /help and welcome banner)
// atTop = true prepends instead of appending
// ============================================================
window.appendSystemHTML = (htmlContent, atTop = false) => {
  const msgDiv = document.createElement("div");
  msgDiv.className = "chat-msg system-msg";
  msgDiv.style.alignSelf = "center";
  msgDiv.style.width     = "90%";

  if (atTop) {
    msgDiv.innerHTML = `<b style="color: #805ff5">Dobrodošli</b><br>${htmlContent}`;
    chatMessages.prepend(msgDiv);
  } else {
    msgDiv.innerHTML = `<b style="color: #805ff5">Komande:</b><br>${htmlContent}`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
};

// ============================================================
// SETTINGS MENU
// Toggle on gear-icon click; close when clicking anywhere else
// ============================================================
settingsBtn.onclick = (e) => {
  e.stopPropagation();
  settingsMenu.classList.toggle("hidden");
};

document.addEventListener("click", (e) => {
  if (settingsMenu && !settingsMenu.contains(e.target) && e.target !== settingsBtn) {
    settingsMenu.classList.add("hidden");
  }
});
/**
 * js/whiteboard.js
 * Shared real-time whiteboard using Firebase and HTML Canvas.
 * Desktop only.
 */

// ============================================================
// DESKTOP ONLY
// ============================================================
if (/iPhone|iPad|Android/i.test(navigator.userAgent)) {
  const btn = document.getElementById("whiteboard-btn");
  if (btn) btn.style.display = "none";
} else {
  initWhiteboard();
}

function initWhiteboard() {
  const container   = document.getElementById("whiteboard-container");
  const canvas      = document.getElementById("whiteboard-canvas");
  const handle      = document.getElementById("whiteboard-drag-handle");
  const closeBtn    = document.getElementById("whiteboard-close");
  const colorPick   = document.getElementById("wb-color");
  const sizePick    = document.getElementById("wb-size");
  const eraserBtn   = document.getElementById("wb-eraser");
  const clearBtn    = document.getElementById("wb-clear");
  const wordBtn     = document.getElementById("wb-word");
  const wordDisplay = document.getElementById("wb-current-word");
  const stopBtn     = document.getElementById("wb-stop");
  const wbCursor = document.getElementById("wb-cursor");

  const ctx = canvas.getContext("2d");

  // ============================================================
  // STATE
  // ============================================================
  let drawing      = false;
  let isEraser     = false;
  let currentColor = "#ffffff";
  let currentSize  = 3;
  let lastX = 0, lastY = 0;
  let myWord = null;

  // Firebase refs
  const wbRef    = firebase.database().ref(`whiteboard/${window.CHANNEL}`);
  const wbClrRef = firebase.database().ref(`whiteboard-cleared/${window.CHANNEL}`);
  const gameRef  = firebase.database().ref(`whiteboard-game/${window.CHANNEL}`);

  // ============================================================
  // STROKE BUFFER — THROTTLED FIREBASE WRITES
  // FLUSH_INTERVAL ms (~30 fps).
  // ============================================================
  const FLUSH_INTERVAL = 30; // ms
  let   strokeBuffer   = [];
  let   flushTimer     = null;

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (!strokeBuffer.length) return;
      const batch = {};
      strokeBuffer.forEach(stroke => {
        batch[wbRef.push().key] = stroke;
      });
      strokeBuffer = [];
      wbRef.update(batch);
    }, FLUSH_INTERVAL);
  }

  // ============================================================
  // WORD LIST
  // ============================================================
  const WORDS = [
    "petak","ponedeljak","familija","doktor","tiba","linija","pomfrit","gospodarica","osvezenje","majonez",
    "boks","umor","fabrika","sizofrenija","ruke","gas","spavanje","makarone","gram","pirat",
    "pepko","inkubator","dusek","krompiri","smi","federacija","drugostepena","prekovremeno","brisanje","pivo",
    "dremikca","ispravljanje","palacinka","maskembal","planinarenje","politika","bazen","fotelja","prosipati","slagalica"
  ];

  // ============================================================
  // TIMER CONFIG
  // ============================================================
  const TIMER_ENABLED  = true;   // set to false to disable timer and show word until stop button is pressed
  const TIMER_DURATION = 60;     // seconds
  window.timerInterval = null;

  // ============================================================
  // CANVAS SIZING
  // ============================================================
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width;
    canvas.height = rect.height;
  }

  // ============================================================
  // CLOSE BUTTON
  // ============================================================
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    container.classList.add("hidden");
  };

  // ============================================================
  // TOOLBAR
  // ============================================================
  colorPick.oninput = (e) => {
    currentColor = e.target.value;
    isEraser = false;
    eraserBtn.classList.remove("active");
  };

  sizePick.oninput = (e) => {
    currentSize = parseInt(e.target.value);
  };

  eraserBtn.onclick = () => {
    isEraser = !isEraser;
    eraserBtn.classList.toggle("active", isEraser);
  };

  clearBtn.onclick = async () => {
    await wbClrRef.set({ clearedAt: Date.now(), by: window.myDisplayName });
    await wbRef.remove();
    setTimeout(() => wbClrRef.remove(), 2000);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // ============================================================
  // WORD GAME — GENERATE WORD
  // ============================================================
  wordBtn.onclick = () => {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    myWord = word;
    wordDisplay.textContent = `✏️ Tvoja reč: ${word}`;
    wordBtn.classList.toggle('is-disabled', true);

    gameRef.set({
      roundId: gameRef.push().key,
      startedAt: firebase.database.ServerValue.TIMESTAMP,
      word:   word,
      drawer: window.myDisplayName,
      drawerSessionId: String(window.myAgoraUID),
      active: true,
      winner: null,
      endsAt:    TIMER_ENABLED ? Date.now() + TIMER_DURATION * 1000 : null,
    });

    window.chatRef.push({
      username:  "Sistem",
      text:      `🎮 ${window.myDisplayName} crta reč — pogodite šta je...`,
      color:     "#fbbf24",
      timestamp: Date.now(),
    });
  };

  // ============================================================
  // WORD GAME — STOP
  // ============================================================
  stopBtn.onclick = () => {
    clearInterval(timerInterval);
    gameRef.remove();
    wordDisplay.textContent = "";
    wordBtn.classList.toggle('is-disabled', false);
    myWord = null;
    stopBtn.style.display = "none";
    window.chatRef.push({
      username:  "Sistem",
      text:      `🛑 ${window.myDisplayName} je zaustavio igru.`,
      color:     "#fbbf24",
      timestamp: Date.now(),
    });
  };

  // ============================================================
  // WORD GAME — STATE LISTENER (single, handles display + stop btn)
  // ============================================================
  gameRef.on("value", (snap) => {
    const data = snap.val();

    if (!data) {
      wordDisplay.textContent  = "";
      myWord                   = null;
      stopBtn.style.display    = "none";
      return;
    }

    const isDrawer = data.drawerSessionId
      ? String(data.drawerSessionId) === String(window.myAgoraUID)
      : data.drawer === window.myDisplayName;

    if (!isDrawer) {
      wordDisplay.textContent = data.active
        ? `✏️ ${data.drawer} crta...`
        : `✅ Reč je bila: ${data.word}`;
    }

    // Start countdown only for the drawer, only if timer is on and game is active
    if (TIMER_ENABLED && isDrawer && data.active && data.endsAt) {
    startTimer(data.endsAt);
    }

    // Only the drawer sees the stop button, only while game is active
    stopBtn.style.display = (isDrawer && data.active) ? "inline-block" : "none";
  });

  // ============================================================
  // WORD GAME — TIMER
  // ============================================================
  function startTimer(endsAt) {
  clearInterval(timerInterval);
  window.timerInterval = setInterval(() => {
    const secondsLeft = Math.ceil((endsAt - Date.now()) / 1000);
    if (secondsLeft <= 0) {
      clearInterval(timerInterval);
      wordBtn.classList.toggle('is-disabled', false);
      // Time's up — reveal word and end game
      gameRef.once("value", (snap) => {
        const data = snap.val();
        if (!data || !data.active) return;
        gameRef.remove();
        window.chatRef.push({
          username:  "Sistem",
          text:      `⏰ Vreme je isteklo! Reč je bila: ${data.word}`,
          color:     "#fbbf24",
          timestamp: Date.now(),
        });
      });
      return;
    }
    // Update display for the drawer only
    if (myWord) {
      wordDisplay.textContent = `✏️ Tvoja reč: ${myWord} (${secondsLeft}s)`;
    }
  }, 1000);
}

  // ============================================================
  // WORD GAME — CONFETTI
  // ============================================================
  function launchConfetti() {
    const colors = ["#4ade80","#fbbf24","#60a5fa","#f87171","#c084fc"];
    for (let i = 0; i < 60; i++) {
      const el = document.createElement("div");
      el.style.cssText = `
        position: absolute;
        width: 8px; height: 8px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        border-radius: 50%;
        left: ${Math.random() * 100}%;
        top: 0;
        pointer-events: none;
        z-index: 9999;
        animation: confetti-fall ${1 + Math.random()}s ease-out forwards;
      `;
      container.appendChild(el);
      setTimeout(() => el.remove(), 2000);
    }
  }

  window.launchWhiteboardConfetti = launchConfetti;

  // ============================================================
  // DRAWING — LOCAL
  // ============================================================
  canvas.onmousedown = (e) => {
    drawing = true;
    const rect = canvas.getBoundingClientRect();
    lastX = (e.clientX - rect.left) * (canvas.width  / rect.width);
    lastY = (e.clientY - rect.top)  * (canvas.height / rect.height);
  };

  canvas.onmousemove = (e) => {
    // cursor circle
    wbCursor.style.display = "block";
    wbCursor.style.width   = currentSize + "px";
    wbCursor.style.height  = currentSize + "px";
    wbCursor.style.left    = e.clientX + "px";
    wbCursor.style.top     = e.clientY + "px";
    wbCursor.style.borderColor = isEraser ? "rgb(255, 255, 255)" : currentColor;

    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width  / rect.width);
    const y = (e.clientY - rect.top)  * (canvas.height / rect.height);

    drawLine(lastX, lastY, x, y, isEraser ? "#000000" : currentColor, currentSize, isEraser);

    strokeBuffer.push({
      x1:     lastX / canvas.width,
      y1:     lastY / canvas.height,
      x2:     x     / canvas.width,
      y2:     y     / canvas.height,
      color:  isEraser ? null : currentColor,
      size:   currentSize,
      eraser: isEraser,
    });
    scheduleFlush();

    lastX = x;
    lastY = y;
  };

  canvas.onmouseup    = () => { drawing = false; };
  canvas.onmouseleave = () => { 
    drawing = false;
    wbCursor.style.display = "none";
    canvas.style.cursor = "default";
   };
  canvas.onmouseenter = () => { canvas.style.cursor = "none"; };


  // ============================================================
  // DRAW LINE HELPER
  // ============================================================
  function drawLine(x1, y1, x2, y2, color, size, eraser) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = eraser ? "rgba(0,0,0,1)" : color;
    ctx.lineWidth   = size;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.globalCompositeOperation = eraser ? "destination-out" : "source-over";
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  // ============================================================
  // FIREBASE — REAL TIME STROKE LISTENER
  // ============================================================
  wbRef.on("child_added", (snap) => {
    const d = snap.val();
    if (!d) return;
    drawLine(
      d.x1 * canvas.width,
      d.y1 * canvas.height,
      d.x2 * canvas.width,
      d.y2 * canvas.height,
      d.color || "#000000",
      d.size,
      d.eraser
    );
  });

  // ============================================================
  // FIREBASE — CLEAR SIGNAL LISTENER
  // ============================================================
  wbClrRef.on("value", (snap) => {
    if (snap.exists()) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  });

  // ============================================================
  // LOAD SNAPSHOT
  // ============================================================
  function loadSnapshot() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    wbRef.limitToLast(10000).once("value", (snap) => {
      snap.forEach((child) => {
        const d = child.val();
        drawLine(
          d.x1 * canvas.width,
          d.y1 * canvas.height,
          d.x2 * canvas.width,
          d.y2 * canvas.height,
          d.color || "#000000",
          d.size,
          d.eraser
        );
      });
    });
  }

  // ============================================================
  // DRAGGABLE PANEL
  // ============================================================
  let dx = 0, dy = 0, startX = 0, startY = 0;

  handle.onmousedown = (e) => {
    if (e.target === closeBtn) return;
    
    // Capture real rendered position BEFORE clearing the transform
    const rect = container.getBoundingClientRect();
    container.style.left      = rect.left + "px";
    container.style.top       = rect.top  + "px";
    container.style.transform = "none";

    startX = e.clientX;
    startY = e.clientY;

    document.onmousemove = (e) => {
      dx = startX - e.clientX;
      dy = startY - e.clientY;
      startX = e.clientX;
      startY = e.clientY;
      container.style.left = container.offsetLeft - dx + "px";
      container.style.top  = container.offsetTop  - dy + "px";
    };

    document.onmouseup = () => {
      document.onmousemove = null;
    };
  };

  // ============================================================
  // EXPOSE FOR /crtkica COMMAND
  // ============================================================
  window.resizeWhiteboardCanvas = resizeCanvas;
  window.loadWhiteboardSnapshot = loadSnapshot;
  // helper function to re-enable the "Get Word" button
  window.resetWordButton = () => {
    const wordBtn = document.getElementById("wb-word");
    if (wordBtn) {
      wordBtn.classList.remove("is-disabled");
    }
  };
}
/**
 * js/notifications.js
 */

class NotificationManager {
  constructor() {
    this.unreadCount = 0;
    this.vapidPublicKey = 'BIk7HNsAeC1XBnAxrr7jbDUiblf1ed3EEm7IbBEtnJCGTXIIcrmuvCMjDoQT4kqRkn8G-lCHbBhDhsmAtSPvijs';
    this.originalTitle = document.title;
    this.customIconHref = window.APP_CONFIG?.notificationIcon || "icon-192.png";
    this.badgeIconHref = window.APP_CONFIG?.notificationBadge || "notification-badge.png";
    this.isTabVisible = !document.hidden;
    
    this.deviceId = this.getOrCreateDeviceId();
    this.hasEnsuredPushThisSession = false;
    
    this.setupVisibilityListener();
    this.setupMobileBadge();
    this.checkBrowserNotificationSupport();
    this.setupFirstInteractionPrompt();
  }

  getOrCreateDeviceId() {
    const key = "pushDeviceId";
    let id = localStorage.getItem(key);
    if (!id) {
      id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(key, id);
    }
    return id;
  }

  getCurrentSpace() {
    return window.CHANNEL || window.DEFAULT_SPACE || "Linkice";
  }

  async markCurrentSpaceVisited() {
    if (!("serviceWorker" in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const worker = navigator.serviceWorker.controller || registration.active;
      worker?.postMessage({
        type: "SPACE_VISITED",
        space: this.getCurrentSpace(),
      });
    } catch (err) {
      console.warn("Could not clear the space notification:", err);
    }
  }
  
  setupVisibilityListener() {
    document.addEventListener("visibilitychange", () => {
      this.isTabVisible = !document.hidden;
      if (this.isTabVisible) this.clearNotifications();
    });
    window.addEventListener("focus", () => {
      this.isTabVisible = true;
      this.clearNotifications();
    });
  }
  
  setupMobileBadge() {
    if ("setAppBadge" in navigator) console.log("✅ App Badge API supported");
  }
  
  checkBrowserNotificationSupport() {
    if (!("Notification" in window)) return;
    console.log(`🔔 Browser notifications: ${Notification.permission}`);
  }

  setupFirstInteractionPrompt() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;

    const promptOnce = () => {
      document.removeEventListener("pointerdown", promptOnce, true);
      document.removeEventListener("keydown", promptOnce, true);
      if (Notification.permission !== "default") return;
      this.ensurePushSubscription(true).catch(() => {});
    };

    document.addEventListener("pointerdown", promptOnce, { capture: true, once: true });
    document.addEventListener("keydown", promptOnce, { capture: true, once: true });
  }

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  arrayBuffersEqual(a, b) {
    if (!a || !b || a.byteLength !== b.byteLength) return false;
    const aa = new Uint8Array(a);
    const bb = new Uint8Array(b);
    for (let i = 0; i < aa.length; i++) {
      if (aa[i] !== bb[i]) return false;
    }
    return true;
  }

  async ensurePushSubscription(allowPrompt = false) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    if (!("Notification" in window)) return false;
  
    try {
      // If user blocked notifications, stop here
      if (Notification.permission === "denied") return false;
  
      // Ask before awaiting serviceWorker.ready so the first-send click gesture is preserved.
      if (Notification.permission === "default") {
        if (!allowPrompt) return false;
        const p = await Notification.requestPermission();
        if (p !== "granted") return false;
      }

      const registration = await navigator.serviceWorker.ready;
  
      const applicationServerKey = this.urlBase64ToUint8Array(this.vapidPublicKey);
      let sub = await registration.pushManager.getSubscription();

      const existingKey = sub?.options?.applicationServerKey || null;
      if (sub && existingKey && !this.arrayBuffersEqual(existingKey, applicationServerKey)) {
        await sub.unsubscribe();
        sub = null;
        console.log("ℹ️ Old push subscription used a different VAPID key; resubscribing");
      }
  
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        console.log("✅ New push subscription created");
      } else {
        console.log("ℹ️ Existing push subscription found");
      }
  
      const subData = sub.toJSON();
      const payload = {
        ...subData,
        deviceId: this.deviceId,
        userId: firebase.auth().currentUser?.uid || null,
        username: window.myDisplayName || null,
        space: this.getCurrentSpace(),
        scope: registration.scope,
        userAgent: navigator.userAgent,
        standalone: window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true,
        lastVisitedAt: Date.now(),
        updatedAt: Date.now(),
      };
  
      await firebase.database().ref(`push_subscriptions/${this.deviceId}`).set(payload);
      console.log("✅ Push subscription synced to RTDB");
      this.hasEnsuredPushThisSession = true;
      return true;
    } catch (err) {
      console.error("❌ ensurePushSubscription failed:", err);
      return false;
    }
  }

  /**
   * NEW: Send a request to Vercel to trigger a Push for everyone
   */
  async triggerGlobalPush(username, text) {
    try {
      const space = this.getCurrentSpace();
      const tag = `linkice-space-${space.toLowerCase()}`;
      const notificationTitle = `Nove poruke u ${space}`;
      const notificationText = `Ima novih poruka u prostoru ${space}.`;
      const response = await fetch(window.APP_CONFIG?.notifyProxyUrl || 'https://my-proxy-vercel-kappa.vercel.app/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderUsername: username,
          senderUserId: firebase.auth().currentUser?.uid || null,
          senderDeviceId: this.deviceId,
          space,
          tag,
          url: `?space=${encodeURIComponent(space)}`,
          title: notificationTitle,
          message: notificationText,
          data: { space, tag },
        })
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error("❌ Push trigger failed:", response.status, errorText);
        return;
      }
      const result = await response.json().catch(() => null);
      const stats = result?.stats;
      if (stats) {
        console.info("Push trigger stats:", stats);
        if (stats.sent === 0 || stats.failed > 0 || stats.removedInvalid > 0) {
          console.warn("⚠️ Push trigger completed with no/partial delivery:", stats);
        }
      }
    } catch (err) {
      console.error('❌ Push trigger failed:', err);
    }
  }

  incrementUnread(options = {}) {
    if (this.isTabVisible) return;
    const { isSystem } = options;
    if (isSystem) return;
    
    this.unreadCount++;
    this.updateNotifications();
  }
  
  updateNotifications() {
    document.title = this.unreadCount > 0 ? `(${this.unreadCount}) ${this.originalTitle}` : this.originalTitle;
    this.updateFavicon();
    this.updateMobileBadge();
  }
  
  clearNotifications() {
    if (this.unreadCount > 0) {
      this.unreadCount = 0;
      this.updateNotifications();
    }
    this.markCurrentSpaceVisited();
  }
  
  updateFavicon() {
    let faviconLink = document.querySelector("link[rel*='icon']");
    if (!faviconLink) {
        faviconLink = document.createElement("link");
        faviconLink.rel = "icon";
        document.head.appendChild(faviconLink);
    }
    
    if (this.unreadCount === 0) {
        faviconLink.href = this.customIconHref;
        return;
    }
    
    const img = new Image();
    img.src = this.customIconHref;
    img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, 64, 64);
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(48, 16, 15, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.unreadCount > 99 ? "99+" : String(this.unreadCount), 48, 16);
        faviconLink.href = canvas.toDataURL("image/png");
    };
  }
  
  updateMobileBadge() {
    if (!("setAppBadge" in navigator)) return;
    if (this.unreadCount > 0) navigator.setAppBadge(this.unreadCount).catch(() => {});
    else navigator.clearAppBadge().catch(() => {});
  }
  
}

window.notificationManager = new NotificationManager();

window.setupNotificationIntegration = function() {
  let isInitialLoad = true;
  setTimeout(() => { isInitialLoad = false; }, 3000);

  if (window.appendMessage) {
    const originalAppendMessage = window.appendMessage;
    window.appendMessage = function(name, text, color, snapshotKey, data, options = {}) {
      const result = originalAppendMessage.apply(this, arguments);
      if (isInitialLoad || options.historical) return result;
      if (data && window.notificationManager) {
        const isMe = window.isOwnChatMessage
          ? window.isOwnChatMessage(data)
          : window.normalizeNickname(data.username) ===
            window.normalizeNickname(window.myDisplayName);
        if (!isMe && name !== "Sistem") {
          window.notificationManager.incrementUnread({ username: name, text: text });
        }
      }
      return result;
    };
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(window.setupNotificationIntegration, 500));
} else {
  setTimeout(window.setupNotificationIntegration, 500);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js", {
        scope: "./",
        updateViaCache: "none",
      });
      console.log("✅ SW Registered in scope:", reg.scope);
      reg.update().catch(() => {});

      if (window.notificationManager) {
        await window.notificationManager.ensurePushSubscription(false);
        await window.notificationManager.markCurrentSpaceVisited();
      }
    } catch (err) {
      console.error("❌ SW Registration failed:", err);
    }
  });
}
