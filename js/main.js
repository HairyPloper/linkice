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

window.APP_CONFIG = {
  aiProxyUrl: "https://my-proxy-vercel-kappa.vercel.app/api/gemini",
  notifyProxyUrl: "https://my-proxy-vercel-kappa.vercel.app/api/notify",
  corsProxyUrl: "https://corsproxy.io/?",
  notificationIcon: "icon-192.png",
  notificationBadge: "notification-badge.png",
};

// ============================================================
// PARTICIPANT IDENTITY
// URL and saved names are preferred. Anonymous visitors receive a funny name;
// Firebase presence resolves active name and icon collisions per space.
// ============================================================
const params = new URLSearchParams(window.location.search);
const queryName = (params.get("name") || "").trim();
const savedUsername = (localStorage.getItem("savedUsername") || "").trim();
const savedUsernameKind = localStorage.getItem("savedUsernameKind");
const isLegacyGuest = (value) => /^Gost_\d+$/.test(value || "");

window.funnyNames = [
  "SvemirskaKifla", "LudiKrompir", "TajniCevap", "PospaniNindza",
  "BrziPuz", "ZbunjeniPingvin", "KraljPaprika", "DiskoJazavac",
  "TurboPalacinka", "MudraSarma", "LeteciToster", "NevidljiviBurek",
  "KosmickiPasulj", "GospodinKeks", "VeseliVampir", "MisteriozniAjvar",
  "PevajuciRobot", "ZeleniZmaj", "CudniOblak", "PlesuciKaktus",
];
// Separate numeric ID purely for Agora — never exposed to users
window.myAgoraUID = Math.floor(100000 + Math.random() * 900000);
// Display name priority: URL param → saved → generated funny name
window.isVoiceJoined = false;

let preferredName;
let usernameKind;
const queryIsPropagatedLegacy =
  queryName && isLegacyGuest(savedUsername) && queryName === savedUsername;

if (queryName && !queryIsPropagatedLegacy) {
  preferredName = queryName;
  usernameKind = queryName === savedUsername && savedUsernameKind === "generated"
    ? "generated"
    : "custom";
} else if (savedUsername && !isLegacyGuest(savedUsername)) {
  preferredName = savedUsername;
  usernameKind = savedUsernameKind === "generated" ? "generated" : "custom";
} else {
  preferredName = window.funnyNames[Math.floor(Math.random() * window.funnyNames.length)];
  usernameKind = "generated";
}

window.preferredDisplayName = preferredName;
window.usernameKind = usernameKind;
window.myDisplayName = preferredName;
localStorage.setItem("savedUsername", preferredName);
localStorage.setItem("savedUsernameKind", usernameKind);


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
  const freeNames = window.funnyNames.filter((name) => !usedNames.has(name.toLowerCase()));
  if (freeNames.length) return randomFrom(freeNames);

  const offset = Math.floor(Math.random() * 900);
  for (const base of window.funnyNames) {
    for (let numberIndex = 0; numberIndex < 900; numberIndex++) {
      const suffix = 100 + ((offset + numberIndex) % 900);
      const candidate = `${base}_${suffix}`;
      if (!usedNames.has(candidate.toLowerCase())) return candidate;
    }
  }

  let extraSuffix = 1000;
  while (usedNames.has(`svemirskakifla_${extraSuffix}`)) extraSuffix++;
  return `SvemirskaKifla_${extraSuffix}`;
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

/** Select an identity not occupied by another active participant. */
window.selectAvailableIdentity = (presence, ownUid) => {
  const others = presenceValues(presence, ownUid);
  const usedNames = new Set(
    others.map((entry) => String(entry.displayName || "").trim().toLowerCase()).filter(Boolean),
  );
  const usedIcons = new Set(others.map((entry) => entry.icon).filter(Boolean));
  const preferred = window.preferredDisplayName;
  const preferredIsFree = !usedNames.has(preferred.toLowerCase());

  return {
    displayName: preferredIsFree ? preferred : pickFallbackName(usedNames),
    icon: !usedIcons.has(window.myIcon) ? window.myIcon : pickFallbackIcon(usedIcons),
    temporaryName: !preferredIsFree && window.usernameKind === "custom",
  };
};

window.applyIdentity = (identity) => {
  const previousName = window.myDisplayName;
  window.myDisplayName = identity.displayName;
  window.myIcon = identity.icon;
  localStorage.setItem("savedIcon", identity.icon);

  if (window.usernameKind === "generated") {
    window.preferredDisplayName = identity.displayName;
    localStorage.setItem("savedUsername", identity.displayName);
    localStorage.setItem("savedUsernameKind", "generated");
  }

  window.identityNotice = identity.temporaryName && identity.displayName !== previousName
    ? `Nadimak **${window.preferredDisplayName}** je zauzet u ovom prostoru. Privremeno koristiš **${identity.displayName}**.`
    : null;
};

/** Best-effort early selection so chat starts with an available identity. */
window.prepareIdentityForSpace = async () => {
  try {
    const snapshot = await firebase.database().ref(`presence/${window.CHANNEL}`).once("value");
    window.applyIdentity(window.selectAvailableIdentity(snapshot.val(), window.myAgoraUID));
  } catch (error) {
    console.warn("Identity check failed; it will be retried before joining voice.", error);
  }
};

/** Atomically claim a unique name and icon in this space. */
window.claimPresenceIdentity = async (uid) => {
  const presenceRef = firebase.database().ref(`presence/${window.CHANNEL}`);
  const result = await presenceRef.transaction((currentPresence) => {
    const presence = { ...(currentPresence || {}) };
    const selected = window.selectAvailableIdentity(presence, uid);
    presence[String(uid)] = {
      ...(presence[String(uid)] || {}),
      displayName: selected.displayName,
      icon: selected.icon,
    };
    return presence;
  });

  if (!result.committed) throw new Error("Identity claim was not committed.");
  const claimed = result.snapshot.child(String(uid)).val();
  const selected = {
    displayName: claimed.displayName,
    icon: claimed.icon,
    temporaryName:
      window.usernameKind === "custom" &&
      claimed.displayName.toLowerCase() !== window.preferredDisplayName.toLowerCase(),
  };
  window.applyIdentity(selected);
  await presenceRef.child(String(uid)).onDisconnect().remove();
  return selected;
};

/** Change a nickname, rejecting case-insensitive conflicts in this space. */
window.changeNickname = async (newNick) => {
  const nickname = String(newNick || "").trim();
  if (!nickname) return false;

  const presenceRef = firebase.database().ref(`presence/${window.CHANNEL}`);
  const ownUid = window.client?.uid || window.myAgoraUID;

  if (window.isVoiceJoined) {
    const result = await presenceRef.transaction((currentPresence) => {
      const presence = { ...(currentPresence || {}) };
      const occupied = presenceValues(presence, ownUid).some(
        (entry) => String(entry.displayName || "").trim().toLowerCase() === nickname.toLowerCase(),
      );
      if (occupied) return;
      presence[String(ownUid)] = {
        ...(presence[String(ownUid)] || {}),
        displayName: nickname,
        icon: window.myIcon,
      };
      return presence;
    });
    if (!result.committed) return false;
  } else {
    const snapshot = await presenceRef.once("value");
    const occupied = presenceValues(snapshot.val(), ownUid).some(
      (entry) => String(entry.displayName || "").trim().toLowerCase() === nickname.toLowerCase(),
    );
    if (occupied) return false;
  }

  window.preferredDisplayName = nickname;
  window.myDisplayName = nickname;
  window.usernameKind = "custom";
  window.identityNotice = null;
  localStorage.setItem("savedUsername", nickname);
  localStorage.setItem("savedUsernameKind", "custom");
  if (window.client?.uid) {
    window.uidNameMap[window.client.uid] = nickname;
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
