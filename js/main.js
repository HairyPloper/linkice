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
  afkTimeoutMs: 10 * 60 * 1000,
  afkWarningMs: 5 * 60 * 1000,
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

function getPresenceOwner() {
  return {
    ownerUserId: firebase.auth().currentUser?.uid || null,
    ownerDeviceId:
      window.notificationManager?.deviceId ||
      localStorage.getItem("pushDeviceId") ||
      null,
  };
}

function presenceValues(presence, ownUid, owner = {}) {
  return Object.entries(presence || {})
    .filter(([uid, value]) => {
      if (String(uid) === String(ownUid)) return false;

      const sameUser = !!(
        owner.ownerUserId &&
        value?.ownerUserId &&
        value.ownerUserId === owner.ownerUserId
      );
      const sameDevice = !!(
        owner.ownerDeviceId &&
        value?.ownerDeviceId &&
        value.ownerDeviceId === owner.ownerDeviceId
      );
      return !sameUser && !sameDevice;
    })
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

/** Select an identity not occupied by another active participant. */
window.selectAvailableIdentity = (presence, ownUid, owner = getPresenceOwner()) => {
  const others = presenceValues(presence, ownUid, owner);
  const usedNames = new Set(
    others
      .map((entry) => window.normalizeNickname(entry.identityKey || entry.displayName))
      .filter(Boolean),
  );
  const usedIcons = new Set(others.map((entry) => entry.icon).filter(Boolean));
  const preferred = window.preferredDisplayName;
  const preferredIsFree = !usedNames.has(window.normalizeNickname(preferred));

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
  const owner = getPresenceOwner();
  const disconnectRegistration = ownPresenceRef.onDisconnect();

  // Register cleanup before writing presence. Otherwise a fast reload can
  // disconnect after the write but before onDisconnect is armed, leaving an
  // orphaned nickname reservation in Firebase.
  await disconnectRegistration.remove();

  let result;
  try {
    result = await presenceRef.transaction((currentPresence) => {
      const presence = { ...(currentPresence || {}) };
      const selected = window.selectAvailableIdentity(presence, uid, owner);
      presence[String(uid)] = {
        ...(presence[String(uid)] || {}),
        displayName: selected.displayName,
        identityKey: window.normalizeNickname(selected.displayName),
        icon: selected.icon,
        ownerUserId: owner.ownerUserId,
        ownerDeviceId: owner.ownerDeviceId,
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
    temporaryName:
      window.usernameKind === "custom" &&
      window.normalizeNickname(claimed.displayName) !==
        window.normalizeNickname(window.preferredDisplayName),
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

/** Change a nickname, rejecting case-insensitive conflicts in this space. */
window.changeNickname = async (newNick) => {
  const nickname = String(newNick || "").trim();
  if (!nickname) return false;

  const presenceRef = firebase.database().ref(`presence/${window.CHANNEL}`);
  const ownUid = window.client?.uid || window.myAgoraUID;
  const owner = getPresenceOwner();

  const result = await presenceRef.transaction((currentPresence) => {
    const presence = { ...(currentPresence || {}) };
    const occupied = presenceValues(presence, ownUid, owner).some(
      (entry) => window.normalizeNickname(entry.identityKey || entry.displayName) ===
        window.normalizeNickname(nickname),
    );
    if (occupied) return;
    presence[String(ownUid)] = {
      ...(presence[String(ownUid)] || {}),
      displayName: nickname,
      identityKey: window.normalizeNickname(nickname),
      icon: window.myIcon,
      ownerUserId: owner.ownerUserId,
      ownerDeviceId: owner.ownerDeviceId,
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
