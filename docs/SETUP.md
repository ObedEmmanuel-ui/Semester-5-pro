# MproWave Setup Guide

Complete setup guide for the MproWave development environment.

## Prerequisites

### Required Software

1. **Node.js** (v18 or higher)
   - Download from [nodejs.org](https://nodejs.org/)

2. **PHP** (v8.2 or higher)
   - Windows: Use XAMPP or Laragon
   - macOS: `brew install php`
   - Linux: `sudo apt install php8.2`

3. **Composer** (PHP package manager)
   - Download from [getcomposer.org](https://getcomposer.org/)

4. **MySQL** (v8.0 or higher)
   - Included with XAMPP/Laragon
   - Or install standalone

5. **Expo Go app** on your phone
   - Install from the [App Store](https://apps.apple.com/app/expo-go/id982107779) or [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)
   - No Xcode/Android Studio required for development — the mobile app runs via Expo Go

6. **Python** (v3.10 or higher)
   - Required for the audio analysis microservice (Demucs + basic-pitch)
   - Download from [python.org](https://python.org/)

## Backend Setup

### 1. Navigate to Backend Directory

```bash
cd backend
```

### 2. Install Dependencies

```bash
composer install
```

### 3. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` file:

```env
DB_DATABASE=mprowave
DB_USERNAME=root
DB_PASSWORD=your_password

DEEPSEEK_API_KEY=your_deepseek_api_key
AUDIO_SERVICE_URL=http://localhost:8001
```

### 4. Generate Application Key

```bash
php artisan key:generate
```

### 5. Create Database

Create a MySQL database named `mprowave`:

```sql
CREATE DATABASE mprowave CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 6. Run Migrations

```bash
php artisan migrate
```

### 7. Create Storage Link

```bash
php artisan storage:link
```

### 8. Start Development Server

```bash
php artisan serve
```

Backend will run at `http://localhost:8000`

## Mobile App Setup

### 1. Navigate to Mobile Directory

```bash
cd mobile
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Update API Configuration

Edit `mobile/src/services/api.ts`. If you're running on a physical phone via
Expo Go, `localhost` won't reach your dev machine — use your computer's LAN
IP instead:

```typescript
const API_URL = 'http://192.168.1.x:8000/api'; // Your machine's LAN IP, for Expo Go on a phone
// const API_URL = 'http://localhost:8000/api'; // For an emulator/simulator on the same machine
// const API_URL = 'https://your-production-url.com/api'; // For production
```

### 4. Run the App

```bash
npm start
```

Scan the QR code with the [Expo Go](https://expo.dev/go) app (install it
from the App Store / Play Store first) to run MproWave on your phone — no
Xcode or Android Studio needed. If Expo Go reports the project is
incompatible, update the Expo Go app; it only supports the SDK version
pinned in `mobile/package.json` (`expo` dependency).

## DeepSeek AI Setup

### 1. Get API Key

1. Visit [DeepSeek Platform](https://platform.deepseek.com/)
2. Create an account and generate an API key
3. Copy the key

### 2. Configure Backend

Add to `backend/.env`:

```env
DEEPSEEK_API_KEY=your_api_key_here
DEEPSEEK_API_URL=https://api.deepseek.com
```

DeepSeek's API is text-only (no audio input), so it's used for the
text-based AI suggestions (MIDI patterns, harmony, drum patterns). Audio
work is handled by the separate audio analysis microservice below.

## Audio Analysis Service Setup (Demucs + basic-pitch)

This is a separate Python microservice that performs stem separation and
audio-to-MIDI transcription — free, open-source, no API key required.

### 1. Install Dependencies

```bash
cd audio-service
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

`demucs` and `basic-pitch` pull in PyTorch/TensorFlow, so this first
install downloads several hundred MB.

### 2. Run the Service

```bash
uvicorn main:app --reload --port 8001
```

### 3. Configure Backend

Add to `backend/.env`:

```env
AUDIO_SERVICE_URL=http://localhost:8001
```

See [audio-service/README.md](../audio-service/README.md) for details.

## Cloud Storage Setup (Optional)

For production deployment with AWS S3:

### 1. Update .env

```env
FILESYSTEM_DISK=s3
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=your-bucket-name
```

### 2. Install AWS SDK

```bash
composer require league/flysystem-aws-s3-v3
```

## Testing the Installation

### 1. Test Backend API

```bash
curl http://localhost:8000/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "MproWave API",
  "version": "1.0.0"
}
```

### 2. Test Mobile App

1. Open the app on emulator/device
2. Register a new account
3. Create a new project
4. Verify multi-track interface loads

## Troubleshooting

### Backend Issues

**Port already in use:**
```bash
php artisan serve --port=8001
```

**Database connection error:**
- Verify MySQL is running
- Check database credentials in `.env`

**Storage permission error:**
```bash
chmod -R 775 storage bootstrap/cache
```

### Mobile Issues

**Metro bundler not starting:**
```bash
npm start -- --reset-cache
```

**"Project is incompatible with this version of Expo Go":**
- Update the Expo Go app from the App Store / Play Store, or
- Check the `expo` version in `mobile/package.json` against what your
  installed Expo Go app supports, and align them

**App can't reach the backend from a physical phone:**
- `localhost` in `mobile/src/services/api.ts` only works for an
  emulator/simulator on the same machine as the backend
- Use your computer's LAN IP instead, and make sure your phone is on the
  same Wi-Fi network

## Next Steps

1. Review [API Documentation](API.md)
2. Explore the codebase
3. Set up your development workflow
4. Start building features

## Support

For issues and questions:
- Check existing documentation
- Review error logs in `backend/storage/logs`
- Check React Native debugger console
