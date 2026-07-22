# Linkice
<img width="2508" height="627" alt="ChatGPT Image Jul 9, 2026, 10_07_17 AM" src="https://github.com/user-attachments/assets/beded649-869b-4d27-af4f-e2545e0e5c55" />

A real-time voice chat room built with **Agora WebRTC**, **Firebase**, and vanilla JavaScript. No accounts, no installs — open a link and talk. Create separate spaces instantly with a URL parameter.

---

## What it does

- 🎙️ **Voice calls** — join/leave a persistent space with mic mute, per-user volume sliders, and speaking indicators
- 💬 **Persistent chat** — messages stored in Firebase. Supports images, video, audio, YouTube, Spotify, and file embeds automatically from URLs
- 🏠 **Multiple spaces** — each `?space=` URL parameter creates a fully isolated space with its own voice channel, chat history, whiteboard, and presence. Share a link like `yoursite.com?space=gaming` to invite someone into a specific space
- 🎭 **Unique identities** — anonymous visitors receive a session-only funny nickname and animal icon; Firebase presence prevents participants in the same space from sharing either one
- 💤 **AFK disconnect** — inactive voice listeners receive a warning after 5 minutes and automatically leave Agora after 10 minutes while remaining connected to chat
- 🖥️ **Screen sharing** — 1080p/30fps with optional system audio capture
- 🎨 **Shared whiteboard** — real-time collaborative canvas with drawing tools and eraser, synced via Firebase
- 🎮 **Word guessing game** — drawer picks a word, others guess via chat. 60-second timer, confetti on correct guess
- 📊 **Polls** — create live multi-option polls with atomic vote counting
- 🤖 **AI bot** — `/bot` command hits Gemini API via proxy, falls back through multiple models if rate-limited
- 📱 **Mobile-friendly** — chat auto-collapses on join, touch-optimised controls, wake lock prevents screen sleep during calls

---

## Chat commands

| Command | Description |
|---|---|
| `/bot <question>` | Ask the AI a question (visible to everyone) |
| `/poll Question , Option1 , Option2` | Create a live poll |
| `/nick <name>` | Change your display name |
| `/roll <max>` | Roll a random number (default 1–100) |
| `/msg <user> <message>` | Send a private message; spaced names may be concatenated or quoted |
| `/ping` | Show Agora network stats (RTT + user count) |
| `/space` | Change space |
| `/crtkica` | Open / close the whiteboard (desktop only) |
| `/clear` | Clear your local chat view |
| `/help` | Show command reference card |

---

## URL parameters

```
?name=HairyPloper                   sets your display name for the session
?space=friday-night                  joins a specific space
?space=friday-night&name=HairyPloper       both at once
```

**Name** is saved to `localStorage` only when it is provided through `?name=` or `/nick`. Without an explicit name, a new random Serbian-style funny nickname is assigned on every page load. Funny names are displayed with spaces, while Firebase presence stores a lowercase concatenated `identityKey`, so `Znojava Rukica` and `znojavarukica` are the same identity. Legacy presence records remain compatible, and previously cached generated names are discarded automatically.

**Space** isolates everything — voice channel, chat, whiteboard, and presence are all scoped per space. The active value is always shown as `Space: <name>` in the chat header. If no `?space=` is provided, the saved space is restored, falling back to the default space. Space names are case-insensitive (`Gaming`, `GAMING`, and `gaming` resolve to the same room) and accept letters, numbers, dashes and underscores only (`a-z A-Z 0-9 - _`). Serbian diacritics and spaces are stripped automatically, so stick to ASCII names.

The nickname and animal icon are claimed atomically from Firebase presence as soon as chat initializes, so chat-only users also receive unique identities. Presence records include the Firebase user and browser-device IDs, preventing a reconnecting page from treating its own previous record as a different participant. Firebase disconnect cleanup is armed before the presence record is written, preventing a fast reload from leaving an orphaned nickname reservation. Their presence entry stays hidden from the voice grid until `voiceJoined` becomes true. Leaving voice keeps the chat reservation, while closing or disconnecting the page releases it through Firebase `onDisconnect`. If a custom nickname is already active in that space, the visitor receives a temporary funny nickname without losing the saved preference. `/nick` rejects names currently occupied by another participant in the same space. Chat messages use the same stable sender IDs for own-message alignment, with nickname matching retained only for legacy messages. Names and icons can be reused independently in other spaces.

```
✅  ?space=gaming
✅  ?space=friday-night
✅  ?space=pako_and_friends
❌  ?space=petak veče       (space stripped → falls back to default)
❌  ?space=cet123           (this works, diacritics must be avoided)
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Voice / video | Agora WebRTC SDK (RTC mode, VP8) |
| Realtime data | Firebase Realtime Database |
| Auth | Firebase Anonymous Auth |
| AI | Google Gemini API (via Vercel proxy) |
| File hosting | Catbox.moe / Litterbox (temporary) |
| Frontend | Vanilla JS (ES6+), HTML5 Canvas, Web Audio API |

No build step. No framework. No bundler.

---

## Project structure

```
voice_room_web/
├── index.html        # Entry point — Firebase config lives here
├── css/
│   └── style.css
├── js/
│   ├── main.js       # App init, globals, audio settings, speaker selection
│   ├── rtc.js        # Agora: join/leave, mic, screen share, reconnection
│   ├── chat.js       # Firebase chat, slash commands, polls, AI bot, file upload
│   ├── ui.js         # User cards, video overlays, background video/music
│   ├── utils.js      # Shared helpers: escapeHtml, playTone, wakeLock, sanitizer
│   └── whiteboard.js # Canvas drawing, Firebase stroke sync, word game
└── src/              # Static assets (audio, etc.)
```

---

## Setup

### Prerequisites

- Firebase project with **Realtime Database** and **Anonymous Auth** enabled
- Agora account with an **App ID**
- Gemini API key + a proxy to forward requests (the default proxy is a Vercel function)

### Steps

1. **Clone**
   ```bash
   git clone <repository-url>
   cd voice_room_web
   ```

2. **Firebase** — paste your config object into `index.html`:
   ```js
   const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     databaseURL: "...",
     projectId: "...",
   };
   ```

3. **Agora** — set your App ID in `js/main.js`:
   ```js
   window.APP_ID = "your-agora-app-id";
   ```
   > ⚠️ For production, replace the `null` token in `client.join()` with server-generated short-lived tokens to prevent unauthorised channel access.

4. **AI proxy** — update the fetch URL in `js/chat.js` `askAI()` to point at your own Gemini proxy:
   ```js
   fetch("https://your-proxy.vercel.app/api/gemini", ...)
   ```

5. **Open** `index.html` directly in a browser or serve with any static server:
   ```bash
   npx serve .
   ```

## Audio settings

AEC (echo cancellation), AGC (gain control), and ANS (noise suppression) can be toggled per-session from the settings menu. Choices are saved to `localStorage`. Speaker output device can also be selected after joining (desktop only).

Voice users are considered active when they interact with the page or speak into the microphone. After 5 inactive minutes the chat shows a warning; after 10 minutes the normal leave flow disconnects Agora but keeps chat and its identity reservation active. Adjust `APP_CONFIG.afkTimeoutMs` and `APP_CONFIG.afkWarningMs` in `js/main.js` to change these intervals.

---

## Browser support

| Browser | Voice | Screen share | Whiteboard |
|---|---|---|---|
| Chrome 80+ | ✅ | ✅ | ✅ |
| Edge 80+ | ✅ | ✅ | ✅ |
| Firefox 75+ | ✅ | ✅ | ✅ |
| Safari 13+ | ✅ | ⚠️ Limited | ✅ |
| iOS Safari | ✅ | ❌ | ❌ |
| Chrome Mobile | ✅ | ❌ | ❌ |

---

## License

Open source. Use and modify freely.
