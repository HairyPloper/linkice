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
    tracks.audio?.setVolume(owner === watchedScreenUid
      ? window.getRemoteVolume(owner, "screen") : 0);
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
      const volume = isScreen
        ? (watchedScreenUid === String(ownerUid) ? window.getRemoteVolume(ownerUid, "screen") : 0)
        : window.getRemoteVolume(ownerUid);
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
  if (!isScreen && mediaType === "audio") window.clearSpeakingIndicator(ownerUid);
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
  remotePreferenceNames.delete(String(user.uid));
  remoteScreenVolumes.delete(String(user.uid));
  window._playTone(440, 0.2); // Lower tone = departure
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
  if (user.uid !== window.client.uid) window._playTone(660, 0.1);
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
let microphoneSwitchInFlight = false;
window.switchMicrophone = async (deviceId) => {
  const track = localTracks.audioTrack;
  if (!window.isVoiceJoined || !track || microphoneSwitchInFlight || muteToggleInFlight) return false;
  microphoneSwitchInFlight = true;
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
    microphoneSwitchInFlight = false;
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
// MUTE TOGGLE
// Enables/disables the local audio track without unpublishing it
// ============================================================
let muteToggleInFlight = false;
window.toggleMute = async () => {
  if (!localTracks.audioTrack || muteToggleInFlight || microphoneSwitchInFlight) return;
  const audioTrack = localTracks.audioTrack;
  const uid = window.client.uid;
  muteToggleInFlight = true;
  const wasMuted = isMuted;
  isMuted = !wasMuted;

  if (isMuted) {
    stopLocalVolumeMonitor();
    window.clearSpeakingIndicator(window.client.uid);
  }

  try {
    // setEnabled(false) disables microphone publishing without destroying it.
    await audioTrack.setEnabled(!isMuted);
  } catch (error) {
    if (localTracks.audioTrack !== audioTrack) return;
    isMuted = wasMuted;
    if (!isMuted && localTracks.audioTrack) startLocalVolumeMonitor(localTracks.audioTrack);
    console.error("Microphone mute change failed:", error);
    return;
  } finally {
    muteToggleInFlight = false;
  }
  // A user can leave while the SDK is toggling capture. Do not restore the
  // old call's UI or write presence under an undefined/new participant UID.
  if (localTracks.audioTrack !== audioTrack) return;

  if (!isMuted && localTracks.audioTrack) {
    startLocalVolumeMonitor(localTracks.audioTrack);
  }

  // Update mute state in Firebase so remote users can see it in their UI
  firebase.database()
  .ref(`presence/${window.CHANNEL}/${uid}`)
  .update({ muted: isMuted });

  // Visually dim the local avatar when muted
  window.setUserMuted(window.client.uid, isMuted);

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
  window.browserPreferences?.saveVolume(window.uidNameMap[uid], "voice", volume);
  const user = window.client.remoteUsers.find((u) => u.uid == uid);
  if (user?.audioTrack) user.audioTrack.setVolume(volume);
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
  const user = window.client.remoteUsers.find((u) => String(u.uid) === String(uid));
  user?.audioTrack?.setVolume(window.getRemoteVolume(uid));
  remoteScreenTracks.get(String(uid))?.audio?.setVolume(
    watchedScreenUid === String(uid) ? window.getRemoteVolume(uid, "screen") : 0);
};

window.adjustScreenVolume = (uid, vol) => {
  const volume = Math.max(0, Math.min(100, Number.parseInt(vol, 10) || 0));
  remoteScreenVolumes.set(String(uid), volume);
  window.browserPreferences?.saveVolume(window.uidNameMap[uid], "screen", volume);
  remoteScreenTracks.get(String(uid))?.audio?.setVolume(watchedScreenUid === String(uid) ? volume : 0);
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
