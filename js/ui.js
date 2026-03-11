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
// MOBILE AUTOPLAY FIX
// Covers Chrome, Firefox, Safari, Edge, Brave on mobile
// ============================================================
if (bgVideo && bgVideo.paused) {
  const playOnInteraction = () => {
    bgVideo.play().catch(() => {}); // silent catch for Firefox/Safari blocks
    document.removeEventListener("touchstart", playOnInteraction);
    document.removeEventListener("click", playOnInteraction);
    document.removeEventListener("touchend", playOnInteraction);
    document.removeEventListener("keydown", playOnInteraction);
  };
  document.addEventListener("touchstart", playOnInteraction, { once: true });
  document.addEventListener("touchend",   playOnInteraction, { once: true });
  document.addEventListener("click",      playOnInteraction, { once: true });
  document.addEventListener("keydown",    playOnInteraction, { once: true });
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
