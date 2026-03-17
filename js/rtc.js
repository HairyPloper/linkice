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
    user.audioTrack.play();
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
 * Plays a low tone, posts a system message, and removes the user's card.
 */
window.client.on("user-left", (user) => {
  const displayName = window.getDisplayName(user.uid);
  delete window.uidNameMap[user.uid];
  window._playTone(440, 0.2); // Lower tone = departure
  if (window.appendMessage)
    window.appendMessage("Sistem", `**${displayName}** je otišao.`, "#fbbf24");

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
  if (window.appendMessage)
    window.appendMessage("Sistem", `**${name}** se priključio.`, "#fbbf24");
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
      window.appendMessage("Sistem", "Veza je obnovljena. ✅", "#4ade80");
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
      window.appendMessage("Sistem", `Povezan **${window.myDisplayName}**`, "#fbbf24");

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
      document.getElementById("settings-btn").classList.add("hidden");
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
    document.getElementById("settings-btn").classList.remove("hidden");
    //TODO: settings btn should show on mobile when not in a call, but it's currently tied to the chat header which is hidden when collapsed — consider moving it outside the chat container
  }

  // --- 10. SYSTEM MESSAGE ---
  if (window.appendMessage) {
    window.appendMessage("Sistem", "Izašao si iz kanala.", "#fbbf24");
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
  const user = window.client.remoteUsers.find((u) => u.uid == uid);
  if (user?.audioTrack) user.audioTrack.setVolume(parseInt(vol));
};
