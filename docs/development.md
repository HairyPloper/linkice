# Developing Linkice

[Back to the project](../README.md) · [User guide](user-guide.md)

## Local development

Serve the repository with Python:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open [localhost:8000](http://localhost:8000). Edit the source files and reload the page. The frontend needs no package installation or local build step. Use localhost for development and HTTPS when hosting so browser media and notification features can work.

The app still connects to external services. Backend proxy implementations and deployed Firebase rules are not included in this repository. Configure your own services when hosting an independent instance.

## Service configuration

| Service | Configuration location | Purpose |
|---|---|---|
| Firebase | `firebaseConfig` in [index.html](../index.html) | Anonymous authentication, chat, presence, polls, and whiteboard data. |
| Agora | `window.APP_ID` in [js/main.js](../js/main.js) | Voice and screen sharing. |
| AI proxy | `APP_CONFIG.aiProxyUrl` in [js/main.js](../js/main.js) | AI bot requests. |
| Notification proxy | `APP_CONFIG.notifyProxyUrl` in [js/main.js](../js/main.js) | Push notification delivery. |
| Push public key | `vapidPublicKey` in [js/notifications.js](../js/notifications.js) | Browser push subscriptions. |
| Upload proxy | `APP_CONFIG.corsProxyUrl` in [js/main.js](../js/main.js) | Fallback for file upload requests. |

To configure a fork:

1. Create a Firebase project, enable Anonymous Authentication and Realtime Database, and update the client configuration.
2. Set your Agora App ID and configure channel authentication for your deployment.
3. Configure the optional AI and notification backends. Keep server API secrets in those backends, outside the frontend. Match the browser's VAPID public key to your push service.
4. Test chat, voice, permissions, and any enabled integrations locally before deploying.

File uploads use Catbox for permanent hosting and Litterbox for temporary hosting. Those services, the AI proxy, and the notification proxy are external to this repository.

### Current access controls

Room names separate Firebase paths and Agora channels. They are not passwords or access-control rules, and anyone with a room link can join.

Both the voice and screen-sharing clients currently join Agora with a `null` token. A deployment that restricts access needs server-issued tokens and corresponding authorization.

The `/msg` command stores addressed messages in the shared room message path and filters them in the browser. Confidential messages need recipient-restricted storage and enforced database access rules.

The deployed Firebase rules are not present here. Review read/write permissions and data validation in your own Firebase project; client-side checks do not enforce access control.

## Code map

| File | Responsibility |
|---|---|
| [index.html](../index.html) | Page markup, Firebase initialization, and script loading. |
| [css/style.css](../css/style.css) | Layout, styling, and responsive behavior. |
| [js/main.js](../js/main.js) | App configuration, identity, settings, and audio device selection. |
| [js/utils.js](../js/utils.js) | Shared helpers and browser preference storage. |
| [js/ui.js](../js/ui.js) | Participant cards, chat layout, and media overlays. |
| [js/rtc.js](../js/rtc.js) | Agora voice, microphone, screen sharing, and reconnection. |
| [js/chat.js](../js/chat.js) | Chat history, commands, polls, AI requests, and uploads. |
| [js/chat-delivery.js](../js/chat-delivery.js) | Chat connection state, per-room drafts, outgoing messages, and retries. |
| [js/whiteboard.js](../js/whiteboard.js) | Shared drawing and the word-guessing game. |
| [js/notifications.js](../js/notifications.js) | Browser notification and push subscription handling. |
| [sw.js](../sw.js) | Service worker for push notifications. |

The scripts share globals and load in the order listed in `index.html`. Preserve that order in the deployment bundle.

## Identity and presence

Firebase Anonymous Authentication and a per-page Agora UID identify sessions without requiring account signup. Display names are labels, so multiple tabs or devices can deliberately use the same custom name.

Each session reserves a presence entry. Generated names and icons are selected from unused values, and disconnect cleanup is registered before presence is written. Chat-only sessions have presence but remain hidden from the voice grid. Leaving voice keeps chat connected; closing or disconnecting the page releases presence. Pages restored from the browser's back/forward cache reconnect and reclaim presence.

Messages carry sender session and anonymous user identifiers. The `/msg` command uses session identifiers to disambiguate duplicate names, and the whiteboard game tracks its drawer by session. Saved volume preferences use display names for convenience; they do not establish identity or authorization.

## Tests

With Node.js installed, run:

```sh
node --test tests/*.test.js
```

The regression tests use simulated SDK and browser behavior. They do not replace live checks of media permissions, actual audio hardware, or browser compatibility.

The [chat history fixture](../tests/fixtures/chat-history.html) and [screen player fixture](../tests/fixtures/screen-player.html) provide local browser test pages with simulated data. Open them through the local server to check the UI without posting to a live room.

## Deployment

The [GitHub Actions workflow](../.github/workflows/deploy.yml) runs regression tests, concatenates the seven application scripts, minifies them with Terser, verifies the output, and publishes it to GitHub Pages.

- `main` publishes at the site root.
- `dev_b` publishes under `/dev/`.
- Generated files are published to the `gh-pages` branch.

The deployed HTML loads one application bundle. If you add or reorder scripts, update both `index.html` and the workflow. After building a local `dist` directory, verify its HTML and bundle with:

```sh
node scripts/verify-build.cjs dist
```

## Diagnostics

- `/ping` displays voice network statistics in chat.
- `window.getAfkStatus()` in the browser console reports the solo inactivity timer state.
- `window.getScreenShareStatus()` reports screen-sharing state.

The default inactivity warning is 15 minutes and the disconnect threshold is 30 minutes. Change `APP_CONFIG.afkWarningMs` and `APP_CONFIG.afkTimeoutMs` in `js/main.js` to adjust them. Disconnecting for inactivity leaves chat connected.
