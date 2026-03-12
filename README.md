# Linkice

A real-time voice chat room built with **Agora WebRTC**, **Firebase**, and vanilla JavaScript. No accounts, no installs — open a link and talk. Create separate spaces instantly with a URL parameter.

---

## What it does

- 🎙️ **Voice calls** — join/leave a persistent space with mic mute, per-user volume sliders, and speaking indicators
- 💬 **Persistent chat** — messages stored in Firebase, last 50 loaded on join. Supports images, video, audio, YouTube, Spotify, and file embeds automatically from URLs
- 🏠 **Multiple spaces** — each `?space=` URL parameter creates a fully isolated space with its own voice channel, chat history, whiteboard, and presence. Share a link like `yoursite.com?space=gaming` to invite someone into a specific space
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
| `/msg <user> <message>` | Send a private message |
| `/ping` | Show Agora network stats (RTT + user count) |
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

**Name** is saved to `localStorage` so it persists on reload. If no name is set, a random `Gost_XXXX` is assigned.

**Space** isolates everything — voice channel, chat, whiteboard, and presence are all scoped per space. If no `?space=` is provided, everyone lands in the default space. Space names accept letters, numbers, dashes and underscores only (`a-z A-Z 0-9 - _`). Serbian diacritics and spaces are stripped automatically, so stick to ASCII names.

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
