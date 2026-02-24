/**
 * js/main.js - Inicijalizacija i globalne varijable
 */

window.APP_ID = "beb2d2e844954540847d8bf07648926e";
const params = new URLSearchParams(window.location.search);
let baseName = params.get("name") || "Gost";

window.myUsername = `${baseName}_${Math.floor(10000 + Math.random() * 9000)}`;
window.wakeLock = null;

window.animals = [
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
  "🦒",
  "🦘",
  "🦥",
  "🦔",
  "🐇",
  "🐈",
  "🐕",
  "🐒",
  "🦍",
  "🦌",
  "🦬",
  "🐄",
  "🐳",
  "🐬",
  "🦈",
  "🐡",
  "🐢",
  "🦞",
  "🦀",
  "🐧",
  "🦜",
  "🦆",
  "🦅",
  "🦚",
  "🦋",
  "🐞",
  "🦂",
  "🐜",
];
window.myIcon =
  window.animals[Math.floor(Math.random() * window.animals.length)];
/**
 * js/utils.js - Pomoćne funkcije
 */

window.sanitizeForAgora = (name) => {
  const map = {
    š: "sh", Š: "Sh", ć: "ch", Ć: "Ch", č: "ch", Č: "Ch", ž: "zh", Ž: "Zh", đ: "dj", Đ: "Dj",
  };
  return name
    .replace(/[šćčžđ]/gi, (m) => map[m])
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9!#$%&()+-:;<=.>?@[\]^_{|}~,]/g, "");
};

window.getDisplayName = (uid) => {
  return typeof uid === "string" && uid.includes("_")
    ? uid.substring(0, uid.lastIndexOf("_"))
    : String(uid);
};

window.requestWakeLock = async () => {
  try {
    if ("wakeLock" in navigator) {
      window.wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (err) {
    console.error("WakeLock greška:", err);
  }
};

window._playTone = (freq, duration = 0.5) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + duration);
  } catch (e) {
    console.error("AudioTone greška:", e);
  }
};

// Universal HTML escaper to prevent XSS when inserting user data into the DOM
window.escapeHtml = (str) => {
  if (str === null || typeof str === "undefined") return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
};/**
 * js/ui.js - Korisnički interfejs, video pozadine i particle efekti
 */

const bgVideo = document.getElementById("bgVideo");
const videoToggle = document.getElementById("videoToggle");
const audio = document.getElementById("myAudio");
const audioBtn = document.getElementById("audioToggle");
const snowToggle = document.getElementById("snowToggle");

if (audio) audio.volume = 0.1;

if (videoToggle && bgVideo) {
  videoToggle.onclick = () => {
    if (bgVideo.paused) {
      bgVideo.play();
      videoToggle.innerText = "🎬";
    } else {
      bgVideo.pause();
      videoToggle.innerText = "🚫";
    }
  };
}

if (audioBtn && audio) {
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
}

if (snowToggle) {
  snowToggle.onclick = () => {
    const canvas = document.querySelector("canvas");
    if (canvas) canvas.style.display = canvas.style.display === "none" ? "block" : "none";
  };
}

// Crtanje korisnika u Grid
window.drawUser = (uid, username, icon, isMe = false) => {
  if (document.getElementById(`user-${uid}`)) return;

  const displayIcon = isMe ? icon : window.animals[Math.floor(Math.random() * window.animals.length)];
  const grid = document.getElementById("user-grid");
  if (!grid) return;

  const card = document.createElement("div");
  card.id = `user-${uid}`;
  card.className = "user-card";
  card.onclick = isMe ? () => window.toggleMute() : () => card.classList.toggle("active");

  // Avatar container
  const avatarContainer = document.createElement("div");
  avatarContainer.className = "avatar-container";
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.id = `avatar-${uid}`;
  avatar.textContent = displayIcon;
  avatarContainer.appendChild(avatar);
  card.appendChild(avatarContainer);

  // Username (escaped)
  const nameDiv = document.createElement("div");
  nameDiv.className = "username";
  nameDiv.textContent = `${window.escapeHtml ? window.escapeHtml(username) : username}${isMe ? " (Ti)" : ""}`;
  card.appendChild(nameDiv);

  // Volume controls
  if (!isMe) {
    const vc = document.createElement("div");
    vc.className = "volume-controls";
    vc.addEventListener("click", (e) => e.stopPropagation());

    const input = document.createElement("input");
    input.type = "range";
    input.className = "volume-slider";
    input.min = 0; input.max = 100; input.value = 100;
    input.addEventListener("input", function () {
      window.adjustVolume(uid, this.value);
    });

    vc.appendChild(input);
    card.appendChild(vc);
  }

  grid.appendChild(card);
};

window.playVideoInCard = (uid, track) => {
  const container = document.querySelector(`#user-${uid} .avatar-container`);
  if (!container) return;
  container.querySelector(".avatar").style.display = "none";
  let videoDiv = document.getElementById(`video-wrapper-${uid}`) || document.createElement("div");
  videoDiv.id = `video-wrapper-${uid}`;
  videoDiv.className = "video-container";
  videoDiv.onclick = (e) => {
    e.stopPropagation();
    if (!document.fullscreenElement) videoDiv.requestFullscreen?.();
    else document.exitFullscreen?.();
  };
  container.appendChild(videoDiv);
  track.play(videoDiv.id);
};

window.removeVideoFromCard = (uid) => {
  document.getElementById(`video-wrapper-${uid}`)?.remove();
  const avatar = document.querySelector(`#user-${uid} .avatar`);
  if (avatar) avatar.style.display = "flex";
};

// Particle efekat (Sneg/Srca)
(function () {
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "-1",
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  let particles = [];
  const isPako = window.myUsername.startsWith("Pako");
  
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    particles = Array.from({ length: 100 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      speed: 0.5 + Math.random(),
      size: isPako ? 15 : 3,
      symbol: isPako ? "❤" : "❄",
    }));
  }
  
  window.addEventListener("resize", resize);
  resize();
  
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      ctx.fillStyle = isPako ? "red" : "white";
      ctx.font = `${p.size * 2}px serif`;
      ctx.fillText(p.symbol, p.x, p.y);
      p.y += p.speed;
      if (p.y > canvas.height) p.y = -20;
    });
    requestAnimationFrame(draw);
  }
  draw();
})();/**
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
};/**
 * js/chat.js - Logika za poruke, komande i autocomplete
 */

const chatRef = firebase.database().ref(`messages/${window.CHANNEL}`);
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");
const autoMenu = document.getElementById("autocomplete-menu");
const sendBtn = document.getElementById("send-btn");
const emojiBtn = document.getElementById("emoji-btn");
const emojiPicker = document.getElementById("emoji-picker");
const chatContainer = document.getElementById("chat-container");
const dragHandle = document.getElementById("chat-drag-handle");

let selectedIndex = 0;

function escapeHtml(str) {
  if (str === null || typeof str === "undefined") return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --- FUNKCIJA ZA PRIKAZ PORUKA ---
window.appendMessage = (
  name,
  text = "",
  color = "#4ade80",
  snapshotKey = null,
  data = null,
) => {
  if (!chatMessages) return;

  let timeString = "";
  if (data && data.timestamp) {
    const date = new Date(data.timestamp);
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    timeString = `<span class="chat-time" style="font-size: 0.75rem; opacity: 0.5; margin-right: 5px;">${hours}:${minutes}</span>`;
  }

  const msgDiv = document.createElement("div");
  msgDiv.className = "chat-msg";

  const isMe = data && data.username === window.myUsername;
  msgDiv.style.alignSelf = isMe ? "flex-end" : "flex-start";
  if (isMe) msgDiv.style.backgroundColor = "rgba(74, 222, 128, 0.1)";
  msgDiv.style[isMe ? "borderRight" : "borderLeft"] = `3px solid ${color}`;

  if (data && data.type === "poll") {
    renderPoll(msgDiv, snapshotKey, data, color, timeString);
  } else {
    renderStandardMessage(msgDiv, name, text, color, timeString);
  }

  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  setTimeout(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 200);
};

function renderStandardMessage(msgDiv, name, text, color, timeString) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const safeText = escapeHtml(text);

  // Zamena linkova medijima
  const formattedText = safeText.replace(urlRegex, (url) =>
    formatMediaLinks(url),
  );

  // Emoji provera
  const onlyEmojiRegex =
    /^(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff]|\s)+$/;
  const emojiClass = onlyEmojiRegex.test(text) ? "large-emoji" : "";

  msgDiv.innerHTML = `${timeString}<b style="color: ${color}">${escapeHtml(name)}: </b><span class="${emojiClass}">${formattedText}</span>`;
}

function formatMediaLinks(url) {
  if (/\.(jpeg|jpg|gif|png|webp)$/i.test(url)) {
    return `<a href="${url}" target="_blank" style="color: #4ade80;">${url}</a>
                <img src="${url}" style="max-width: 100%; border-radius: 8px; margin-top: 5px; display: block;" />`;
  }
  if (/\.(mp4|webm|ogg)$/i.test(url)) {
    return `<video controls style="max-width: 100%; border-radius: 8px; margin-top: 5px; display: block;">
                    <source src="${url}" type="video/mp4">
                </video>`;
  }
  if (/\.(mp3|wav)$/i.test(url)) {
    return `<audio controls style="width: 100%; margin-top: 5px; display: block;"><source src="${url}"></audio>`;
  }
  const ytMatch = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  if (ytMatch) {
    return `<div style="position: relative; padding-bottom: 56.25%; height: 0; margin-top: 5px;">
                    <iframe src="https://www.youtube.com/embed/${ytMatch[1]}" style="position: absolute; width: 100%; height: 100%; border:0; border-radius: 8px;" allowfullscreen></iframe>
                </div>`;
  }
  const spotifyMatch = url.match(
    /open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/,
  );
  if (spotifyMatch) {
    const type = spotifyMatch[1];
    const id = spotifyMatch[2];
    const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
    return `<iframe src="${embedUrl}" width="100%" height="80" frameborder="0" allowtransparency="true" allow="encrypted-media" style="border-radius: 12px; margin-top: 8px; display: block;"></iframe>`;
  }
  return `<a href="${url}" target="_blank" style="color: #4ade80; text-decoration: underline;">${url}</a>`;
}

function renderPoll(msgDiv, snapshotKey, data, color, timeString) {
  const safeName = escapeHtml(data.username);
  const safeQuestion = escapeHtml(data.question || "");

  msgDiv.innerHTML = `${timeString}<b style="color: ${color}">${safeName} je pokrenuo anketu:</b><br>`;
  const qDiv = document.createElement("div");
  qDiv.style.cssText =
    "margin: 10px 0; font-size: 1.1rem; font-weight: bold; color: white;";
  qDiv.textContent = safeQuestion;
  msgDiv.appendChild(qDiv);

  if (data.options) {
    data.options.forEach((opt) => {
      const count = data.votes && data.votes[opt] ? data.votes[opt] : 0;
      const button = document.createElement("button");
      button.className = "poll-btn";
      button.innerHTML = `<span class="opt-text">${escapeHtml(opt)}</span>
                                <span class="opt-count" id="count-${snapshotKey}-${encodeURIComponent(opt)}">${count}</span>`;
      button.onclick = () => window.vote && window.vote(snapshotKey, opt);
      msgDiv.appendChild(button);
    });
  }
}

// --- SLANJE PORUKA ---
window.sendMessage = async () => {
  const text = (chatInput && chatInput.value ? chatInput.value : "").trim();
  if (!text) return;

  if (handleCommand(text)) {
    chatInput.value = "";
    return;
  }

  try {
    await chatRef.push({
      username: window.myUsername,
      text: text,
      color: window.myColor || "#4ade80",
      timestamp: Date.now(),
    });
    chatInput.value = "";
  } catch (err) {
    console.error("Greška pri slanju:", err);
  }
};

if (sendBtn) sendBtn.onclick = window.sendMessage;

// --- KOMANDE ---
function handleCommand(text) {
  if (!text.startsWith("/")) return false;
  const args = text.split(" ");
  const command = args[0].toLowerCase();

  switch (command) {
    case "/clear":
      chatMessages.innerHTML = "";
      return true;
    case "/nick":
      const newNick = args.slice(1).join(" ");
      if (newNick) {
        window.myUsername = newNick;
        window.appendMessage(
          "Sistem",
          `Nadimak promenjen u: **${window.myUsername}**`,
          "#ffcc00",
        );
      }
      return true;
    case "/roll":
      const max = parseInt(args[1]) || 100;
      chatRef.push({
        username: "Sistem",
        text: `🎲 **${window.myUsername}** rola: **${Math.floor(Math.random() * max) + 1}** (1-${max})`,
      });
      return true;
    case "/ai":
      const prompt = args.slice(1).join(" ");
      if (!prompt) {
        window.appendMessage(
          "Sistem",
          "Upišite pitanje, npr: /ai Koliko je 2+2?",
          "#ef4444",
        );
      } else {
        window.askAI(prompt);
      }
      return true;
    case "/poll":
      const pollData = args.slice(1).join(" ").split(",");
      if (pollData.length < 2) {
        window.appendMessage(
          "Sistem",
          "Format: /poll Pitanje , Opcija1 , Opcija2...",
          "#ef4444",
        );
        return true;
      }
      const question = pollData[0].trim();
      const options = pollData
        .slice(1)
        .map((opt) => opt.trim())
        .filter((opt) => opt !== "");
      const pollVotes = {};
      options.forEach((opt) => (pollVotes[opt] = 0));

      chatRef.push({
        username: window.myUsername,
        type: "poll",
        question: question,
        options: options,
        votes: pollVotes,
        text: "",
        timestamp: Date.now(),
      });
      return true;
    case "/ping":
      if (window.client && typeof window.client.getRTCStats === "function") {
        const rtc = window.client.getRTCStats();
        window.appendMessage(
          "Sistem",
          `📊 Mreža: ${rtc.RTT}ms | Korisnika: ${rtc.UserCount}`,
          "#4ade80",
        );
      } else {
        window.appendMessage(
          "Sistem",
          "🏓 Pong! Sistem je aktivan.",
          "#4ade80",
        );
      }
      return true;
    case "/msg":
      const target = args[1];
      const privateMsg = args.slice(2).join(" ");
      if (target && privateMsg) {
        chatRef.push({
          username: window.myUsername,
          text: privateMsg,
          to: target,
          type: "private",
          timestamp: Date.now(),
        });
      } else {
        window.appendMessage(
          "Sistem",
          "Greška: Koristi /msg Korisnik Poruka",
          "#ef4444",
        );
      }
      return true;
    case "/help":
      const helpHtml = `
            <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; border: 1px solid rgba(74, 222, 128, 0.3);">
              <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; font-size: 0.85rem;">
                <code style="color: #fbbf24;text-align: left;">/nick Ime</code> <span>Promena imena</span>
                <code style="color: #fbbf24;text-align: left;">/poll P, O1, O2</code> <span>Anketa</span>
                <code style="color: #fbbf24;text-align: left;">/roll 100</code> <span>Kockica</span>
                <code style="color: #fbbf24;text-align: left;">/clear</code> <span>Očisti čet</span>
                <code style="color: #fbbf24;text-align: left;">/ping</code> <span>Ping test Agora</span>
                <code style="color: #fbbf24;text-align: left;">/msg {ime} {poruka}</code> <span>Pošalji privatnu poruku</span>
                <code style="color: #fbbf24;text-align: left;">/ai {pitanje}</code> <span>Postavi pitanje AI-ju</span>
              </div>
            </div>`;
      window.appendSystemHTML(helpHtml);
      // window.appendMessage("Sistem", helpHtml, "#4ade80");
      return true;
    default:
      return false;
  }
}

// --- FIREBASE LISTENERS (POPRAVLJENI) ---

// Slušaj nove poruke
chatRef.limitToLast(50).on("child_added", (snapshot) => {
  const data = snapshot.val();
  const key = snapshot.key;

  // Privatne poruke
  if (data.type === "private") {
    const isMeSender =
      (data.username || "").toLowerCase() ===
      (window.myUsername || "").toLowerCase();
    const isMeTarget =
      (data.to || "").toLowerCase() === (window.myUsername || "").toLowerCase();
    if (isMeSender || isMeTarget) {
      const prefix = isMeSender
        ? `[privatna za ${escapeHtml(data.to || "")}]`
        : `[Privatna od ${escapeHtml(data.username || "")}]`;
      window.appendMessage(prefix, data.text, "#d1d5db", key, data);
    }
    return;
  }

  // Obične poruke i ankete
  window.appendMessage(
    data.username,
    data.text,
    data.color || "#4ade80",
    key,
    data,
  );
});

// Slušaj promene (za glasanje u realnom vremenu)
chatRef.on("child_changed", (snapshot) => {
  const data = snapshot.val();
  if (data && data.type === "poll" && Array.isArray(data.options)) {
    data.options.forEach((opt) => {
      const el = document.getElementById(
        `count-${snapshot.key}-${encodeURIComponent(opt)}`,
      );
      if (el) el.innerText = data.votes && (data.votes[opt] || 0);
    });
  }
});

// --- GLASANJE ---
window.vote = (pollId, option) => {
  const votedKey = `voted_${pollId}`;
  if (localStorage.getItem(votedKey)) {
    alert("Već glasao");
    return;
  }

  const safeOptionKey = encodeURIComponent(option);
  const pollRef = chatRef.child(`${pollId}/votes/${safeOptionKey}`);
  pollRef.transaction((currentVotes) => {
    return (currentVotes || 0) + 1;
  });

  localStorage.setItem(votedKey, "true");
};

// --- OSTALO (Upload, Emoji, Autocomplete) ---

async function uploadFile(file) {
  const formData = new FormData();
  formData.append("reqtype", "fileupload");
  formData.append("fileToUpload", file);

  try {
    const response = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: formData,
    });

    const fileUrl = await response.text();
    return fileUrl ? fileUrl.trim() : null;
  } catch (e) {
    console.error("Direktan upload nije uspeo, pokušavam preko proxy-ja...", e);
    try {
      const proxyRes = await fetch(
        "https://corsproxy.io/?https://catbox.moe/user/api.php",
        {
          method: "POST",
          body: formData,
        },
      );
      return (await proxyRes.text()).trim();
    } catch (err) {
      return null;
    }
  }
}
async function handleFileUpload(file) {
  if (window.appendMessage)
    window.appendMessage("Sistem", `Slanje fajla: ${file.name}...`, "#60a5fa");

  const fileUrl = await uploadFile(file);

  if (fileUrl && fileUrl.startsWith("http")) {
    chatRef.push({
      username: window.myUsername,
      text: fileUrl,
      color: window.myColor || "#ffffff",
      timestamp: Date.now(),
    });
  } else {
    const errorDetail = fileUrl || "Problem sa serverom";
    if (window.appendMessage)
      window.appendMessage(
        "Sistem",
        `Greška pri slanju: ${errorDetail}`,
        "#f87171",
      );
  }
}

// --- PASTE PODRŠKA ---
if (chatInput) {
  chatInput.onpaste = async (e) => {
    const items =
      e.clipboardData && e.clipboardData.items ? e.clipboardData.items : [];
    for (let item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) handleFileUpload(file);
      }
    }
  };

  // --- DRAG & DROP PODRŠKA ---
  chatInput.ondrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    chatInput.classList.remove("drag-active");

    const files =
      e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files : null;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  chatInput.ondragover = (e) => {
    e.preventDefault();
    chatInput.style.background = "rgba(74, 222, 128, 0.05)";
    chatInput.classList.add("drag-active");
  };

  chatInput.ondragleave = () => {
    chatInput.style.background = "transparent";
    chatInput.classList.remove("drag-active");
  };
}

if (chatInput) {
  chatInput.oninput = () => {
    const val = chatInput.value;
    if (val.startsWith("/")) {
      const matches = (window.commands || []).filter((c) =>
        c.cmd.startsWith(val.toLowerCase()),
      );
      if (matches.length > 0) {
        autoMenu.innerHTML = matches
          .map(
            (c) => `
        <div class="autocomplete-item" onclick="applyCommand('${c.cmd}')">
          <span>${escapeHtml(c.cmd)}</span><span class="command-desc">${escapeHtml(c.desc)}</span>
        </div>`,
          )
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
      if (emojiPicker) emojiPicker.classList.add("hidden");
      if (autoMenu) autoMenu.style.display = "none";
      window.sendMessage();
    }
  };
}

window.applyCommand = (cmd) => {
  chatInput.value = cmd + " ";
  chatInput.focus();
  autoMenu.style.display = "none";
};

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

if (chatContainer && dragHandle) {
  let x = 0,
    y = 0,
    initialX = 0,
    initialY = 0;
  dragHandle.onmousedown = (e) => {
    if (e.button !== 0) return;
    initialX = e.clientX;
    initialY = e.clientY;
    document.onmousemove = (e) => {
      x = initialX - e.clientX;
      y = initialY - e.clientY;
      initialX = e.clientX;
      initialY = e.clientY;
      chatContainer.style.top = chatContainer.offsetTop - y + "px";
      chatContainer.style.left = chatContainer.offsetLeft - x + "px";
      chatContainer.style.bottom = "auto";
      chatContainer.style.right = "auto";
    };
    document.onmouseup = () => {
      document.onmousemove = null;
    };
  };
}

window.askAI = async (prompt) => {
  const API_KEY = "AIzaSyBan19EJ9nIdXDGhv-LhcOlGuhQWmcH_zo";
  const URL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

  // 1. Prikaži lokalnu poruku korisniku da AI razmišlja
  const tempId = "ai-loading-" + Date.now();
  window.appendMessage("🤖 AI Asistent", "Razmišljam...", "#fbbf24", tempId, {
    username: "🤖 AI Asistent",
  });

  try {
    const response = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) throw new Error("API limit ili greška");

    const data = await response.json();
    const aiText = data.candidates[0].content.parts[0].text;

    // 2. Obriši "Razmišljam..." poruku (opciono, ili samo pošalji novu)
    // Šaljemo zvaničan odgovor u Firebase da bi ga SVI u čatu videli
    chatRef.push({
      username: "🤖 Gemini AI",
      text: aiText,
      color: "#fbbf24",
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("AI Error:", error);
    window.appendMessage(
      "Sistem",
      "AI trenutno nije dostupan (proveri API ključ ili limit).",
      "#ef4444",
    );
  }
};

window.appendSystemHTML = (htmlContent) => {
  const msgDiv = document.createElement("div");
  msgDiv.className = "chat-msg system-msg";
  msgDiv.style.alignSelf = "center"; // Centriraj sistemske poruke
  msgDiv.style.width = "90%";

  msgDiv.innerHTML = `<b style="color: #60a5fa">Sistem:</b><br>${htmlContent}`;

  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
};
