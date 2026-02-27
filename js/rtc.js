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
 * Subscribe immediately, then render the track into the UI.
 */
window.client.on("user-published", async (user, mediaType) => {
  await window.client.subscribe(user, mediaType);

  if (mediaType === "audio") {
    window.drawUser(user.uid, window.getDisplayName(user.uid));
    user.audioTrack.play(); // Play directly through the browser's audio output
  }

  if (mediaType === "video") {
    window.drawUser(user.uid, window.getDisplayName(user.uid));
    window.playVideoInCard(user.uid, user.videoTrack);
  }
});

/**
 * Fired when a remote user leaves the channel.
 * Plays a low tone, posts a system message, and removes the user's card.
 */
window.client.on("user-left", (user) => {
  window._playTone(440, 0.2); // Lower tone = departure
  if (window.appendMessage)
    window.appendMessage("Sistem", `**${window.getDisplayName(user.uid)}** je otišao.`, "#ffcc00");

  const el = document.getElementById(`user-${user.uid}`);
  if (el) el.remove();
});

/**
 * Fired when a remote user joins the channel.
 * Draws their card and plays a higher tone to signal arrival.
 */
window.client.on("user-joined", (user) => {
  window.drawUser(user.uid, window.getDisplayName(user.uid));
  if (window.appendMessage)
    window.appendMessage("Sistem", `**${window.getDisplayName(user.uid)}** se priključio.`, "#ffcc00");

  // Don't play the join tone for the local user's own echo
  if (user.uid !== window.client.uid) window._playTone(660, 0.1); // Higher tone = arrival
});

/**
 * Volume indicator — fires every 2 s with audio levels for all active speakers.
 * Adds/removes the .speaking class on avatars to drive the neon pulse animation.
 */
window.client.enableAudioVolumeIndicator();
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
  btn.disabled = true; // Prevent double-clicks during the async join flow

  try {
    // Agora UIDs must be numeric or a sanitised string — strip special chars
    const cleanName = window.sanitizeForAgora(window.myUsername);
    await window.client.join(window.APP_ID, window.CHANNEL, null, cleanName);

    if (window.appendMessage)
      window.appendMessage("Sistem", `Povezan **${window.getDisplayName(cleanName)}**`, "#ffcc00");

    // Capture and publish the local microphone
    localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    await window.client.publish(localTracks.audioTrack);

    // Render the local user's card (isLocal = true so it gets special styling)
    window.drawUser(window.client.uid, window.getDisplayName(cleanName), window.myIcon, true);

    // Prevent screen sleep during a call (mobile-friendly)
    window.requestWakeLock();

    // Switch control bar from "join" to "leave + screen share"
    btn.style.display = "none";
    const leaveBtn = document.getElementById("leave-btn");
    if (leaveBtn)  leaveBtn.style.display = "flex";
    if (screenBtn) screenBtn.style.display = "flex";

    // Update the status indicator in the header
    const s = document.getElementById("status");
    if (s) { s.innerText = "Povezan • Live"; s.style.color = "#4ade80"; }

    // On mobile, collapse the chat so the user grid is visible after joining
    if (window.innerWidth < 768) {
      window.chatContainer.classList.add("collapsed");
    }

  } catch (e) {
    console.error(e);
    btn.disabled = false; // Re-enable so the user can try again
  }
};

// ============================================================
// LEAVE
// Releases all resources and reloads the page to reset state cleanly
// ============================================================
const leaveBtn = document.getElementById("leave-btn");

if (leaveBtn) leaveBtn.onclick = async () => {
  // Release the screen wake lock if it's active
  if (window.wakeLock) await window.wakeLock.release();

  // Stop and close the local microphone track
  if (localTracks.audioTrack) {
    localTracks.audioTrack.stop();
    localTracks.audioTrack.close();
  }

  await window.client.leave();

  // Reload to reset all UI and Agora state cleanly
  location.reload();
};

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