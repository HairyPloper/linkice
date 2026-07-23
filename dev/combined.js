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
};/**
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

    const input = document.createElement("input");
    input.type      = "range";
    input.className = "volume-slider";
    input.min   = 0;
    input.max   = 100;
    input.value = 100; // Default: full volume
    input.addEventListener("input", function () {
      window.adjustVolume(uid, this.value);
    });

    vc.appendChild(input);
    card.appendChild(vc);
  }

  grid.appendChild(card);
};

// ============================================================
// VIDEO OVERLAY — SHOW
// Hides the emoji avatar and renders a live video track inside the card.
// Also wires up a click-to-fullscreen gesture on the video wrapper.
// ============================================================
window.playVideoInCard = (uid, track) => {
  const container = document.querySelector(`#user-${uid} .avatar-container`);
  if (!container) return;

  // Hide the emoji so the video fills the same space
  container.querySelector(".avatar").style.display = "none";

  // Reuse an existing wrapper div if one already exists (e.g. screen share restart)
  let videoDiv = document.getElementById(`video-wrapper-${uid}`) || document.createElement("div");
  videoDiv.id        = `video-wrapper-${uid}`;
  videoDiv.className = "video-container";

  // Click toggles fullscreen for the video
  videoDiv.onclick = (e) => {
    e.stopPropagation(); // Don't trigger the card's mute/active toggle
    if (!document.fullscreenElement) videoDiv.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  container.appendChild(videoDiv);
  track.play(videoDiv.id); // Agora renders the track into the div by its ID
};

// ============================================================
// VIDEO OVERLAY — HIDE
// Removes the video wrapper and restores the emoji avatar
// ============================================================
window.removeVideoFromCard = (uid) => {
  document.getElementById(`video-wrapper-${uid}`)?.remove();
  
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

// Screen share tracks (video + optional system audio)
let screenTrack      = null;
let screenAudioTrack = null;
let screenAudioCaptureTrack = null;
let screenAudioContext = null;

// System audio is usually much louder than a processed microphone. Reduce it
// before Agora mixes both tracks into the remote user's single audio stream.
const SCREEN_SHARE_AUDIO_GAIN = 0.18;

// Keep the UI volume stable when Agora republishes/replaces a remote track.
const remoteVolumes = new Map();

const LOCAL_SPEAKING_THRESHOLD = 14;
const REMOTE_SPEAKING_THRESHOLD = 8;
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

function isSoloVoiceUser(excludingUid = null) {
  const remoteUsers = window.client?.remoteUsers || [];
  return !remoteUsers.some((user) =>
    user.uid !== window.client?.uid && user.uid !== excludingUid
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
  if (!window.isVoiceJoined || !isSoloVoiceUser()) return;

  const elapsed = Date.now() - lastAfkActivityAt;
  const warningDelay = Math.max(0, AFK_TIMEOUT_MS - AFK_WARNING_MS - elapsed);
  const disconnectDelay = Math.max(0, AFK_TIMEOUT_MS - elapsed);

  if (AFK_WARNING_MS > 0) {
    afkWarningTimer = setTimeout(() => {
      if (!window.isVoiceJoined || !isSoloVoiceUser()) return;
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
    if (!window.isVoiceJoined || !isSoloVoiceUser()) return;
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
  if (!window.isVoiceJoined || !isSoloVoiceUser()) return;
  const now = Date.now();
  if (now - lastAfkActivityAt < AFK_ACTIVITY_THROTTLE_MS) return;
  lastAfkActivityAt = now;
  scheduleAfkTimers();
}

function startAfkTimer() {
  lastAfkActivityAt = Date.now();
  scheduleAfkTimers();
}

// Read-only AFK diagnostics for testing from the browser console.
window.getAfkStatus = () => {
  const voiceJoined = window.isVoiceJoined === true;
  const solo = voiceJoined && isSoloVoiceUser();
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
// Returns a Promise<{name, icon}> for a remote Agora UID.
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

    if (data?.displayName) {
      window.uidNameMap[uid] = data.displayName;
      const icon = data.icon || window.animals[Math.floor(Math.random() * window.animals.length)];
      return { name: data.displayName, icon };
    }

    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise(res => setTimeout(res, BASE_DELAY * Math.pow(2, attempt)));
    }
  }

  const fallback = String(uid);
  window.uidNameMap[uid] = fallback;
  return { name: fallback, icon: window.animals[Math.floor(Math.random() * window.animals.length)] };
}

function stopLocalVolumeMonitor() {
  if (!localVolumeMonitor) return;
  localVolumeMonitor.active = false;
  if (localVolumeMonitor.frameId) {
    cancelAnimationFrame(localVolumeMonitor.frameId);
  }
  if (localVolumeMonitor.silenceTimer) {
    clearTimeout(localVolumeMonitor.silenceTimer);
  }
  localVolumeMonitor.ctx.close?.().catch(() => {});
  document.getElementById(`avatar-${window.client.uid}`)?.classList.remove("speaking");
  localVolumeMonitor = null;
}

function startLocalVolumeMonitor(localAudioTrack) {
  stopLocalVolumeMonitor();
  const stream = new MediaStream([localAudioTrack.getMediaStreamTrack()]);
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.3;
  source.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);
  let silenceTimer = null;
  const DEACTIVATE_DELAY = 600;
  const monitor = {
    active: true,
    ctx,
    frameId: null,
    silenceTimer: null,
  };
  localVolumeMonitor = monitor;

  (function tick() {
    if (!monitor.active) return;
    analyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    if (avg > LOCAL_SPEAKING_THRESHOLD) markAfkActivity();
    const avatar = document.getElementById(`avatar-${window.client.uid}`);
    if (!avatar) {
      monitor.frameId = requestAnimationFrame(tick);
      return;
    }

    if (avg > LOCAL_SPEAKING_THRESHOLD) {
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

    monitor.frameId = requestAnimationFrame(tick);
  })();
}

// ============================================================
// SCREEN SHARE
// Toggle screen sharing on/off via the screen-btn button
// ============================================================
const screenBtn = document.getElementById("screen-btn");

/**
 * Routes captured system audio through Web Audio so its outgoing level can be
 * reduced. LocalAudioTrack.setVolume only changes local playback, so a custom
 * track is required to change what remote listeners receive.
 */
async function createAttenuatedScreenAudioTrack(capturedTrack) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || !AgoraRTC.createCustomAudioTrack) return capturedTrack;

  try {
    screenAudioContext = new AudioContextClass();
    await screenAudioContext.resume();

    const inputStream = new MediaStream([capturedTrack.getMediaStreamTrack()]);
    const source = screenAudioContext.createMediaStreamSource(inputStream);
    const gain = screenAudioContext.createGain();
    const destination = screenAudioContext.createMediaStreamDestination();

    gain.gain.value = SCREEN_SHARE_AUDIO_GAIN;
    source.connect(gain).connect(destination);

    screenAudioCaptureTrack = capturedTrack;
    return AgoraRTC.createCustomAudioTrack({
      mediaStreamTrack: destination.stream.getAudioTracks()[0],
    });
  } catch (error) {
    console.warn("Screen audio attenuation unavailable; using captured audio directly.", error);
    screenAudioContext?.close?.().catch(() => {});
    screenAudioContext = null;
    screenAudioCaptureTrack = null;
    return capturedTrack;
  }
}

if (screenBtn) screenBtn.onclick = async () => {
  if (!screenTrack) {
    // --- Start screen share ---
    try {
      const result = await AgoraRTC.createScreenVideoTrack(
        {
          encoderConfig: {
            width: 1920, height: 1080,
            frameRate: 30, bitrateMax: 4780,
          },
          optimizationMode: "motion", // Prioritise smoothness over sharpness
        },
        "auto" // Capture system audio if the browser/OS supports it
      );

      // createScreenVideoTrack returns an array when audio is captured,
      // or a single track when only video is available
      if (Array.isArray(result)) {
        screenTrack      = result[0];
        screenAudioTrack = await createAttenuatedScreenAudioTrack(result[1]);
      } else {
        screenTrack      = result;
        screenAudioTrack = null;
      }

      // Publish whichever tracks we have
      await window.client.publish(
        screenAudioTrack ? [screenTrack, screenAudioTrack] : screenTrack
      );

      // Update button label to indicate an active share
      if (screenBtn) {
        screenBtn.innerHTML = "<span>🖥️</span> Prekini";
        screenBtn.classList.add("active");
      }

      // Show the screen feed inside the local user's avatar card
      window.playVideoInCard(window.client.uid, screenTrack);

      // Stop sharing automatically if the user ends it via the browser UI
      screenTrack.on("track-ended", stopScreenShare);

    } catch (e) {
      console.error(e);
      await stopScreenShare();
    }
  } else {
    // --- Stop screen share ---
    stopScreenShare();
  }
};

/** Unpublishes and cleans up all screen share tracks */
async function stopScreenShare() {
  if (screenTrack) {
    const track = screenTrack;
    screenTrack = null;
    await window.client.unpublish(track).catch(() => {});
    track.stop();
    track.close();
  }

  if (screenAudioTrack) {
    const track = screenAudioTrack;
    screenAudioTrack = null;
    await window.client.unpublish(track).catch(() => {});
    track.stop();
    track.close();
  }

  // When attenuation is active, the browser capture track feeds the custom
  // published track and must be released separately.
  if (screenAudioCaptureTrack) {
    screenAudioCaptureTrack.stop();
    screenAudioCaptureTrack.close();
    screenAudioCaptureTrack = null;
  }

  if (screenAudioContext) {
    await screenAudioContext.close().catch(() => {});
    screenAudioContext = null;
  }

  // Restore button to its default state
  if (screenBtn) {
    screenBtn.innerHTML = "<span>🖥️</span> Podeli ekran";
    screenBtn.classList.remove("active");
  }

  // Remove the video overlay from the local user's card
  window.removeVideoFromCard(window.client.uid);
}

// ============================================================
// AGORA EVENT LISTENERS
// ============================================================

/**
 * Fired when a remote user publishes an audio or video track.
 * Subscribe immediately, then resolve the real display name from Firebase
 * before rendering the card — this avoids showing a raw numeric UID.
 */
window.client.on("user-published", async (user, mediaType) => {
  await window.client.subscribe(user, mediaType);

  if (mediaType === "audio") {
    user.audioTrack.play();
    user.audioTrack.setVolume(remoteVolumes.get(String(user.uid)) ?? 100);
  }

  if (mediaType === "video") {
    window.playVideoInCard(user.uid, user.videoTrack);
  }
});

/** Fired when a remote user unpublishes an audio or video track.
 *  We remove video share screen wrapper after user stops sharing
 */
window.client.on("user-unpublished", (user, mediaType) => {
  if (mediaType === "video") {
    window.removeVideoFromCard(user.uid);
  }
});

/**
 * Fired when a remote user leaves the channel.
 * Plays a low tone and posts a system message. Firebase presence owns card
 * removal so a temporary Agora disconnect cannot hide a still-present user.
 */
window.client.on("user-left", (user) => {
  const displayName = window.getDisplayName(user.uid);
  delete window.uidNameMap[user.uid];
  remoteVolumes.delete(String(user.uid));
  // Start fresh only when this departure leaves the local user alone.
  if (window.isVoiceJoined && isSoloVoiceUser(user.uid)) startAfkTimer();
  window._playTone(440, 0.2); // Lower tone = departure
  if (window.appendMessage)
    window.appendMessage("Sistem", `**${displayName}** je otišao.`, "#fbbf24");

});

/**
 * Fired when a remote user joins the channel.
 * Resolves their display name from Firebase, caches it, draws their card,
 * and plays a higher tone to signal arrival.
 */
window.client.on("user-joined", async (user) => {
  // The AFK countdown applies only while no other voice user is present.
  clearAfkTimers();
  const { name, icon } = await resolveRemoteName(user.uid);
  // Idempotent recovery path: Firebase normally creates the card, but an
  // Agora reconnect must also restore it if an earlier event removed it.
  window.drawUser(user.uid, name, icon, false);
  if (window.appendMessage)
    window.appendMessage("Sistem", `**${name}** se priključio.`, "#fbbf24");
  if (user.uid !== window.client.uid) window._playTone(660, 0.1);
});

/**
 * Volume indicator — fires every 2 s with audio levels for all active speakers.
 * Adds/removes the .speaking class on avatars to drive the neon pulse animation.
 */
const speakingTimers = new Map();
const SPEAKING_LINGER_MS = 400;

window.client.on("volume-indicator", (volumes) => {
  volumes.forEach((vol) => {
    const id = vol.uid === 0 ? window.client.uid : vol.uid;
    const avatar = document.getElementById(`avatar-${id}`);
    if (!avatar) return;

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
window.client.on("connection-state-change", (curState, prevState) => {
  const s = document.getElementById("status");
  if (!s) return;

  if (curState === "RECONNECTING") {
    s.innerText   = "⏳ Ponovno povezivanje...";
    s.style.color = "#fbbf24";
  }

  if (curState === "DISCONNECTED" && prevState === "RECONNECTING") {
    s.innerText   = "Veza prekinuta";
    s.style.color = "#f87171";
    if (window.appendMessage)
      window.appendMessage("Sistem", "Veza je prekinuta.", "#f87171");
  }

  if (curState === "CONNECTED" && prevState === "RECONNECTING") {
    s.innerText   = isMuted ? "Mutiran 🤐" : "Povezan • Live";
    s.style.color = isMuted ? "#f87171"    : "#4ade80";
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

if (joinBtn) joinBtn.onclick = async () => {
  const btn = joinBtn;
  btn.disabled = true;

  try {
    // --- 1. ACQUIRE MICROPHONE ---
    let audioTrack;
    try {
      audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        AEC: window.audioSettings?.aec !== false,
        AGC: window.audioSettings?.agc !== false,
        ANS: window.audioSettings?.ans !== false,
      });
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
    window.client.enableAudioVolumeIndicator(200, 3);

    // --- 4. PUBLISH AUDIO TRACK ---
    startLocalVolumeMonitor(localTracks.audioTrack);
    await window.client.publish(localTracks.audioTrack);
    window.isVoiceJoined = true;
    startAfkTimer();

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

    const s = document.getElementById("status");
    if (s) { s.innerText = "Povezan • Live"; s.style.color = "#4ade80"; }

    if (window.innerWidth < 768) {
      window.chatContainer.classList.add("collapsed");
      document.getElementById("settings-btn").classList.add("hidden");
    }

  } catch (e) {
    console.error(e);
    // Attempt to clean up Agora state if join/publish failed after partial success
    window.isVoiceJoined = false;
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
    clearAfkTimers();

    // --- 1. WAKE LOCK ---
    if (window.wakeLock) {
      await window.wakeLock.release();
      window.wakeLock = null;
    }

    // --- 2. SCREEN SHARE ---
    if (screenTrack) await stopScreenShare();

    // --- 3. LOCAL AUDIO TRACK ---
    stopLocalVolumeMonitor();
    if (localTracks.audioTrack) {
      localTracks.audioTrack.stop();
      localTracks.audioTrack.close();
      localTracks.audioTrack = null;
    }

    // --- 4. AGORA CLIENT and PRESENCE ---
    await window.client.leave();
    try {
      await window.claimPresenceIdentity(window.myAgoraUID, { voiceJoined: false });
    } catch (presenceError) {
      console.error("Chat identity could not be preserved after leaving voice:", presenceError);
    }

    // --- 5. RESET LOCAL STATE ---
    isMuted = false;
    speakingTimers.forEach((timer) => clearTimeout(timer));
    speakingTimers.clear();
    remoteVolumes.clear();

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
        : "Izašao si iz kanala.";
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
// MUTE TOGGLE
// Enables/disables the local audio track without unpublishing it
// ============================================================
window.toggleMute = async () => {
  if (!localTracks.audioTrack) return;

  isMuted = !isMuted;

  // setEnabled(false) mutes without destroying the track
  await localTracks.audioTrack.setEnabled(!isMuted);

  if (!isMuted) {
    startLocalVolumeMonitor(localTracks.audioTrack); // ← restart fresh
  }

  // Update mute state in Firebase so remote users can see it in their UI
  firebase.database()
  .ref(`presence/${window.CHANNEL}/${window.client.uid}`)
  .update({ muted: isMuted });

  // Visually dim the local avatar when muted
  const avatarEl = document.getElementById(`avatar-${window.client.uid}`);
  if (avatarEl) avatarEl.classList.toggle("muted", isMuted);

  // Reflect mute state in the header status text
  const s = document.getElementById("status");
  if (s) {
    s.innerText    = isMuted ? "Mutiran 🤐" : "Povezan • Live";
    s.style.color  = isMuted ? "#f87171"    : "#4ade80";
  }
};

// ============================================================
// VOLUME ADJUSTMENT
// Sets the playback volume for a specific remote user (0–100)
// ============================================================
window.adjustVolume = (uid, vol) => {
  const volume = Math.max(0, Math.min(100, Number.parseInt(vol, 10) || 0));
  remoteVolumes.set(String(uid), volume);
  const user = window.client.remoteUsers.find((u) => u.uid == uid);
  if (user?.audioTrack) user.audioTrack.setVolume(volume);
};
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
) => {
  if (!chatMessages) return;

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
    renderStandardMessage(msgDiv, name, text, color, timeString);
  }

  const previousMessage = [
    ...chatMessages.querySelectorAll(".chat-msg:not(.system-msg):not(.chat-msg--system)"),
  ].pop();
  if (
    !isSystem &&
    previousMessage &&
    previousMessage.classList.contains(isMe ? "chat-msg--own" : "chat-msg--other")
  ) {
    msgDiv.classList.add("chat-msg--connected");
  }

  chatMessages.appendChild(msgDiv);
  // Increment unread badge if chat is collapsed
  if (chatContainer.classList.contains("collapsed") && name !== "Sistem" && !isMe) {
    const badge = document.getElementById("unread-badge");
    if (badge) {
      const current = parseInt(badge.innerText) || 0;
      badge.innerText = current + 1;
      badge.classList.remove("hidden");
    }
  }
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Second scroll after a short delay to account for late-rendering media
  setTimeout(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 200);
};

// ============================================================
// STANDARD MESSAGE RENDERER
// Handles bot messages differently — splits question/answer visually
// ============================================================
function renderStandardMessage(msgDiv, name, text, color, timeString) {
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

  renderTextWithMedia(contentEl, text);
}

function renderTextWithMedia(container, text) {
  const value = String(text || "");
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(value)) !== null) {
    const url = match[0];
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(value.slice(lastIndex, match.index)));
    }
    container.appendChild(createMediaElement(url));
    lastIndex = match.index + url.length;
  }

  if (lastIndex < value.length) {
    container.appendChild(document.createTextNode(value.slice(lastIndex)));
  }
}

function createMediaElement(url) {
  const isImage   = /\.(jpeg|jpg|gif|png|webp)$/i.test(url);
  const isVideo   = /\.(mp4|webm|ogg)$/i.test(url);
  const isAudio   = /\.(mp3|wav)$/i.test(url);
  const isDoc     = /\.(zip|rar|7z|pdf|doc|docx|txt)$/i.test(url);
  const ytMatch   = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  const spotifyMatch = url.match(/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
  const fileName = url.split("/").pop().split("?")[0];

  if (isImage) {
    const card = document.createElement("div");
    card.className = "media-card";

    const img = document.createElement("img");
    img.src = url;
    img.className = "media-img";
    img.addEventListener("click", () => {
      img.requestFullscreen?.() || window.open(url, "_blank", "noopener");
    });

    const link = createMediaLink(url, `ðŸ–¼ ${fileName}`, "media-link");
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

    const link = createMediaLink(url, `ðŸŽ¬ ${fileName}`, "media-link");
    card.append(video, link);
    return card;
  }

  if (isAudio) {
    const card = document.createElement("div");
    card.className = "media-card media-card--audio";

    const icon = document.createElement("span");
    icon.className = "media-audio-icon";
    icon.textContent = "ðŸŽµ";

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
    const ext = fileName.split(".").pop().toUpperCase();
    const icons = {
      ZIP: "ðŸ—œ", RAR: "ðŸ—œ", "7Z": "ðŸ—œ",
      PDF: "ðŸ“„", DOC: "ðŸ“", DOCX: "ðŸ“", TXT: "ðŸ“ƒ",
    };

    const card = document.createElement("div");
    card.className = "media-card media-card--doc";
    const icon = document.createElement("span");
    icon.className = "media-doc-icon";
    icon.textContent = icons[ext] || "ðŸ“";

    const info = document.createElement("div");
    info.className = "media-doc-info";
    const name = document.createElement("span");
    name.className = "media-doc-name";
    name.textContent = fileName;
    const extEl = document.createElement("span");
    extEl.className = "media-doc-ext";
    extEl.textContent = ext;
    info.append(name, extEl);

    const download = createMediaLink(url, "Preuzmi", "media-doc-btn");
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

  return createMediaLink(url, `ðŸ”— ${url}`, "media-link-plain");
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
window.sendMessage = async () => {
  const text = (chatInput && chatInput.value ? chatInput.value : "").trim();
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
  try {
    // Ensure push subscription from a chat user gesture (not only voice join).
    if (window.notificationManager && !window.notificationManager.hasEnsuredPushThisSession) {
      await window.notificationManager.ensurePushSubscription(true);
    }

    await window.chatRef.push({
      username: window.myDisplayName,
      text:      text,
      color:     window.myColor || "#805ff5",
      ...getChatSenderMetadata(),
      timestamp: Date.now(),
    });
    chatInput.value = "";
    chatInput.focus();

    // Trigger a global push notification for firebase notification subscribers (e.g. mobile users who have left the tab)
    if (window.notificationManager) {
    window.notificationManager.triggerGlobalPush(window.myDisplayName, text);
  }
  } catch (err) {
    console.error("Greška pri slanju:", err);
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
        window.appendMessage("Sistem", `📊 Mreža: ${rtc.RTT}ms | Korisnika: ${rtc.UserCount}`, "#fbbf24");
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
function startChat() {
  window.chatRef = firebase.database().ref(`messages/${window.CHANNEL}`);

  // Prepend the welcome banner (ASCII art)
  window.appendSystemHTML(welcomeArt, true);

  // Listen to the last 50 messages; also fires for each new incoming message
  window.chatRef.limitToLast(50).on("child_added", (snapshot) => {

    // Remove skeleton loader on first real message
    const skeleton = document.getElementById("chat-skeleton-loader");
    if (skeleton) skeleton.remove();

    const message = snapshot.val();
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
        window.appendMessage(prefix, message.text, "#d1d5db", message_key, message);
      }
      return;
    }
    // Check if the message is a guess in an active whiteboard game
    if (message.username !== "Sistem") {
      const gameRef = firebase.database().ref(`whiteboard-game/${window.CHANNEL}`);
      // Transaction runs atomically — only one client wins the race
      gameRef.transaction((game) => {
        // If there's no active game, or the guess is from the drawer, or it's incorrect, abort the transaction
        if (!game || !game.active) return;
        const isDrawerGuess = game.drawerSessionId && message.senderSessionId
          ? String(message.senderSessionId) === String(game.drawerSessionId)
          : (message.username || "") === game.drawer;
        if (isDrawerGuess) return;
        if ((message.text || "").toLowerCase().trim() !== game.word.toLowerCase()) return;
        // show to all users a confetti celebration for the correct guess
        if (window.launchWhiteboardConfetti) window.launchWhiteboardConfetti();
        // Re-enable the "Get Word" button for the next game
        if (window.resetWordButton) window.resetWordButton();
        // update the game state to mark it as inactive (ended)
        return { ...game, active: false };
      }, (error, committed, snapshot) => {
        if (!committed) return;
        const game = snapshot.val();
        // Announce the winner in chat and clean up the game state
        window.chatRef.push({
          username:  "Sistem",
          text:      `🎉 ${message.username} pogodio reč: ${game.word}!`,
          color:     "#fbbf24",
          timestamp: Date.now(),
        });
        gameRef.remove();
        clearInterval(window.timerInterval);
      });
    }
        // Standard messages and polls
        window.appendMessage(message.username, message.text, message.color || "#805ff5", message_key, message);
      });

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
      const avatar = document.getElementById(`avatar-${uid}`);
      if (avatar) avatar.classList.toggle("muted", data.muted === true);
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
window.vote = (pollId, option) => {
  const votedKey = `voted_${pollId}`;
  if (localStorage.getItem(votedKey)) {
    window.appendMessage("Sistem", "Već si glasao u ovoj anketi.", "#ef4444");
    return;
  }

  const pollRef = window.chatRef.child(`${pollId}/votes/${getPollVoteKey(option)}`);

  // Atomic increment — safe under concurrent updates
  pollRef.transaction((currentVotes) => (currentVotes || 0) + 1);

  // Mark as voted so the user can't vote again in this session
  localStorage.setItem(votedKey, "true");
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
  if (window.appendMessage)
    window.appendMessage("Sistem", `Slanje fajla: ${file.name}...`, "#fbbf24");

  const expirySelect = document.getElementById("upload-expiry");
  const expiry  = expirySelect ? expirySelect.value : "trajno";
  const fileUrl = await uploadFile(file, expiry);

  if (fileUrl && fileUrl.startsWith("http")) {
    // Post the URL to chat — the media formatter will embed it appropriately
    window.chatRef.push({
      username:  window.myDisplayName,
      ...getChatSenderMetadata(),
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
// GLOBAL KEYBOARD SHORTCUT
// Tab focuses the chat input from anywhere on the page
// ============================================================
document.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && document.activeElement !== chatInput) {
    e.preventDefault();
    chatInput.focus();
  }
});

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

  dragHandle.onmousedown = (e) => {
    if (e.button !== 0) return; // Left-click only

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
      chatContainer.style.top   = chatContainer.offsetTop  - y + "px";
      chatContainer.style.left  = chatContainer.offsetLeft - x + "px";
      chatContainer.style.bottom = "auto";
      chatContainer.style.right  = "auto";
    };

    document.onmouseup = () => {
      document.onmousemove = null;
    };
  };

  // Distinguish a click (collapse toggle) from a drag (reposition)
  dragHandle.onclick = () => {
    if (!isDragging) {
      chatContainer.classList.toggle("collapsed");
      settingsBtn.classList.toggle("hidden");

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
    window.appendMessage = function(name, text, color, snapshotKey, data) {
      const result = originalAppendMessage.apply(this, arguments);
      if (isInitialLoad) return result;
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
