# MproWave Mobile App

React Native (Expo managed workflow) mobile application for MproWave AI-assisted DAW.

## Setup

### Prerequisites

- Node.js 18+
- [Expo Go](https://expo.dev/go) installed on your phone (iOS App Store / Google Play)

### Installation

```bash
cd mobile
npm install
```

## Running the App

```bash
npm start
```

This starts the Metro bundler and shows a QR code. Scan it with the Expo Go
app (Android: in-app scanner; iOS: Camera app) to run MproWave on your phone
— no native build or Xcode/Android Studio required.

Alternatively:

```bash
npm run android   # opens in an Android emulator, if configured
npm run web       # runs in a browser
```

**Note on compatibility:** Expo Go only runs projects on the SDK version
your installed Expo Go app supports. If you see "Project is incompatible
with this version of Expo Go", update the Expo Go app from the store, or
check `expo.dependencies.expo` in `package.json` against what your Expo Go
app reports.

## Project Structure

```
mobile/
├── index.ts              # Expo entry point
├── app.json               # Expo app config
├── src/
│   ├── App.tsx            # Root component + navigation
│   ├── screens/           # Screen components
│   ├── services/          # API client + audio engine
│   ├── hooks/             # Recording hook (expo-audio)
│   ├── store/              # State management (Zustand)
│   └── components/        # Reusable components
└── package.json
```

## Key Features

- Multi-track audio recording
- Real-time playback (per-track players, mixed in sync)
- AI-powered composition assistance
- Cloud synchronization
- Stem separation

## Configuration

Update `src/services/api.ts` with your backend API URL:

```typescript
const API_URL = 'YOUR_BACKEND_URL/api';
```

Note: `localhost` won't reach your dev machine from a physical phone running
Expo Go — use your computer's LAN IP (e.g. `http://192.168.1.x:8000/api`)
instead, on the same Wi-Fi network as your backend.

## License

MIT
