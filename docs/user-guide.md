# Using Linkice

[Back to the project](../README.md) · [Developer guide](development.md)

## Rooms and names

Open Linkice to use chat. Click **Upadni** to join voice and allow microphone access. **Izađi** leaves voice while keeping chat connected.

Share your instance's URL with a space name to invite someone to the same room. For example:

```text
https://example.com/?space=friday-night&name=YourName
```

| Parameter | Purpose | Example |
|---|---|---|
| `space` | Choose a room | `?space=friday-night` |
| `name` | Set your display name | `?name=Anton` |

Room names are case-insensitive and accept ASCII letters, numbers, hyphens, and underscores. Other characters are removed. Without a room parameter, Linkice restores your last room or uses the default. Anyone who knows a room link can join it.

A name chosen through `?name=` or `/nick` is saved in your browser. Otherwise, each page load gets a random funny nickname. Generated names are unique among active sessions; custom names can be shared by more than one person.

## Voice and audio

- Click your own avatar to mute or unmute your microphone.
- Click another participant to adjust their voice volume.
- Use the screen-share player's volume control for shared audio. Screen-share previews are silent.
- After joining voice, open **Postavke → Audio** to choose a microphone. Speaker selection is available in desktop Chrome and Edge through the current Agora integration.

Microphone and speaker choices are saved after a successful switch. If a saved device is unavailable, the app falls back to the default device. A failed switch displays a message and restores the previous selection. Device lists refresh when hardware changes.

Echo cancellation (AEC), automatic gain control (AGC), and noise suppression (ANS) are also saved. Changes to these processing options apply the next time you join voice.

When you are alone in voice, page activity and microphone speech reset the inactivity timer. After 15 inactive minutes, a warning appears; after 30 minutes, Linkice leaves voice and keeps chat connected. Another voice participant joining stops the countdown.

## Chat and history

Chat shows the latest 50 stored messages. Messages addressed to other people are filtered from the view, so fewer messages may be visible.

On desktop, drag the chat handle to move the panel or click it to collapse it. URLs can expand into images, video, audio, YouTube, Spotify, and file previews. Uploads use Catbox for permanent hosting or Litterbox for temporary hosting.

### Commands

| Command | What it does |
|---|---|
| `/help` | Show the command reference. |
| `/nick <name>` | Change and save your display name. |
| `/space <room>` | Switch to another room. |
| `/poll Question , Option1 , Option2` | Create a poll. |
| `/roll <max>` | Roll a random number; the default maximum is 100. |
| `/bot <question>` | Ask the AI bot; the response is visible to everyone. |
| `/msg <user[#session]> <message>` | Address a message to a participant. |
| `/ping` | Show voice network statistics. |
| `/crtkica` | Open or close the whiteboard on desktop. |
| `/clear` | Clear your local chat view; reloading restores stored history. |

For names with spaces, use quotes: `/msg "Your Friend" Hello`. If several people have the same name, `/msg` lists their session identifiers so you can select one recipient.

Addressed messages currently share the room's database path and are hidden by the interface. They should not be treated as confidential private messages; see [current access controls](development.md#current-access-controls).

## Saved preferences

Linkice remembers these settings in the current browser:

- Custom nickname, avatar, and last room.
- Microphone processing options and chosen input/output devices.
- Other participants' voice and screen-share volumes, saved separately.
- Desktop chat position and expanded/collapsed state.

Participant volumes are matched by name, ignoring capitalization and surrounding whitespace. Zero volume is saved too. Preferences survive reloads, room changes, and reconnects with new participant IDs. Identical names share a preference; a new name has its own settings.

Chat positions stay within the window when restored. Mobile uses its responsive layout. These preferences do not sync between devices or browsers, and clearing site data removes them.

## Notifications

When browser notifications are enabled, each device follows its latest visited room. The notification integration groups unread messages so that the room generates one alert while it has unread messages.

## Browser notes

Use a current browser and allow microphone access when joining voice. Features depend on browser permissions, hardware, and operating system support.

- **Speaker selection:** the current Agora integration exposes output switching on desktop Chrome and Edge. Use system audio settings on Firefox, Safari, and mobile.
- **Screen sharing:** availability and audio capture depend on the browser and operating system.
- **Whiteboard and drawing game:** available on desktop.

Live microphone and speaker switching has been checked in Chrome. Automated tests simulate device behavior; they do not establish full compatibility with every browser or device.
