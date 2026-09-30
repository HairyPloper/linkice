/** Chat connection, room drafts, and outgoing message acknowledgements. */
(() => {
  const input = document.getElementById("chat-input");
  const status = document.getElementById("chat-connection-status");
  const reconnect = document.getElementById("chat-reconnect-btn");
  const draftNotice = document.getElementById("chat-draft-status");
  const draftKey = `linkice.chat-draft.v1:${window.CHANNEL}`;
  const outboxKey = `linkice.chat-outbox.v1:${window.CHANNEL}`;
  const outgoing = new Map();
  let connected = false;
  let chatReady = !!window.chatRef;
  let connecting = navigator.onLine !== false;
  let connectionError = false;
  let connectionTimer;
  let lastSavedDraft;

  function saveDraft() {
    if (!input) return;
    if (input.value === lastSavedDraft) return;
    try {
      if (input.value) localStorage.setItem(draftKey, input.value);
      else localStorage.removeItem(draftKey);
      lastSavedDraft = input.value;
      if (draftNotice) draftNotice.textContent = "";
    } catch {
      if (draftNotice) draftNotice.textContent = "Pregledač ne može da sačuva nacrt.";
    }
  }

  function saveOutbox() {
    try {
      // Each tab keeps its own outgoing messages, including across refreshes.
      const records = [...outgoing.values()].map(({ id, data, draft, state }) => ({ id, data, draft, state }));
      if (records.length) sessionStorage.setItem(outboxKey, JSON.stringify(records));
      else sessionStorage.removeItem(outboxKey);
      return true;
    } catch {
      return false;
    }
  }

  function renderMessage(entry, moveToEnd = false) {
    let bubble = document.getElementById(`chat-msg-${entry.id}`);
    if (!bubble) {
      const name = entry.data.type === "private" ? `[privatna za ${entry.data.to}]` : entry.data.username;
      bubble = window.appendMessage(name, entry.data.text, entry.data.color, entry.id,
        { ...entry.data, timestamp: typeof entry.data.timestamp === "number" ? entry.data.timestamp : null },
        { outgoing: true });
    }
    if (!bubble) return;
    if (moveToEnd) bubble.parentElement?.appendChild(bubble);
    // Voting before the poll itself is committed could create a partial record.
    if (entry.data.type === "poll") bubble.querySelectorAll(".poll-btn").forEach(button => { button.disabled = true; });
    let delivery = bubble.querySelector(".message-delivery");
    if (!delivery) {
      delivery = document.createElement("div");
      delivery.className = "message-delivery";
      const label = document.createElement("span");
      label.setAttribute("role", "status");
      delivery.appendChild(label);
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Pokušaj ponovo";
      retry.onclick = () => attempt(entry);
      delivery.appendChild(retry);
      bubble.appendChild(delivery);
    }
    delivery.dataset.state = entry.state;
    delivery.hidden = false;
    delivery.children[0].textContent = entry.state === "failed"
      ? (entry.restored ? "Slanje nije potvrđeno." : "Poruka nije poslata.")
      : canSend() ? "Slanje…" : "Čeka vezu…";
    delivery.children[1].hidden = entry.state !== "failed";
    delivery.children[1].disabled = !canSend();
  }

  function canSend() {
    return connected && chatReady && !connectionError && !!window.chatRef && !!firebase.auth().currentUser;
  }

  function renderConnection() {
    const state = canSend() ? "online" : connecting ? "connecting" : "offline";
    if (status) {
      status.dataset.state = state;
      status.hidden = state === "online";
      if (status.parentElement) status.parentElement.hidden = status.hidden;
      status.textContent = state === "online" ? "" : state === "connecting" ? "Chat se povezuje…" : "Chat offline";
    }
    if (reconnect) reconnect.hidden = state !== "offline";
    for (const entry of outgoing.values()) renderMessage(entry);
  }

  function armConnectionTimeout() {
    clearTimeout(connectionTimer);
    connectionTimer = setTimeout(() => {
      connecting = false;
      renderConnection();
    }, 10000);
  }

  async function attempt(entry) {
    if (entry.inFlight || !outgoing.has(entry.id)) return;
    entry.state = "pending";
    entry.restored = false;
    saveOutbox();
    renderMessage(entry);
    if (!canSend()) return;
    entry.inFlight = true;
    try {
      if (entry.data.senderUserId === null) entry.data.senderUserId = firebase.auth().currentUser.uid;
      // Reuse the reserved key after failures/reloads. An already committed
      // message must not be duplicated or have its timestamp overwritten.
      const result = await window.chatRef.child(entry.id).transaction(
        current => current === null ? entry.data : undefined, undefined, false,
      );
      if (!result.committed && !result.snapshot?.exists()) throw new Error("Message was not committed");
      outgoing.delete(entry.id);
      saveOutbox();
      if (input && entry.clearOnAck && input.value === entry.draft) {
        input.value = "";
        saveDraft();
      }
      const bubble = document.getElementById(`chat-msg-${entry.id}`);
      const timestamp = result.snapshot?.val()?.timestamp;
      if (bubble && typeof timestamp === "number" && !bubble.querySelector(".chat-time")) {
        const time = document.createElement("span");
        time.className = "chat-time";
        const date = new Date(timestamp);
        time.textContent = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
        bubble.prepend(time);
      }
      const delivery = bubble?.querySelector(".message-delivery");
      if (delivery) {
        delivery.dataset.state = "sent";
        delivery.hidden = true;
        delivery.children[0].textContent = "";
        delivery.children[1].hidden = true;
      }
      if (entry.data.type === "poll") bubble?.querySelectorAll(".poll-btn").forEach(button => { button.disabled = false; });
      // Only the first successful commit triggers a push, never an acknowledged retry.
      if (result.committed && entry.data.type !== "private" && entry.data.username !== "Sistem") {
        try {
          await window.notificationManager?.triggerGlobalPush(entry.data.username, entry.data.text);
        } catch (error) { console.warn("Message sent; notification unavailable:", error); }
      }
    } catch (error) {
      console.warn("Message delivery failed:", error);
      entry.state = "failed";
      saveOutbox();
      renderMessage(entry);
    } finally {
      entry.inFlight = false;
    }
  }

  window.chatDelivery = {
    saveDraft,
    enqueue(data, draft = null) {
      // When storage is blocked the text stays in the input until acknowledgement.
      const existing = [...outgoing.values()].find(entry => entry.clearOnAck && draft !== null && entry.draft === draft && entry.data.text === data.text);
      if (existing) {
        if (existing.state === "failed") void attempt(existing);
        return existing.id;
      }
      const id = firebase.database().ref(`messages/${window.CHANNEL}`).push().key;
      const entry = { id, data, draft, state: "pending", inFlight: false };
      outgoing.set(id, entry);
      const saved = saveOutbox();
      entry.clearOnAck = !saved && draft !== null;
      renderMessage(entry);
      // Clear only the exact submitted draft, after preserving the outgoing copy.
      if (input && draft !== null && input.value === draft && saved) {
        input.value = "";
        saveDraft();
      } else if (!saved && draftNotice) {
        draftNotice.textContent = "Poruka nije sačuvana u pregledaču. Sačekaj potvrdu pre osvežavanja.";
      }
      void attempt(entry);
      return id;
    },
    ready() {
      connectionError = false;
      chatReady = true;
      if (connected && window.chatRef) connecting = false;
      renderConnection();
      for (const entry of outgoing.values()) if (entry.state === "pending") void attempt(entry);
    },
    unavailable() {
      connectionError = true;
      connecting = false;
      renderConnection();
    },
    redraw(moveToEnd = false) { for (const entry of outgoing.values()) renderMessage(entry, moveToEnd); },
  };

  try {
    const saved = localStorage.getItem(draftKey);
    if (input && saved !== null) input.value = saved;
    lastSavedDraft = input?.value;
  } catch { /* Sending still works when browser storage is unavailable. */ }
  try {
    const records = JSON.parse(sessionStorage.getItem(outboxKey) || "[]");
    if (Array.isArray(records)) for (const entry of records) {
      if (!entry || typeof entry.id !== "string" || !/^[\w-]+$/.test(entry.id) ||
          !entry.data || typeof entry.data.text !== "string") continue;
      outgoing.set(entry.id, { ...entry, state: "failed", restored: true, inFlight: false });
    }
  } catch { /* Ignore damaged browser state. */ }

  input?.addEventListener("input", saveDraft);
  window.addEventListener("pagehide", saveDraft);
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveDraft(); });
  window.addEventListener("offline", () => {
    connected = false;
    connecting = false;
    renderConnection();
  });
  window.addEventListener("online", () => {
    connecting = true;
    armConnectionTimeout();
    firebase.database().goOnline();
    renderConnection();
  });
  if (reconnect) reconnect.onclick = async () => {
    connecting = true;
    connectionError = false;
    chatReady = false;
    armConnectionTimeout();
    renderConnection();
    firebase.database().goOnline();
    try {
      if (!firebase.auth().currentUser) await firebase.auth().signInAnonymously();
      else await window.restartChat?.();
    } catch { window.chatDelivery.unavailable(); }
  };
  firebase.database().ref(".info/connected").on("value", snapshot => {
    const wasConnected = connected;
    connected = snapshot.val() === true && navigator.onLine !== false;
    if (connected) {
      connecting = !chatReady && !connectionError;
      for (const entry of outgoing.values()) if (entry.state === "pending") void attempt(entry);
    } else if (wasConnected || navigator.onLine === false) {
      connecting = false;
    }
    renderConnection();
  }, () => window.chatDelivery.unavailable());
  armConnectionTimeout();
  renderConnection();
})();
