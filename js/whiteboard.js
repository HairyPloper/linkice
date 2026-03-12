/**
 * js/whiteboard.js
 * Shared real-time whiteboard using Firebase and HTML Canvas.
 * Desktop only.
 */

// ============================================================
// DESKTOP ONLY
// ============================================================
if (/iPhone|iPad|Android/i.test(navigator.userAgent)) {
  const btn = document.getElementById("whiteboard-btn");
  if (btn) btn.style.display = "none";
} else {
  initWhiteboard();
}

function initWhiteboard() {
  const container   = document.getElementById("whiteboard-container");
  const canvas      = document.getElementById("whiteboard-canvas");
  const handle      = document.getElementById("whiteboard-drag-handle");
  const closeBtn    = document.getElementById("whiteboard-close");
  const colorPick   = document.getElementById("wb-color");
  const sizePick    = document.getElementById("wb-size");
  const eraserBtn   = document.getElementById("wb-eraser");
  const clearBtn    = document.getElementById("wb-clear");
  const wordBtn     = document.getElementById("wb-word");
  const wordDisplay = document.getElementById("wb-current-word");
  const stopBtn     = document.getElementById("wb-stop");

  const ctx = canvas.getContext("2d");

  // ============================================================
  // STATE
  // ============================================================
  let drawing      = false;
  let isEraser     = false;
  let currentColor = "#ffffff";
  let currentSize  = 3;
  let lastX = 0, lastY = 0;
  let myWord = null;

  // Firebase refs
  const wbRef    = firebase.database().ref(`whiteboard/${window.CHANNEL}`);
  const wbClrRef = firebase.database().ref(`whiteboard-cleared/${window.CHANNEL}`);
  const gameRef  = firebase.database().ref(`whiteboard-game/${window.CHANNEL}`);

  // ============================================================
  // STROKE BUFFER — THROTTLED FIREBASE WRITES
  // FLUSH_INTERVAL ms (~30 fps).
  // ============================================================
  const FLUSH_INTERVAL = 30; // ms
  let   strokeBuffer   = [];
  let   flushTimer     = null;

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (!strokeBuffer.length) return;
      const batch = {};
      strokeBuffer.forEach(stroke => {
        batch[wbRef.push().key] = stroke;
      });
      strokeBuffer = [];
      wbRef.update(batch);
    }, FLUSH_INTERVAL);
  }

  // ============================================================
  // WORD LIST
  // ============================================================
  const WORDS = [
    "petak","ponedeljak","familija","doktor","tiba","linija","pomfrit","gospodarica","osvezenje","majonez",
    "boks","umor","fabrika","sizofrenija","ruke","gas","spavanje","makarone","gram","pirat",
    "pepko","inkubator","dusek","krompiri","smi","federacija","drugostepena","prekovremeno","brisanje","pivo",
    "dremikca","ispravljanje","palacinka","maskembal","planinarenje","politika","bazen","fotelja","prosiptati","slagalica"
  ];

  // ============================================================
  // TIMER CONFIG
  // ============================================================
  const TIMER_ENABLED  = true;   // set to false to disable timer and show word until stop button is pressed
  const TIMER_DURATION = 60;     // seconds
  window.timerInterval = null;

  // ============================================================
  // CANVAS SIZING
  // ============================================================
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width;
    canvas.height = rect.height;
  }

  // ============================================================
  // CLOSE BUTTON
  // ============================================================
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    container.classList.add("hidden");
  };

  // ============================================================
  // TOOLBAR
  // ============================================================
  colorPick.oninput = (e) => {
    currentColor = e.target.value;
    isEraser = false;
    eraserBtn.classList.remove("active");
  };

  sizePick.oninput = (e) => {
    currentSize = parseInt(e.target.value);
  };

  eraserBtn.onclick = () => {
    isEraser = !isEraser;
    eraserBtn.classList.toggle("active", isEraser);
  };

  clearBtn.onclick = async () => {
    await wbClrRef.set({ clearedAt: Date.now(), by: window.myDisplayName });
    await wbRef.remove();
    setTimeout(() => wbClrRef.remove(), 2000);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // ============================================================
  // WORD GAME — GENERATE WORD
  // ============================================================
  wordBtn.onclick = () => {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    myWord = word;
    wordDisplay.textContent = `✏️ Tvoja reč: ${word}`;

    gameRef.set({
      word:   word,
      drawer: window.myDisplayName,
      active: true,
      winner: null,
      endsAt:    TIMER_ENABLED ? Date.now() + TIMER_DURATION * 1000 : null,
    });

    window.chatRef.push({
      username:  "Sistem",
      text:      `🎮 ${window.myDisplayName} crta reč — pogodite šta je...`,
      color:     "#fbbf24",
      timestamp: Date.now(),
    });
  };

  // ============================================================
  // WORD GAME — STOP
  // ============================================================
  stopBtn.onclick = () => {
    clearInterval(timerInterval);
    gameRef.remove();
    wordDisplay.textContent = "";
    myWord = null;
    stopBtn.style.display = "none";
    window.chatRef.push({
      username:  "Sistem",
      text:      `🛑 ${window.myDisplayName} je zaustavio igru.`,
      color:     "#fbbf24",
      timestamp: Date.now(),
    });
  };

  // ============================================================
  // WORD GAME — STATE LISTENER (single, handles display + stop btn)
  // ============================================================
  gameRef.on("value", (snap) => {
    const data = snap.val();

    if (!data) {
      wordDisplay.textContent  = "";
      myWord                   = null;
      stopBtn.style.display    = "none";
      return;
    }

    const isDrawer = data.drawer === window.myDisplayName;

    if (!isDrawer) {
      wordDisplay.textContent = data.active
        ? `✏️ ${data.drawer} crta...`
        : `✅ Reč je bila: ${data.word}`;
    }

    // Start countdown only for the drawer, only if timer is on and game is active
    if (TIMER_ENABLED && isDrawer && data.active && data.endsAt) {
    startTimer(data.endsAt);
    }

    // Only the drawer sees the stop button, only while game is active
    stopBtn.style.display = (isDrawer && data.active) ? "inline-block" : "none";
  });

  // ============================================================
  // WORD GAME — TIMER
  // ============================================================
  function startTimer(endsAt) {
  clearInterval(timerInterval);
  window.timerInterval = setInterval(() => {
    const secondsLeft = Math.ceil((endsAt - Date.now()) / 1000);
    if (secondsLeft <= 0) {
      clearInterval(timerInterval);
      // Time's up — reveal word and end game
      gameRef.once("value", (snap) => {
        const data = snap.val();
        if (!data || !data.active) return;
        gameRef.remove();
        window.chatRef.push({
          username:  "Sistem",
          text:      `⏰ Vreme je isteklo! Reč je bila: ${data.word}`,
          color:     "#fbbf24",
          timestamp: Date.now(),
        });
      });
      return;
    }
    // Update display for the drawer only
    if (myWord) {
      wordDisplay.textContent = `✏️ Tvoja reč: ${myWord} (${secondsLeft}s)`;
    }
  }, 1000);
}

  // ============================================================
  // WORD GAME — CONFETTI
  // ============================================================
  function launchConfetti() {
    const colors = ["#4ade80","#fbbf24","#60a5fa","#f87171","#c084fc"];
    for (let i = 0; i < 60; i++) {
      const el = document.createElement("div");
      el.style.cssText = `
        position: absolute;
        width: 8px; height: 8px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        border-radius: 50%;
        left: ${Math.random() * 100}%;
        top: 0;
        pointer-events: none;
        z-index: 9999;
        animation: confetti-fall ${1 + Math.random()}s ease-out forwards;
      `;
      container.appendChild(el);
      setTimeout(() => el.remove(), 2000);
    }
  }

  window.launchWhiteboardConfetti = launchConfetti;

  // ============================================================
  // DRAWING — LOCAL
  // ============================================================
  canvas.onmousedown = (e) => {
    drawing = true;
    const rect = canvas.getBoundingClientRect();
    lastX = (e.clientX - rect.left) * (canvas.width  / rect.width);
    lastY = (e.clientY - rect.top)  * (canvas.height / rect.height);
  };

  canvas.onmousemove = (e) => {
    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width  / rect.width);
    const y = (e.clientY - rect.top)  * (canvas.height / rect.height);

    drawLine(lastX, lastY, x, y, isEraser ? "#000000" : currentColor, currentSize, isEraser);

    strokeBuffer.push({
      x1:     lastX / canvas.width,
      y1:     lastY / canvas.height,
      x2:     x     / canvas.width,
      y2:     y     / canvas.height,
      color:  isEraser ? null : currentColor,
      size:   currentSize,
      eraser: isEraser,
    });
    scheduleFlush();

    lastX = x;
    lastY = y;
  };

  canvas.onmouseup    = () => { drawing = false; };
  canvas.onmouseleave = () => { drawing = false; };

  // ============================================================
  // DRAW LINE HELPER
  // ============================================================
  function drawLine(x1, y1, x2, y2, color, size, eraser) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = eraser ? "rgba(0,0,0,1)" : color;
    ctx.lineWidth   = size;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.globalCompositeOperation = eraser ? "destination-out" : "source-over";
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  // ============================================================
  // FIREBASE — REAL TIME STROKE LISTENER
  // ============================================================
  wbRef.on("child_added", (snap) => {
    const d = snap.val();
    if (!d) return;
    drawLine(
      d.x1 * canvas.width,
      d.y1 * canvas.height,
      d.x2 * canvas.width,
      d.y2 * canvas.height,
      d.color || "#000000",
      d.size,
      d.eraser
    );
  });

  // ============================================================
  // FIREBASE — CLEAR SIGNAL LISTENER
  // ============================================================
  wbClrRef.on("value", (snap) => {
    if (snap.exists()) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  });

  // ============================================================
  // LOAD SNAPSHOT
  // ============================================================
  function loadSnapshot() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    wbRef.limitToLast(10000).once("value", (snap) => {
      snap.forEach((child) => {
        const d = child.val();
        drawLine(
          d.x1 * canvas.width,
          d.y1 * canvas.height,
          d.x2 * canvas.width,
          d.y2 * canvas.height,
          d.color || "#000000",
          d.size,
          d.eraser
        );
      });
    });
  }

  // ============================================================
  // DRAGGABLE PANEL
  // ============================================================
  let dx = 0, dy = 0, startX = 0, startY = 0;

  handle.onmousedown = (e) => {
    if (e.target === closeBtn) return;
    
    // Capture real rendered position BEFORE clearing the transform
    const rect = container.getBoundingClientRect();
    container.style.left      = rect.left + "px";
    container.style.top       = rect.top  + "px";
    container.style.transform = "none";

    startX = e.clientX;
    startY = e.clientY;

    document.onmousemove = (e) => {
      dx = startX - e.clientX;
      dy = startY - e.clientY;
      startX = e.clientX;
      startY = e.clientY;
      container.style.left = container.offsetLeft - dx + "px";
      container.style.top  = container.offsetTop  - dy + "px";
    };

    document.onmouseup = () => {
      document.onmousemove = null;
    };
  };

  // ============================================================
  // EXPOSE FOR /crtkica COMMAND
  // ============================================================
  window.resizeWhiteboardCanvas = resizeCanvas;
  window.loadWhiteboardSnapshot = loadSnapshot;
}