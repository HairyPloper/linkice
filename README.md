# Linkice

<img width="2508" height="627" alt="Linkice" src="https://github.com/user-attachments/assets/beded649-869b-4d27-af4f-e2545e0e5c55" />

**Voice, chat, and shared screens. Just open a room link.**

Linkice is a place to hang out with your group directly in the browser. Talk, share something on your screen, send files, or play a quick drawing game. No signup or installation required.

[User guide](docs/user-guide.md) · [Developer guide](docs/development.md)

## What you can do

- **Talk together** with microphone controls, speaking indicators, and individual volume settings.
- **Keep the conversation going** with persistent chat, polls, file sharing, and media previews.
- **Share your screen** with optional audio on supported browsers.
- **Draw and play** on a shared whiteboard with a word-guessing game on desktop.
- **Make a space for your group** by sharing a room link.
- **Make yourself at home** with browser-saved names, audio preferences, and chat layout.

## Join your group

1. Open your Linkice instance or a room link someone shared with you.
2. Start chatting, or click **Upadni** to join voice and allow microphone access.
3. Use the microphone and headphones buttons above the main controls to mute or deafen. Click another participant to adjust their volume.

For a room of your own, add a space name to your instance's URL and share it. For example:

```text
https://example.com/?space=friday-night
```

Anyone with the room link can join. Use `/nick Your Name` to choose a name and `/help` to discover chat commands. The interface is currently in Serbian.

See the [user guide](docs/user-guide.md) for audio settings, commands, notifications, and browser limitations.

## Run locally

With Git and Python installed:

```sh
git clone https://github.com/HairyPloper/linkice.git
cd linkice
python -m http.server 8000 --bind 127.0.0.1
```

Open [localhost:8000](http://localhost:8000). No package installation or build step is needed to serve the frontend locally; voice, chat, and integrations still connect to their configured services.

To configure your own services, run the tests, or deploy a fork, follow the [developer guide](docs/development.md).

## Built with

HTML, CSS, and vanilla JavaScript, with **Agora WebRTC** for voice and screen sharing, **Firebase** for chat and presence, and **HTML Canvas** for the whiteboard. Optional integrations provide AI replies, file hosting, and push notifications.

## License

See [LICENSE](LICENSE).
