# MproWave: AI-Assisted Mobile Digital Audio Workstation

An intelligent mobile DAW built with React Native, DeepSeek AI, and a local Demucs/basic-pitch audio microservice that bridges real-time multi-track recording with interactive AI co-creation.

## Features

- 🎵 Multi-track audio recording and editing
- 🤖 DeepSeek-powered MIDI generation, harmony suggestions, and drum patterns
- 🎚️ Real, open-source stem separation (Demucs) and audio-to-MIDI transcription (basic-pitch)
- ☁️ Cloud-offloaded audio processing for optimal mobile performance
- 🎹 Real-time AI composition suggestions
- 📱 Cross-platform mobile support (iOS & Android)

## Technology Stack

- **Mobile Frontend**: React Native (TypeScript), Expo managed workflow — runs in the Expo Go app, no native build required
- **Backend API**: Laravel 11 (PHP 8.x)
- **Database**: MySQL
- **AI Engine**: DeepSeek API (text-based suggestions) + local Demucs/basic-pitch microservice (audio DSP)
- **Cloud Storage**: AWS S3 / Compatible storage

## Project Structure

```
mprowave/
├── mobile/          # React Native mobile application
├── backend/         # Laravel REST API
├── audio-service/   # Python microservice (Demucs stem separation + basic-pitch audio-to-MIDI)
└── docs/           # Documentation
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PHP 8.2+
- Composer
- MySQL 8.0+
- Python 3.10+ (for the audio analysis microservice)
- [Expo Go](https://expo.dev/go) app on your phone (no Xcode/Android Studio needed)

### Installation

See [docs/SETUP.md](docs/SETUP.md) for the full setup guide, and
[docs/API.md](docs/API.md) for the REST API reference. In short:

```bash
# Backend (Laravel API)
cd backend
composer install
php artisan migrate
php artisan storage:link
php artisan serve --host=0.0.0.0 --port=8000

# Mobile app (Expo)
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go. Since a physical phone can't reach
`localhost` on your dev machine, `mobile/src/services/api.ts` resolves the
API host automatically from the address Expo used to serve the JS bundle —
no manual IP editing needed as long as your phone and computer are on the
same Wi-Fi network.

The optional audio microservice (Demucs stem separation + basic-pitch
transcription) lives in `audio-service/` — see its own
[README](audio-service/README.md) for setup; it pulls in PyTorch, so the
first install is large.

## License

MIT License
