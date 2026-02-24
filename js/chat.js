/**
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
