/**
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
