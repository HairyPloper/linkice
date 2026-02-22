const APP_ID = "beb2d2e844954540847d8bf07648926e";
const CHANNEL = "Linkice";
const params = new URLSearchParams(window.location.search);
const myUsername = params.get("name") || "Gost";

const animals = [
  "🦁",
  "🦊",
  "🐨",
  "🐘",
  "🐯",
  "🐼",
  "🐙",
  "🦉",
  "🐸",
  "🦓",
  "🦄",
  "🐝",
];
const myIcon = animals[Math.floor(Math.random() * animals.length)];

let client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
let localTracks = { audioTrack: null };
let isMuted = false;
let wakeLock = null;

const bgVideo = document.getElementById("bgVideo");
const videoToggle = document.getElementById("videoToggle");

const audio = document.getElementById("myAudio");
const audioBtn = document.getElementById("audioToggle");
audio.volume = 0.1;

let screenTrack = null;
let screenAudioTrack = null;
const screenBtn = document.getElementById("screen-btn");

const snowToggle = document.getElementById("snowToggle");

videoToggle.onclick = () => {
  if (bgVideo.paused) {
    bgVideo.play();
    videoToggle.innerText = "🎬";
  } else {
    bgVideo.pause();
    videoToggle.innerText = "🚫";
  }
};

audioBtn.onclick = () => {
  if (audio.paused) {
    audio.play();
    audioBtn.innerText = "🔊";
    audioBtn.classList.add("playing");
  } else {
    audio.pause();
    audioBtn.innerText = "🎵";
    audioBtn.classList.remove("playing");
  }
};

snowToggle.onclick = () => {
  document.querySelector("canvas").style.display =
    document.querySelector("canvas").style.display === "none"
      ? "block"
      : "none";
};

screenBtn.onclick = async () => {
  if (!screenTrack) {
    try {
      // [videoTrack, audioTrack]
      const result = await AgoraRTC.createScreenVideoTrack(
        {
          encoderConfig: { width: 1920, height: 1080, frameRate: 30, bitrateMax: 4780, bitrateMin: 1000 },
          optimizationMode: "motion",
        },
        "auto"
      );

      // check if we got audo-video or just video
      if (Array.isArray(result)) {
        screenTrack = result[0];
        screenAudioTrack = result[1];
      } else {
        screenTrack = result;
        screenAudioTrack = null;
      }

      if (screenAudioTrack) {
        await client.publish([screenTrack, screenAudioTrack]);
      } else {
        await client.publish(screenTrack);
      }

      screenBtn.innerHTML = "<span>🚫</span> Prekini ekran";
      screenBtn.classList.add("active");
      playVideoInCard(client.uid, screenTrack);

      screenTrack.on("track-ended", stopScreenShare);
    } catch (e) {
      console.error("Greška pri deljenju ekrana:", e);
    }
  } else {
    stopScreenShare();
  }
};

async function stopScreenShare() {
  if (screenTrack) {
    try { await client.unpublish(screenTrack); } catch (e) {}
    screenTrack.stop();
    screenTrack.close();
    screenTrack = null;
  }
  if (screenAudioTrack) {
    try { await client.unpublish(screenAudioTrack); } catch (e) {}
    screenAudioTrack.stop();
    screenAudioTrack.close();
    screenAudioTrack = null;
  }
  screenBtn.innerHTML = "<span>🖥️</span> Podeli ekran";
  screenBtn.classList.remove("active");
  removeVideoFromCard(client.uid);
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator)
      wakeLock = await navigator.wakeLock.request("screen");
  } catch (err) {}
}

function sanitizeForAgora(name) {
  const map = {
    š: "sh",
    Š: "Sh",
    ć: "ch",
    Ć: "Ch",
    č: "ch",
    Č: "Ch",
    ž: "zh",
    Ž: "Zh",
    đ: "dj",
    Đ: "Dj",
  };
  return name
    .replace(/[šćčžđ]/gi, (m) => map[m] || map[m.toLowerCase()])
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9!#$%&()+-:;<=.>?@[\]^_{|}~,]/g, "");
}

function getUniqueUsername(baseName) {
  return `${baseName}_${Math.floor(1000 + Math.random() * 9000)}`;
}
function getDisplayName(uid) {
  return typeof uid === "string" && uid.includes("_")
    ? uid.substring(0, uid.lastIndexOf("_"))
    : String(uid);
}

// --- JOIN/LEAVE SOUNDS (WebAudio minimal synth) ---
const _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function _ensureAudio() {
  if (_audioCtx.state === "suspended") _audioCtx.resume().catch(() => {});
}
function _playTone(freq, duration = 0.5, type = "sine") {
  try {
    _ensureAudio();
    const o = _audioCtx.createOscillator();
    const g = _audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, _audioCtx.currentTime);
    g.gain.linearRampToValueAtTime(0.12, _audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(
      0.001,
      _audioCtx.currentTime + duration,
    );
    o.connect(g);
    g.connect(_audioCtx.destination);
    o.start();
    o.stop(_audioCtx.currentTime + duration + 0.02);
  } catch (e) {
    console.warn("Audio play failed", e);
  }
}
function playJoinSound() {
  // two quick ascending tones
  _playTone(660, 0.06);
  setTimeout(() => _playTone(880, 0.09, "sine"), 70);
}
function playLeaveSound() {
  // single descending tone
  _playTone(520, 0.14, "sine");
  setTimeout(() => _playTone(440, 0.12, "sine"), 90);
}

function drawUser(uid, username, icon, isMe = false) {
  if (document.getElementById(`user-${uid}`)) return;
  const randomIcon =
    icon || animals[Math.floor(Math.random() * animals.length)];
  const grid = document.getElementById("user-grid");
  const card = document.createElement("div");
  card.id = `user-${uid}`;
  card.className = "user-card";
  // Click to toggle mute (self) or show volume (others)
  card.onclick = isMe
    ? () => window.toggleMute()
    : (e) => {
        document.querySelectorAll(".user-card.active").forEach((c) => {
          if (c !== card) c.classList.remove("active");
        });
        card.classList.toggle("active");
      };

  card.innerHTML = `
          <div class="avatar-container"><div class="avatar" id="avatar-${uid}">${randomIcon}</div></div>
          <div class="username">${username}${isMe ? " (Ti)" : ""}</div>
          ${
            !isMe
              ? `<div class="volume-controls" onclick="event.stopPropagation()">
            <input type="range" class="volume-slider" min="0" max="100" value="100" oninput="window.adjustVolume('${uid}', this.value)">
          </div>`
              : ""
          }
        `;
  grid.appendChild(card);
}
// Postavlja video preko avatara i omogućava Fullscreen na klik
function playVideoInCard(uid, track) {
  const avatarContainer = document.querySelector(
    `#user-${uid} .avatar-container`,
  );
  if (!avatarContainer) return;

  // Sakrij emoji
  const avatar = avatarContainer.querySelector(".avatar");
  if (avatar) avatar.style.display = "none";

  // Napravi video kocku
  const videoDiv = document.createElement("div");
  videoDiv.id = `video-wrapper-${uid}`;
  videoDiv.className = "video-container";
  videoDiv.title = "Klikni za Fullscreen";

  // Fullscreen na klik (zaustavljamo mutiranje koje se inace desi kad kliknes karticu)
  videoDiv.onclick = (e) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      videoDiv.requestFullscreen().catch((err) => console.log(err));
    } else {
      document.exitFullscreen();
    }
  };

  avatarContainer.appendChild(videoDiv);
  track.play(videoDiv.id);
}

// Vraća emoji kada se ekran ugasi
function removeVideoFromCard(uid) {
  const videoDiv = document.getElementById(`video-wrapper-${uid}`);
  if (videoDiv) videoDiv.remove();

  const avatar = document.querySelector(`#user-${uid} .avatar`);
  if (avatar) avatar.style.display = "flex"; // Vrati ikonicu
}

client.on("user-published", async (user, mediaType) => {
  await client.subscribe(user, mediaType);

  if (mediaType === "audio") {
    drawUser(user.uid, getDisplayName(user.uid));
    user.audioTrack.play();
    document.getElementById(`avatar-${user.uid}`)?.classList.remove("muted");
  }

  if (mediaType === "video") {
    drawUser(user.uid, getDisplayName(user.uid)); // Osiguravamo da kartica postoji
    playVideoInCard(user.uid, user.videoTrack);
  }
});

client.on("user-unpublished", (user, mediaType) => {
  if (mediaType === "audio") {
    document.getElementById(`avatar-${user.uid}`)?.classList.add("muted");
  }
  if (mediaType === "video") {
    removeVideoFromCard(user.uid);
  }
});

client.on("user-left", (user) => {
  playLeaveSound();
  document.getElementById(`user-${user.uid}`)?.remove();
});
client.on("user-joined", (user) => {
  drawUser(user.uid, getDisplayName(user.uid));
  // don't play sound for the local user joining (uid 0 or our own id)
  if (user.uid && String(user.uid) !== String(client.uid)) playJoinSound();
});

client.enableAudioVolumeIndicator();
client.on("volume-indicator", (volumes) => {
  // Skloni animaciju sa svih avatara i video wrappera
  document
    .querySelectorAll(".avatar.speaking, .video-container.speaking")
    .forEach((el) => {
      el.classList.remove("speaking");
    });

  volumes.forEach((vol) => {
    const id = vol.uid === 0 ? client.uid : vol.uid;
    if (vol.level > 5) {
      // avatar check
      const avatarEl = document.getElementById(`avatar-${id}`);
      if (avatarEl) avatarEl.classList.add("speaking");

      // video wrapper check
      const videoWrapper = document.getElementById(`video-wrapper-${id}`);
      if (videoWrapper) videoWrapper.classList.add("speaking");
    }
  });
});

document.getElementById("join-btn").onclick = async () => {
  const joinBtn = document.getElementById("join-btn");

  if (joinBtn.disabled) return;
  joinBtn.disabled = true;
  joinBtn.style.opacity = "0.5";
  joinBtn.innerText = "Povezivanje...";

  try {
    const uniqueName = getUniqueUsername(sanitizeForAgora(myUsername));
    await client.join(APP_ID, CHANNEL, null, uniqueName);
    if (
      bgVideo.paused &&
      videoToggle.innerText === "🎬" &&
      window.innerWidth >= 768
    ) {
      bgVideo.play().catch(() => {});
    }

    client.remoteUsers.forEach((user) =>
      drawUser(user.uid, getDisplayName(user.uid)),
    );
    localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    await client.publish(localTracks.audioTrack);
    drawUser(client.uid, getDisplayName(uniqueName), myIcon, true);
    await requestWakeLock();

    joinBtn.style.display = "none";
    document.getElementById("leave-btn").style.display = "flex";
    document.getElementById("screen-btn").style.display = "flex";
    const s = document.getElementById("status");
    s.innerText = "Povezan • Live";
    s.style.color = "#4ade80";
  } catch (e) {
    console.error(e);
    joinBtn.disabled = false;
    joinBtn.style.opacity = "1";
    joinBtn.innerHTML = "<span>🚀</span> Upadni";
  }
};

document.getElementById("leave-btn").onclick = async () => {
  if (wakeLock) await wakeLock.release();
  if (localTracks.audioTrack) {
    localTracks.audioTrack.stop();
    localTracks.audioTrack.close();
  }
  await client.leave();
  location.reload();
};

window.adjustVolume = (uid, vol) => {
  const u = client.remoteUsers.find((u) => u.uid == uid);
  if (u?.audioTrack) u.audioTrack.setVolume(parseInt(vol));
};

window.toggleMute = async () => {
  if (!localTracks.audioTrack) return;
  isMuted = !isMuted;
  await localTracks.audioTrack.setEnabled(!isMuted);
  document
    .getElementById(`avatar-${client.uid}`)
    ?.classList.toggle("muted", isMuted);
  const s = document.getElementById("status");
  s.innerText = isMuted ? "Mutiran 🤐" : "Povezan • Live";
  s.style.color = isMuted ? "#f87171" : "#4ade80";
};

// --- PARTICLES ---
(function () {
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    pointerEvents: "none",
    zIndex: "-1",
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  let particles = [];
  const isPako = myUsername === "Pako";
  const symbols = ["❤", "💖", "💕", "💗", "💓"];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    particles = Array.from({ length: isPako ? 100 : 150 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      speed: 0.4 + Math.random() * 0.8,
      drift: (Math.random() - 0.5) * 0.3,
      size: isPako ? 10 + Math.random() * 15 : 2 + Math.random() * 3,
      opacity: 0.3 + Math.random() * 0.5,
      symbol: symbols[Math.floor(Math.random() * symbols.length)],
    }));
  }
  window.addEventListener("resize", resize);
  resize();

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      ctx.globalAlpha = p.opacity;
      if (isPako) {
        ctx.font = `${p.size}px serif`;
        ctx.fillText(p.symbol, p.x, p.y);
      } else {
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      p.y += p.speed;
      p.x += p.drift;
      if (p.y > canvas.height + 20) {
        p.y = -20;
        p.x = Math.random() * canvas.width;
      }
    });
    requestAnimationFrame(draw);
  }
  draw();
})();
