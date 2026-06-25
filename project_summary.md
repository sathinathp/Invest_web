# Lamnicate Investments - Project Summary

A premium, high-fidelity landing page and dealflow management system built for **Lamnicate Investments**. It features an interactive **Voice Pitch Speech Portal** that analyzes founder qualities (Obsession, Speed, Resilience, Technical Moat) and allows Sanjay Kumar (Founding GP) to review audio recordings, transcriptions, and scores through a custom **Admin Dashboard**.

## 📁 Project Structure

```
e:\invest_web/
├── public/
│   ├── css/
│   │   └── style.css            # Custom premium styles & responsive layout
│   ├── images/                  # Folder containing all local image assets
│   │   ├── sanjay_kumar_portrait.png  # Generated high-quality GP headshot
│   │   ├── alexandra_chen_portrait.png
│   │   ├── michael_torres_portrait.png
│   │   ├── sarah_kim_portrait.png
│   │   ├── david_okafor_portrait.png
│   │   ├── elena_rostova_portrait.png
│   │   ├── marcus_aurelius_portrait.png
│   │   ├── startup_workspace.png
│   │   └── startup_meeting.png
│   ├── index.html               # Main landing page for founders (Pitch portal)
│   └── dashboard.html           # Admin Review Portal for Lamnicate GP
├── server.js                    # Express.js backend with AI speech analysis simulation
├── pitches.json                 # JSON Database for storing pitches
└── package.json                 # Project configuration and start scripts
```

## 🚀 Key Features

### 1. Landing Page (`public/index.html`)
- **Premium YC-like Aesthetic**: Warm linen backgrounds, crisp typography, clean monospace tags, and subtle hover interactions.
- **Rotator Headline**: Infinite loop rotator showcasing fund sectors (AI/ML, SaaS, Deep Tech, Climate, Fintech).
- **Core Philosophies**: Includes all copy requested (ticket sizes $50K–$2M, stages Pre-seed to Series A, founder qualities valued).

### 2. Animated Split Investment Thesis Section
- **Dynamic Stats Grid**: Highlights $520M+ Portfolio Value, 50+ Companies Backed, 94% Founder NPS, and 12+ Years Operating.
- **Interactive Counters**: Features a custom scroll-triggered count-up animation that increments stats from 0 to target values once in view.
- **Sectors Grid**: Interactive pill elements with custom SVG icons (AI/ML, SaaS, Fintech, Dev Tools, Deep Tech, Climate, Enterprise, Consumer) that lift and highlight on hover.
- **Investment Cards Grid**: Clean structured cards presenting Investment Stage, Ticket Size, and Founder Qualities with interactive orange accent-line expansions and hover state transitions.

### 3. Voice Pitch Speech Portal (`public/index.html#pitch`)
- **Direct Recording**: Allows founders to record their speech directly using their browser microphone (Web Audio API) or upload an audio file.
- **Real-Time Transcription**: Integrates browser-native Web Speech API (`webkitSpeechRecognition`) to display live transcription as they speak.
- **Dynamic AI Score Generation**: Simulates an investment agent score on Obsession, Speed, Resilience, and Technical Moat based on key pitch attributes.
- **Partner's Initial Speech Review**: Generates dynamic feedback recommendations instantly from Founding GP Sanjay Kumar.

### 4. Dealflow & Review Dashboard (`public/dashboard.html`)
- **Lamnicate's Internal Portal**: Clean internal panel containing deal statistics (Total, Reviewing, Funded, average Match Score).
- **Interactive Workspace**: Select and review submitted applications in real-time.
- **Audio Player**: Listen directly to the uploaded pitch audio.
- **Partner Evaluation Form**: Update application status ("New", "Reviewing", "Contacted", "Funded", "Passed"), save private review notes, or delete applications.

### 5. Express.js Backend (`server.js`)
- Configured with `multer` to handle WAV/MP3 uploads and serve them statically.
- Performs text analysis to determine sector matching and dynamically boost scores for Obsession, Speed, and Resilience.
- Simple, zero-dependency JSON persistence layer (`pitches.json`).

## 🛠️ How to Start the Project

1. Navigate to the project root:
   ```bash
   cd e:\invest_web
   ```
2. Start the Express server:
   ```bash
   npm start
   ```
3. Open your browser:
   - **Founders Portal**: [http://localhost:3005](http://localhost:3005)
   - **Lamnicate Dashboard**: [http://localhost:3005/dashboard.html](http://localhost:3005/dashboard.html)
