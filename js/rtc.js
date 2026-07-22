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
// Stops passive voice connections from consuming Agora minutes indefinitely.
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

function clearAfkTimers() {
  if (afkWarningTimer) clearTimeout(afkWarningTimer);
  if (afkDisconnectTimer) clearTimeout(afkDisconnectTimer);
  afkWarningTimer = null;
  afkDisconnectTimer = null;
}

function scheduleAfkTimers() {
  clearAfkTimers();
  if (!window.isVoiceJoined) return;

  const elapsed = Date.now() - lastAfkActivityAt;
  const warningDelay = Math.max(0, AFK_TIMEOUT_MS - AFK_WARNING_MS - elapsed);
  const disconnectDelay = Math.max(0, AFK_TIMEOUT_MS - elapsed);

  if (AFK_WARNING_MS > 0) {
    afkWarningTimer = setTimeout(() => {
      if (!window.isVoiceJoined) return;
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
    if (!window.isVoiceJoined) return;
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
  if (!window.isVoiceJoined) return;
  const now = Date.now();
  if (now - lastAfkActivityAt < AFK_ACTIVITY_THROTTLE_MS) return;
  lastAfkActivityAt = now;
  scheduleAfkTimers();
}

function startAfkTimer() {
  lastAfkActivityAt = Date.now();
  scheduleAfkTimers();
}

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
