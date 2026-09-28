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
    window.syncScreenShareCard?.(uid);
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

    const addSlider = (kind, title, adjust) => {
      const row = document.createElement("label");
      row.className = `volume-row ${kind}-volume-row`;
      const caption = document.createElement("span");
      caption.className = "volume-caption";
      const text = document.createElement("span");
      text.textContent = kind === "voice" ? "" : title;
      const value = document.createElement("output");
      const input = document.createElement("input");
      input.type = "range";
      input.className = "volume-slider";
      input.min = 0;
      input.max = 100;
      input.value = window.getRemoteVolume?.(uid, kind) ?? (kind === "screen" ? 18 : 100);
      input.setAttribute("aria-label", `${title}: ${username}`);
      value.textContent = `${input.value}%`;
      input.addEventListener("input", () => {
        value.textContent = `${input.value}%`;
        adjust(uid, input.value);
      });
      caption.append(text, value);
      row.append(caption, input);
      row.hidden = kind === "screen";
      vc.appendChild(row);
    };
    addSlider("voice", "Glas", (id, value) => window.adjustVolume(id, value));
    card.appendChild(vc);
  }

  grid.appendChild(card);
  window.syncScreenShareCard?.(uid);
};

window.setScreenAudioAvailable = (uid, available, sharing = available) => {
  const card = document.getElementById(`user-${uid}`);
  if (!card) return;
  const row = card.querySelector(".screen-volume-row");
  if (row) {
    const input = row.querySelector("input");
    input.disabled = !available;
    row.querySelector("output").textContent = available ? `${input.value}%` : "Bez zvuka";
    row.title = available ? "" : "Zvuk ekrana nije primljen. Osoba koja deli ekran treba da uključi deljenje zvuka.";
  }
  card.classList.toggle("has-screen-audio", available);
  card.classList.toggle("has-screen-share", sharing);
};

window.setLocalScreenSharing = (uid, sharing) => {
  const card = document.getElementById(`user-${uid}`);
  if (!card) return;
  let badge = card.querySelector(".sharing-badge");
  if (sharing && !badge) {
    badge = document.createElement("div");
    badge.className = "sharing-badge";
    badge.textContent = "🖥 Deliš ekran";
    badge.setAttribute("role", "status");
    card.prepend(badge);
  }
  if (!sharing) badge?.remove();
};

window.setUserMuted = (uid, muted) => {
  const avatar = document.getElementById(`avatar-${uid}`);
  if (!avatar) return;
  avatar.classList.toggle("muted", muted);
  if (muted) window.clearSpeakingIndicator?.(uid);
};

// Each remote preview owns a fullscreen panel. Audio follows the real
// fullscreen element, never the click or the requestFullscreen promise.
const screenViews = new Map();
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;

function revealScreenControls(view) {
  if (fullscreenElement() !== view.wrapper) return;
  clearTimeout(view.hideTimer);
  view.panel.classList.add("visible");
  view.hideTimer = setTimeout(() => {
    if (!view.dragging && !view.panel.querySelector(":focus-visible")) {
      view.panel.classList.remove("visible");
    }
  }, 1000);
}

function syncFullscreenScreen() {
  let watching = null;
  for (const [uid, view] of screenViews) {
    const active = fullscreenElement() === view.wrapper;
    view.panel.hidden = !active;
    view.wrapper.setAttribute("aria-label", active ? "Zatvori deljeni ekran" : "Otvori deljeni ekran");
    if (active) {
      watching = uid;
      revealScreenControls(view);
    } else {
      clearTimeout(view.hideTimer);
      view.panel.classList.remove("visible");
      view.dragging = false;
    }
  }
  window.setWatchedScreen?.(watching);
}
document.addEventListener("fullscreenchange", syncFullscreenScreen);
document.addEventListener("webkitfullscreenchange", syncFullscreenScreen);
for (const event of ["pointerup", "pointercancel"]) {
  document.addEventListener(event, () => {
    for (const view of screenViews.values()) {
      if (view.dragging) {
        view.dragging = false;
        revealScreenControls(view);
      }
    }
  });
}

window.playVideoInCard = (uid, track) => {
  // Never replace the sharer's own avatar or play their screen locally.
  if (String(uid) === String(window.client?.uid)) {
    window.setLocalScreenSharing(uid, true);
    return;
  }
  const container = document.querySelector(`#user-${uid} .avatar-container`);
  if (!container) return;
  const key = String(uid);
  let view = screenViews.get(key);
  if (view && view.wrapper.parentNode !== container) {
    window.removeVideoFromCard(uid);
    view = null;
  }
  container.querySelector(".avatar").style.display = "none";
  if (!view) {
    const wrapper = document.createElement("div");
    wrapper.id = `video-wrapper-${uid}`;
    wrapper.className = "video-container";
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "button");
    wrapper.setAttribute("aria-label", "Otvori deljeni ekran");
    wrapper.title = "Klikni za ceo ekran i zvuk";
    const media = document.createElement("div");
    media.id = `screen-media-${uid}`;
    media.className = "screen-media";
    const panel = document.createElement("div");
    panel.className = "screen-player-controls";
    panel.hidden = true;
    const row = document.createElement("label");
    row.className = "volume-row screen-volume-row";
    const caption = document.createElement("span");
    caption.className = "volume-caption";
    const title = document.createElement("span");
    title.textContent = "Jačina";
    const output = document.createElement("output");
    const input = document.createElement("input");
    input.type = "range";
    input.className = "volume-slider";
    input.min = 0;
    input.max = 100;
    input.value = window.getRemoteVolume?.(uid, "screen") ?? 18;
    input.setAttribute("aria-label", "Jačina");
    input.disabled = true;
    output.textContent = "Bez zvuka";
    caption.append(title, output);
    row.append(caption, input);
    panel.append(row);
    wrapper.append(media, panel);
    container.append(wrapper);
    view = { wrapper, media, panel, track: null, hideTimer: null, dragging: false };
    screenViews.set(key, view);

    const toggleFullscreen = async () => {
      try {
        if (fullscreenElement() === wrapper) {
          const exit = document.exitFullscreen || document.webkitExitFullscreen;
          await exit?.call(document);
        } else {
          const request = wrapper.requestFullscreen || wrapper.webkitRequestFullscreen;
          if (!request) throw new Error("Fullscreen is not supported");
          await request.call(wrapper);
        }
      } catch (error) {
        console.warn("Fullscreen unavailable:", error);
        window.appendMessage?.("Sistem", "Pregledač nije dozvolio ceo ekran. Klikni ponovo na deljeni ekran.", "#fbbf24");
      }
    };
    wrapper.onclick = (event) => {
      event.stopPropagation();
      // A touch near the bottom reveals controls without closing the stream.
      if (fullscreenElement() === wrapper && event.clientY >= wrapper.getBoundingClientRect().bottom - 120) {
        revealScreenControls(view);
        return;
      }
      return toggleFullscreen();
    };
    wrapper.addEventListener("keydown", (event) => {
      if (event.target === wrapper && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        void toggleFullscreen();
      }
    });
    wrapper.addEventListener("pointermove", (event) => {
      if (event.clientY >= wrapper.getBoundingClientRect().bottom - 120) revealScreenControls(view);
    });
    panel.addEventListener("click", (event) => event.stopPropagation());
    panel.addEventListener("pointerdown", () => {
      view.dragging = true;
      revealScreenControls(view);
    });
    panel.addEventListener("focusin", () => revealScreenControls(view));
    panel.addEventListener("focusout", () => revealScreenControls(view));
    input.addEventListener("input", () => {
      output.textContent = `${input.value}%`;
      window.adjustScreenVolume(uid, input.value);
      revealScreenControls(view);
    });
  }
  // Presence updates and audio arrivals must not restart a playing video.
  if (view.track !== track) {
    view.track = track;
    track.play(view.media.id);
  }
};

window.removeVideoFromCard = (uid) => {
  const view = screenViews.get(String(uid));
  if (view) {
    clearTimeout(view.hideTimer);
    screenViews.delete(String(uid));
    view.wrapper.remove();
    syncFullscreenScreen();
  }
  const avatar = document.querySelector(`#user-${uid} .avatar`);
  if (avatar) avatar.style.display = "flex";
};
