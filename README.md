# Voice Room Web

A modern web-based voice chat application built with Agora WebRTC, Firebase, and vanilla JavaScript. Features real-time audio communication, chat messaging, AI integration, polls, and more.

## Features

- **Real-time Voice Chat**: High-quality audio communication using Agora WebRTC
- **Live Chat**: Firebase-powered messaging with emoji support, file uploads, and media links
- **AI Integration**: Built-in AI chat using Gemini API for intelligent responses
- **Interactive Polls**: Create and vote on polls in real-time
- **Screen Sharing**: Share your screen with other participants
- **Mobile Responsive**: Optimized for both desktop and mobile devices
- **Customizable Avatars**: Personalize your presence with custom icons
- **Volume Controls**: Individual volume adjustment for each participant
- **Drag-and-Drop Chat**: Movable chat interface on desktop
- **Auto-Collapse**: Chat minimizes on join to show avatars

## Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **WebRTC**: Agora SDK for real-time communication
- **Backend**: Firebase Realtime Database for chat persistence
- **AI**: Google Gemini API for AI responses
- **File Upload**: Catbox.moe for image/file sharing
- **Icons**: Custom emoji and icon system

## Setup Instructions

### Prerequisites
- Node.js (optional, for local development)
- Firebase project with Realtime Database enabled
- Agora account with App ID
- Gemini API key (for AI features)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd voice_room_web
   ```

2. Configure Firebase:
   - Create a Firebase project at https://console.firebase.google.com/
   - Enable Realtime Database
   - Copy your Firebase config to `index.html`

3. Configure Agora:
   - Sign up at https://www.agora.io/
   - Get your App ID and update `js/main.js`

4. Configure AI (optional):
   - Get a Gemini API key
   - Update the proxy URL in `js/chat.js`

5. Open `index.html` in your browser or serve locally

### Usage

1. Enter your name (optional) in the URL: `?name=YourName`
2. Click "Upadni" (Join) to enter the voice room
3. Use the chat commands:
   - `/ai <question>` - Ask AI a question
   - `/poll <question> , <option1> , <option2>` - Create a poll
   - `/nick <name>` - Change your nickname
   - `/roll <number>` - Roll a dice
   - `/msg <user> <message>` - Send private message
   - `/help` - Show all commands

### Mobile Features

- Chat collapses to header on join to prioritize avatars
- Touch-friendly interface
- Optimized for mobile browsers
- Bottom-positioned controls

## Project Structure

```
voice_room_web/
├── index.html          # Main HTML file
├── css/
│   └── style.css       # Stylesheets
├── js/
│   ├── main.js         # Initialization and globals
│   ├── rtc.js          # Agora WebRTC logic
│   ├── chat.js         # Chat and UI logic
│   ├── ui.js           # User interface utilities
│   └── utils.js        # Helper functions
├── src/                # Assets (audio files, etc.)
└── README.md           # This file
```

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source. Feel free to use and modify as needed.

## Acknowledgments

- Agora.io for WebRTC infrastructure
- Firebase for real-time database
- Google for Gemini AI API
- Icons from various open sources


