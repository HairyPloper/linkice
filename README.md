# Linkice
<img width="2508" height="627" alt="ChatGPT Image Jul 9, 2026, 10_07_17 AM" src="https://github.com/user-attachments/assets/beded649-869b-4d27-af4f-e2545e0e5c55" />

A real-time voice chat room built with **Agora WebRTC**, **Firebase**, and vanilla JavaScript. No accounts, no installs — open a link and talk. Create separate spaces instantly with a URL parameter.

---

## What it does

- 🎙️ **Voice calls** — join/leave a persistent space with mic mute, per-user volume sliders, and speaking indicators
- 💬 **Persistent chat** — messages stored in Firebase. Supports images, video, audio, YouTube, Spotify, and file embeds automatically from URLs
- 🏠 **Multiple spaces** — each `?space=` URL parameter creates a fully isolated space with its own voice channel, chat history, whiteboard, and presence. Share a link like `yoursite.com?space=gaming` to invite someone into a specific space
- 🎭 **Session identities** — every tab/device has a unique Firebase/Agora session; generated funny names are random and collision-free, while custom names may be shared
- 💤 **Solo AFK disconnect** — users who are alone in voice receive a warning after 15 inactive minutes and automatically leave Agora after 30 minutes while remaining connected to chat
- 🖥️ **Screen sharing** — 1080p/30fps with optional system audio capture
- 🎨 **Shared whiteboard** — real-time collaborative canvas with drawing tools and eraser, synced via Firebase
- 🎮 **Word guessing game** — drawer picks a word, others guess via chat. 60-second timer, confetti on correct guess
- 📊 **Polls** — create live multi-option polls with atomic vote counting
- 🤖 **AI bot** — `/bot` command hits Gemini API via proxy, falls back through multiple models if rate-limited
- 📱 **Mobile-friendly** — chat auto-collapses on join, touch-optimised controls, wake lock prevents screen sleep during calls
- **Push notifications** — each device follows its latest visited space and receives only one alert while that space has unread messages

---

## Chat commands

| Command | Description |
|---|---|
| `/bot <question>` | Ask the AI a question (visible to everyone) |
| `/poll Question , Option1 , Option2` | Create a live poll |
| `/nick <name>` | Change your display name |
| `/roll <max>` | Roll a random number (default 1–100) |
| `/msg <user[#session]> <message>` | Send a private message; duplicate names are disambiguated by session ID |
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

**Name** is saved to `localStorage` only when it is provided through `?name=` or `/nick`. Without an explicit name, a new random Serbian-style funny nickname is assigned on every page load; Firebase presence replaces it with another random free funny name if a collision occurs. Generated funny names therefore stay unique among active sessions. Explicit custom names are labels rather than identifiers, so multiple sessions may deliberately use the same name. Firebase presence stores a lowercase concatenated `identityKey` for collision checks and name lookup. Previously cached generated names are discarded automatically.

**Space** isolates everything — voice channel, chat, whiteboard, and presence are all scoped per space. The active value is always shown as `Space: <name>` in the chat header. If no `?space=` is provided, the saved space is restored, falling back to the default space. Space names are case-insensitive (`Gaming`, `GAMING`, and `gaming` resolve to the same room) and accept letters, numbers, dashes and underscores only (`a-z A-Z 0-9 - _`). Serbian diacritics and spaces are stripped automatically, so stick to ASCII names.

Each tab/device claims an atomic, unique session entry in Firebase presence as soon as chat initializes, so chat-only users are represented too. Generated funny names and icons are selected randomly from currently unused values, while custom names may be duplicated: a PC and phone can both appear as `Anton`, with different Firebase presence keys and Agora UIDs. Chat messages store only the session ID and anonymous Firebase user ID needed for session features and own-message alignment; the push device ID remains private to the notification flow, and the space is already encoded in the Firebase path. Disconnect cleanup is armed before presence is written. On page refresh or navigation the client explicitly closes Firebase so the server executes `onDisconnect`; a page restored from mobile back/forward cache reconnects and reclaims presence. The presence entry stays hidden from the voice grid until `voiceJoined` becomes true. Leaving voice keeps the chat session, while closing or disconnecting the page releases it. When `/msg` encounters duplicate custom names it lists `name#session` choices so the sender can select exactly one recipient. The whiteboard game likewise tracks its drawer by session ID.

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

Solo voice users are considered active when they interact with the page or speak into the microphone. When another Agora user is connected, the AFK warning and disconnect are disabled. After the last other user leaves, a fresh solo timer starts: the chat warns after 15 inactive minutes, and after 30 minutes the normal leave flow disconnects Agora but keeps chat and its identity reservation active. Adjust `APP_CONFIG.afkTimeoutMs` and `APP_CONFIG.afkWarningMs` in `js/main.js` to change these intervals.

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
