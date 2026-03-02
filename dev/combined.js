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
window.myIcon = window.animals[Math.floor(Math.random() * window.animals.length)];/**
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
};/**
 * js/ui.js
 * User interface logic — video background, background music,
 * particle effects (snow/hearts), user card rendering, and video overlays.
 */

// ============================================================
// DOM REFERENCES
// ============================================================
const bgVideo     = document.getElementById("bgVideo");
const videoToggle = document.getElementById("videoToggle");
const audio       = document.getElementById("myAudio");
const audioBtn    = document.getElementById("audioToggle");
const snowToggle  = document.getElementById("snowToggle");

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
// SNOW / PARTICLE TOGGLE (mobile only, hidden on desktop via CSS)
// Restarts the particle system if toggled on; particles fade out naturally if off
// ============================================================
if (snowToggle) {
  snowToggle.onclick = () => {
    window.isSnowing = !window.isSnowing;

    if (window.isSnowing) {
      window.restartSnow(); // Refill the particle pool immediately
    }

    // Dim the button when the effect is off
    snowToggle.style.opacity = window.isSnowing ? "1" : "0.5";
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
      const safeUsername = window.escapeHtml ? window.escapeHtml(username) : username;
      // Only overwrite if the current text looks like a raw number (the fallback)
    const currentText = nameEl.textContent.replace(" (Ti)", "").trim();
    if (currentText !== username) {
      nameEl.textContent = `${safeUsername}${isMe ? " (Ti)" : ""}`;
    }
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

  avatarContainer.appendChild(avatar);
  card.appendChild(avatarContainer);

  // --- Username label ---
  const nameDiv = document.createElement("div");
  nameDiv.className = "username";
  // Escape to prevent XSS if the username contains HTML characters
  nameDiv.textContent = `${window.escapeHtml ? window.escapeHtml(username) : username}${isMe ? " (Ti)" : ""}`;
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

// ============================================================
// PARTICLE EFFECT (Snow / Hearts)
// IIFE so all canvas state is encapsulated and doesn't pollute global scope.
// Renders either ❄ snowflakes or ❤ hearts depending on the username.
// ============================================================
(function () {

  // Fixed canvas sits behind all content (z-index: -1, pointer-events: none)
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    position:      "fixed",
    top:           "0",
    left:          "0",
    width:         "100vw",
    height:        "100vh",
    pointerEvents: "none", // Clicks pass straight through
    zIndex:        "-1",
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let particles = [];

  // Global flag read by the snow toggle button and the draw loop
  window.isSnowing = true;

  // Easter egg: users whose name starts with "Pako" get red hearts instead of snowflakes
  const isPako = window.myDisplayName?.startsWith("Pako"); // ✅

  // ---- Particle factory ----
  // yPos lets us distribute particles across the full height on init,
  // or start them above the viewport (-canvas.height) when restarting
  function createParticle(yPos) {
    return {
      x:      Math.random() * canvas.width,
      y:      yPos,
      speed:  0.5 + Math.random(),        // Slight speed variance for depth effect
      size:   isPako ? 15 : 3,
      symbol: isPako ? "❤" : "❄",
    };
  }

  /**
   * Refills the particle pool up to 100 when the effect is toggled back on.
   * New particles start above the viewport so they drift in naturally.
   */
  window.restartSnow = () => {
    const targetCount = 100;
    if (particles.length < targetCount) {
      const toAdd = targetCount - particles.length;
      for (let i = 0; i < toAdd; i++) {
        particles.push(createParticle(Math.random() * -canvas.height));
      }
    }
  };

  /** Resizes the canvas to match the viewport and reseeds the particle array */
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    // Distribute initial particles across the full canvas height
    particles = Array.from({ length: 100 }, () =>
      createParticle(Math.random() * canvas.height)
    );
  }

  window.addEventListener("resize", resize);
  resize(); // Initial sizing

  // ---- Draw loop ----
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Pause loop when nothing to draw — resume via restartSnow
    if (particles.length === 0 && !window.isSnowing) {
      setTimeout(() => requestAnimationFrame(draw), 1000);
      return;
    }
    // Iterate backwards so splicing doesn't skip items
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      ctx.fillStyle = isPako ? "red" : "white";
      ctx.font      = `${p.size * 2}px serif`;
      ctx.fillText(p.symbol, p.x, p.y);

      p.y += p.speed; // Move particle downward each frame

      // When a particle exits the bottom of the canvas:
      if (p.y > canvas.height) {
        if (window.isSnowing) {
          // Loop it back to the top with a new random X position
          p.y = -20;
          p.x = Math.random() * canvas.width;
        } else {
          // Remove it — existing particles "fall out" gracefully instead of cutting off instantly
          particles.splice(i, 1);
        }
      }
    }

    requestAnimationFrame(draw);
  }

  draw();
})();
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

// ============================================================
// SHARED HELPER — resolveRemoteName
// Returns a Promise<{name, icon}> for a remote Agora UID.
// Always does a fresh Firebase read so it's not affected by
// the race between user-joined and user-published.
// Result is also cached in uidNameMap for getDisplayName().
// ============================================================
async function resolveRemoteName(uid) {
  const MAX_ATTEMPTS = 5;
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

// ============================================================
// SCREEN SHARE
// Toggle screen sharing on/off via the screen-btn button
// ============================================================
const screenBtn = document.getElementById("screen-btn");

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
        screenAudioTrack = result[1];
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
    }
  } else {
    // --- Stop screen share ---
    stopScreenShare();
  }
};

/** Unpublishes and cleans up all screen share tracks */
async function stopScreenShare() {
  if (screenTrack) {
    await window.client.unpublish(screenTrack);
    screenTrack.stop();
    screenTrack.close();
    screenTrack = null;
  }

  if (screenAudioTrack) {
    await window.client.unpublish(screenAudioTrack);
    screenAudioTrack.stop();
    screenAudioTrack.close();
    screenAudioTrack = null;
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
    // FIX: always fetch fresh name/icon here instead of relying on
    // getDisplayName(), which may not be populated yet due to the
    // async race with the user-joined handler.
    const { name, icon } = await resolveRemoteName(user.uid);
    window.drawUser(user.uid, name, icon);
    user.audioTrack.play();
  }

  if (mediaType === "video") {
    // Name should already be in uidNameMap from user-joined or the audio
    // branch above, but resolve again to be safe.
    const { name, icon } = await resolveRemoteName(user.uid);
    window.drawUser(user.uid, name, icon);
    window.playVideoInCard(user.uid, user.videoTrack);
  }
});

/**
 * Fired when a remote user leaves the channel.
 * Plays a low tone, posts a system message, and removes the user's card.
 */
window.client.on("user-left", (user) => {
  const displayName = window.getDisplayName(user.uid);
  delete window.uidNameMap[user.uid];
  window._playTone(440, 0.2); // Lower tone = departure
  if (window.appendMessage)
    window.appendMessage("Sistem", `**${displayName}** je otišao.`, "#ffcc00");

  const el = document.getElementById(`user-${user.uid}`);
  if (el) el.remove();
});

/**
 * Fired when a remote user joins the channel.
 * Resolves their display name from Firebase, caches it, draws their card,
 * and plays a higher tone to signal arrival.
 */
window.client.on("user-joined", async (user) => {
  const { name, icon } = await resolveRemoteName(user.uid);
  window.drawUser(user.uid, name, icon);
  if (window.appendMessage)
    window.appendMessage("Sistem", `**${name}** se priključio.`, "#ffcc00");
  if (user.uid !== window.client.uid) window._playTone(660, 0.1);
});

/**
 * Volume indicator — fires every 2 s with audio levels for all active speakers.
 * Adds/removes the .speaking class on avatars to drive the neon pulse animation.
 */
window.client.on("volume-indicator", (volumes) => {
  // Clear all current speaking highlights before re-applying
  document.querySelectorAll(".avatar.speaking").forEach((el) =>
    el.classList.remove("speaking")
  );

  volumes.forEach((vol) => {
    if (vol.level > 5) { // Threshold filters out background noise
      // uid === 0 means the local user in the volume event
      const id = vol.uid === 0 ? window.client.uid : vol.uid;
      document.getElementById(`avatar-${id}`)?.classList.add("speaking");
    }
  });
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
      audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
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

    // --- 2. JOIN AGORA CHANNEL ---
    await window.client.join(window.APP_ID, window.CHANNEL, null, window.myAgoraUID);
    window.client.enableAudioVolumeIndicator();

    // --- 3. PUBLISH AUDIO TRACK ---
    localTracks.audioTrack = audioTrack;
    await window.client.publish(localTracks.audioTrack);

    // --- 4. UPDATE PRESENCE IN FIREBASE ---
    // Write presence BEFORE anything else so remote users who receive
    // user-joined/user-published can read our displayName immediately.
    window.uidNameMap[window.client.uid] = window.myDisplayName;
    await firebase.database()
      .ref(`presence/${window.CHANNEL}/${window.client.uid}`)
      .set({ displayName: window.myDisplayName, icon: window.myIcon });
    // Auto-remove presence if connection drops unexpectedly
    firebase.database()
      .ref(`presence/${window.CHANNEL}/${window.client.uid}`)
      .onDisconnect().remove();
      
    if (window.appendMessage)
      window.appendMessage("Sistem", `Povezan **${window.myDisplayName}**`, "#ffcc00");

    // --- 5. UPDATE UI TO CONNECTED STATE ---
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
    }

  } catch (e) {
    console.error(e);
    // Attempt to clean up Agora state if join/publish failed after partial success
    try { await window.client.leave(); } catch (_) {}
    firebase.database()
      .ref(`presence/${window.CHANNEL}/${window.client.uid}`)
      .remove();

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
async function leaveChannel() {
  // --- 1. WAKE LOCK ---
  if (window.wakeLock) {
    await window.wakeLock.release();
    window.wakeLock = null;
  }

  // --- 2. SCREEN SHARE ---
  if (screenTrack) await stopScreenShare();

  // --- 3. LOCAL AUDIO TRACK ---
  if (localTracks.audioTrack) {
    localTracks.audioTrack.stop();
    localTracks.audioTrack.close();
    localTracks.audioTrack = null;
  }

  // --- 4. AGORA CLIENT ---
  firebase.database()
  .ref(`presence/${window.CHANNEL}/${window.client.uid}`)
  .remove();
  await window.client.leave();

  // --- 5. RESET LOCAL STATE ---
  isMuted = false;

  // --- removes stale entries
  window.uidNameMap = {};

  // --- 6. USER GRID ---
  const grid = document.getElementById("user-grid");
  if (grid) grid.innerHTML = "";

  // --- 7. BUTTONS ---
  const leaveBtn = document.getElementById("leave-btn");
  const joinBtn  = document.getElementById("join-btn");
  if (leaveBtn)  leaveBtn.style.display  = "none";
  if (screenBtn) screenBtn.style.display = "none";
  if (joinBtn) {
    joinBtn.style.display = "flex";
    joinBtn.disabled = false;
  }

  // --- 8. HEADER STATUS ---
  const status = document.getElementById("status");
  if (status) {
    status.innerText    = "";
    status.style.color  = "#cbd5e1";
  }

  // --- 9. CHAT — re-expand if collapsed on mobile after joining ---
  if (window.chatContainer) {
    window.chatContainer.classList.remove("collapsed");
  }

  // --- 10. SYSTEM MESSAGE ---
  if (window.appendMessage) {
    window.appendMessage("Sistem", "Izašao si iz kanala.", "#ffcc00");
  }
}

// Wire up the leave button
const leaveBtn = document.getElementById("leave-btn");
if (leaveBtn) leaveBtn.onclick = leaveChannel;


// ============================================================
// MUTE TOGGLE
// Enables/disables the local audio track without unpublishing it
// ============================================================
window.toggleMute = async () => {
  if (!localTracks.audioTrack) return;

  isMuted = !isMuted;

  // setEnabled(false) mutes without destroying the track
  await localTracks.audioTrack.setEnabled(!isMuted);

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
  const user = window.client.remoteUsers.find((u) => u.uid == uid);
  if (user?.audioTrack) user.audioTrack.setVolume(parseInt(vol));
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

// ASCII art banner shown in chat on first load
const welcomeArt = `
<pre style="font-family: monospace; color: #4ade80; line-height: 1.2; font-size: 10px;">
 _      _____ _   _ _   _______ _____ _____ 
| |    |_   _| \\ | | | / /_   _/  __ \\  ___|
| |      | | |  \\| | |/ /  | | | /  \\/ |__  
| |      | | | . \` |    \\  | | | |   |  __| 
| |____ _| |_| |\\  | |\\  \\_| |_| \\__/\\ |___ 
\\_____/\\___/\\_| \\_\\_| \\_/\\___/ \\____/\\____/
</pre>
<small style="color: #60a5fa;">/help za listu komadni</small>`;

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
firebase.auth().onAuthStateChanged((user) => {
  if (user) {
    console.log("Authenticated! Starting chat...");
    startChat();

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
window.appendMessage = (
  name,
  text = "",
  color = "#4ade80",
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

  // Align own messages to the right and tint them green
  const isMe = data && data.username === window.myDisplayName;
  msgDiv.style.alignSelf = isMe ? "flex-end" : "flex-start";
  if (isMe) msgDiv.style.backgroundColor = "rgba(74, 222, 128, 0.1)";

  // Coloured left/right border indicates the sender
  msgDiv.style[isMe ? "borderRight" : "borderLeft"] = `3px solid ${color}`;

  // Delegate to the appropriate renderer based on message type
  if (data && data.type === "poll") {
    renderPoll(msgDiv, snapshotKey, data, color, timeString);
  } else {
    renderStandardMessage(msgDiv, name, text, color, timeString);
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
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const safeText = escapeHtml(text);

  let formattedText;

  if (name.includes("🤖 Bot")) {
    // Bot responses: highlight the question line in amber, answer in white
    const parts = safeText.split("\n");
    if (parts.length >= 2) {
      const questionPart = parts[0];
      const answerPart   = parts.slice(1).join("\n");
      formattedText = `<div style="color: #fbbf24; margin-bottom: 5px;">${questionPart}</div><div style="color: #ffffff;">${answerPart}</div>`;
    } else {
      formattedText = safeText.replace(urlRegex, (url) => formatMediaLinks(url));
    }
  } else {
    // Regular messages: replace URLs with rich media embeds
    formattedText = safeText.replace(urlRegex, (url) => formatMediaLinks(url));
  }

  msgDiv.innerHTML = `${timeString}<b style="color: ${color}">${escapeHtml(name)}: </b><span>${formattedText}</span>`;
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
            class="media-yt" allowfullscreen></iframe>
        </div>
        <a href="${url}" target="_blank" class="media-link">▶ YouTube</a>
      </div>`;
  }

  // --- Spotify embed (track, album, or playlist) ---
  if (spotifyMatch) {
    const [, type, id] = spotifyMatch;
    const h = type === "track" ? "80" : "152"; // Compact height for tracks
    return `
      <div class="media-card media-card--spotify">
        <iframe src="https://open.spotify.com/embed/${type}/${id}"
          width="100%" height="${h}" frameborder="0"
          allow="encrypted-media" class="media-spotify"></iframe>
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

      const count  = data.votes && data.votes[opt] ? data.votes[opt] : 0;
      // Encode ONLY for the ID attribute
      const safeIdPart = encodeURIComponent(opt);

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
    await window.chatRef.push({
      username: window.myDisplayName,
      text:      text,
      color:     window.myColor || "#4ade80",
      timestamp: Date.now(),
    });
    chatInput.value = "";
    chatInput.focus();
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

  switch (command) {

    // Wipe the local chat view
    case "/clear":
      chatMessages.innerHTML = "";
      return true;

    // Change the user's display name for this session
    case "/nick":
      const newNick = args.slice(1).join(" ");
      if (newNick) {
        window.myDisplayName = newNick;
        localStorage.setItem("savedUsername", newNick);

        // Update presence so other users see the new name immediately
        //TODO: nobody is listening with on() so it does nothing
        // if (window.client?.uid) {
        //   firebase.database()
        //     .ref(`presence/${window.CHANNEL}/${window.client.uid}/displayName`)
        //     .set(newNick);
        // }

        // Update own card in the grid
        const nameEl = document.querySelector(`#user-${window.client?.uid} .username`);
        if (nameEl) nameEl.textContent = `${newNick} (Ti)`;

        window.appendMessage("Sistem", `Nadimak promenjen u: **${newNick}**`, "#ffcc00");
      }
      return true;

    // Roll a random number between 1 and max (default 100)
    case "/roll":
      const max = parseInt(args[1]) || 100;
      window.chatRef.push({
        username: "Sistem",
        text: `🎲 **${window.myDisplayName}** rola: **${Math.floor(Math.random() * max) + 1}** (1-${max})`,
      });
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
      options.forEach((opt) => (pollVotes[opt] = 0));

      window.chatRef.push({
        username:  window.myDisplayName,
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
        window.appendMessage("Sistem", `📊 Mreža: ${rtc.RTT}ms | Korisnika: ${rtc.UserCount}`, "#4ade80");
      } else {
        window.appendMessage("Sistem", "🏓 Pong! Sistem je aktivan.", "#4ade80");
      }
      return true;

    // Send a private message visible only to sender and recipient
    case "/msg":
      const target     = args[1];
      const privateMsg = args.slice(2).join(" ");
      if (target && privateMsg) {
        window.chatRef.push({
          username:  window.myDisplayName,
          text:      privateMsg,
          to:        target,
          type:      "private",
          timestamp: Date.now(),
        });
      } else {
        window.appendMessage("Sistem", "Greška: Koristi /msg Korisnik Poruka", "#ef4444");
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
            <code style="color: #fbbf24;text-align: left;">/ping</code>             <span>Ping test Agora</span>
            <code style="color: #fbbf24;text-align: left;">/msg {ime} {poruka}</code> <span>Pošalji privatnu poruku</span>
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

    const data = snapshot.val();
    const key  = snapshot.key;

    // Private messages are only shown to the sender and the named recipient
    if (data.type === "private") {
      const isMeSender = (data.username || "").toLowerCase() === (window.myDisplayName  || "").toLowerCase();
      const isMeTarget = (data.to || "").toLowerCase()       === (window.myDisplayName  || "").toLowerCase();

      if (isMeSender || isMeTarget) {
        const prefix = isMeSender
          ? `[privatna za ${escapeHtml(data.to || "")}]`
          : `[Privatna od ${escapeHtml(data.username || "")}]`;
        window.appendMessage(prefix, data.text, "#d1d5db", key, data);
      }
      return;
    }

    // Standard messages and polls
    window.appendMessage(data.username, data.text, data.color || "#4ade80", key, data);
  });

  // Listen for updates to existing messages (used for live poll vote counts)
  window.chatRef.on("child_changed", (snapshot) => {
    const data = snapshot.val();
    if (data && data.type === "poll" && Array.isArray(data.options)) {
      data.options.forEach((opt) => {
        const el = document.getElementById(`count-${snapshot.key}-${encodeURIComponent(opt)}`);
        if (el) el.innerText = data.votes && (data.votes[opt] || 0);
      });
    }
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

  const pollRef = window.chatRef.child(`${pollId}/votes/${option}`);

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
      const proxyRes = await fetch("https://corsproxy.io/?" + apiUrl, {
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
    window.appendMessage("Sistem", `Slanje fajla: ${file.name}...`, "#60a5fa");

  const expirySelect = document.getElementById("upload-expiry");
  const expiry  = expirySelect ? expirySelect.value : "trajno";
  const fileUrl = await uploadFile(file, expiry);

  if (fileUrl && fileUrl.startsWith("http")) {
    // Post the URL to chat — the media formatter will embed it appropriately
    window.chatRef.push({
      username:  window.myDisplayName,
      text:      `Dostupno ${expiry}: ${fileUrl}`,
      color:     window.myColor || "#ffffff",
      timestamp: Date.now(),
    });
  } else {
    const errorDetail = fileUrl || "Problem sa serverom";
    if (window.appendMessage)
      window.appendMessage("Sistem", `Greška pri slanju: ${errorDetail}`, "#f87171");
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
  const models = ["gemini-2.5-flash", "gemini-2.0-flash-lite", "gemma-3-4b-it"];

  // Show a "thinking" placeholder immediately
  window.appendMessage("🤖", "Razmišljam...", "#fbbf24", "temp-bot", { username: "🤖" });

  for (let modelName of models) {
    try {
      const response = await fetch(
        "https://my-proxy-vercel-kappa.vercel.app/api/gemini",
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
    msgDiv.innerHTML = `<b style="color: #60a5fa">Dobrodošli</b><br>${htmlContent}`;
    chatMessages.prepend(msgDiv);
  } else {
    msgDiv.innerHTML = `<b style="color: #60a5fa">Komande:</b><br>${htmlContent}`;
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