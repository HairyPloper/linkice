/**
 * js/rtc.js - Agora WebRTC, Audio/Video prenos
 */

window.client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
let localTracks = { audioTrack: null };
let isMuted = false;
let screenTrack = null;
let screenAudioTrack = null;

const screenBtn = document.getElementById("screen-btn");

// --- SCREEN SHARE ---
if (screenBtn) screenBtn.onclick = async () => {
  if (!screenTrack) {
    try {
      const result = await AgoraRTC.createScreenVideoTrack(
        {
          encoderConfig: { width: 1920, height: 1080, frameRate: 30, bitrateMax: 4780 },
          optimizationMode: "motion",
        }, "auto"
      );

      if (Array.isArray(result)) {
        screenTrack = result[0];
        screenAudioTrack = result[1];
      } else {
        screenTrack = result;
        screenAudioTrack = null;
      }

      await window.client.publish(screenAudioTrack ? [screenTrack, screenAudioTrack] : screenTrack);
      if (screenBtn) {
        screenBtn.innerHTML = "<span>🖥️</span> Prekini";
        screenBtn.classList.add("active");
      }
      window.playVideoInCard(window.client.uid, screenTrack);
      screenTrack.on("track-ended", stopScreenShare);
    } catch (e) {
      console.error(e);
    }
  } else {
    stopScreenShare();
  }
};

async function stopScreenShare() {
  if (screenTrack) {
    await window.client.unpublish(screenTrack);
    screenTrack.stop(); screenTrack.close(); screenTrack = null;
  }
  if (screenAudioTrack) {
    await window.client.unpublish(screenAudioTrack);
    screenAudioTrack.stop(); screenAudioTrack.close(); screenAudioTrack = null;
  }
  if (screenBtn) {
    screenBtn.innerHTML = "<span>🖥️</span> Podeli ekran";
    screenBtn.classList.remove("active");
  }
  window.removeVideoFromCard(window.client.uid);
}

// --- AGORA LISTENERS ---
window.client.on("user-published", async (user, mediaType) => {
  await window.client.subscribe(user, mediaType);
  if (mediaType === "audio") {
    window.drawUser(user.uid, window.getDisplayName(user.uid));
    user.audioTrack.play();
  }
  if (mediaType === "video") {
    window.drawUser(user.uid, window.getDisplayName(user.uid));
    window.playVideoInCard(user.uid, user.videoTrack);
  }
});

window.client.on("user-left", (user) => {
  window._playTone(440, 0.2);
  if (window.appendMessage) window.appendMessage("Sistem", `**${window.getDisplayName(user.uid)}** je otišao.`, "#ffcc00");
  const el = document.getElementById(`user-${user.uid}`);
  if (el) el.remove();
});

window.client.on("user-joined", (user) => {
  window.drawUser(user.uid, window.getDisplayName(user.uid));
  if (window.appendMessage) window.appendMessage("Sistem", `**${window.getDisplayName(user.uid)}** se priključio.`, "#ffcc00");
  if (user.uid !== window.client.uid) window._playTone(660, 0.1);
});

window.client.enableAudioVolumeIndicator();
window.client.on("volume-indicator", (volumes) => {
  document.querySelectorAll(".avatar.speaking").forEach((el) => el.classList.remove("speaking"));
  volumes.forEach((vol) => {
    if (vol.level > 5) {
      const id = vol.uid === 0 ? window.client.uid : vol.uid;
      document.getElementById(`avatar-${id}`)?.classList.add("speaking");
    }
  });
});

// --- JOIN / LEAVE CONTROLS ---
const joinBtn = document.getElementById("join-btn");
if (joinBtn) joinBtn.onclick = async () => {
  const btn = joinBtn;
  btn.disabled = true;
  try {
    const cleanName = window.sanitizeForAgora(window.myUsername);
    await window.client.join(window.APP_ID, window.CHANNEL, null, cleanName);
    
    if (window.appendMessage) window.appendMessage("Sistem", `Povezan **${window.getDisplayName(cleanName)}**`, "#ffcc00");

    localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    await window.client.publish(localTracks.audioTrack);

    window.drawUser(window.client.uid, window.getDisplayName(cleanName), window.myIcon, true);
    window.requestWakeLock();

    btn.style.display = "none";
    const leaveBtn = document.getElementById("leave-btn");
    if (leaveBtn) leaveBtn.style.display = "flex";
    if (screenBtn) screenBtn.style.display = "flex";
    const s = document.getElementById("status");
    if (s) { s.innerText = "Povezan • Live"; s.style.color = "#4ade80"; }

    if (window.innerWidth < 768) {
       window.chatContainer.classList.add('collapsed');
    }
  } catch (e) {
    console.error(e); btn.disabled = false;
  }
};

const leaveBtn = document.getElementById("leave-btn");
if (leaveBtn) leaveBtn.onclick = async () => {
  if (window.wakeLock) await window.wakeLock.release();
  if (localTracks.audioTrack) {
    localTracks.audioTrack.stop();
    localTracks.audioTrack.close();
  }
  await window.client.leave();
  location.reload();
};

// --- MUTE & VOLUME UTILS ---
window.toggleMute = async () => {
  if (!localTracks.audioTrack) return;
  isMuted = !isMuted;
  await localTracks.audioTrack.setEnabled(!isMuted);
  const avatarEl = document.getElementById(`avatar-${window.client.uid}`);
  if (avatarEl) avatarEl.classList.toggle("muted", isMuted);
  const s = document.getElementById("status");
  if (s) { s.innerText = isMuted ? "Mutiran 🤐" : "Povezan • Live"; s.style.color = isMuted ? "#f87171" : "#4ade80"; }
};

window.adjustVolume = (uid, vol) => {
  const u = window.client.remoteUsers.find((u) => u.uid == uid);
  if (u?.audioTrack) u.audioTrack.setVolume(parseInt(vol));
};