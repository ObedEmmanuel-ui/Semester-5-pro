# MproWave Backend API

Laravel REST API for MproWave mobile DAW application with DeepSeek AI and a local Demucs/basic-pitch audio microservice.

## Setup Instructions

### 1. Install Dependencies

```bash
composer install
```

### 2. Environment Configuration

```bash
cp .env.example .env
php artisan key:generate
```

Edit `.env` and configure:
- Database credentials
- DeepSeek API key
- Audio analysis microservice URL (see `../audio-service`)
- Cloud storage settings

### 3. Database Setup

```bash
php artisan migrate
```

### 4. Start Development Server

```bash
php artisan serve
```

API will be available at `http://localhost:8000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout (requires auth)
- `GET /api/auth/user` - Get current user (requires auth)

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project
- `GET /api/projects/{id}` - Get project details
- `PUT /api/projects/{id}` - Update project
- `DELETE /api/projects/{id}` - Delete project
- `POST /api/projects/{id}/duplicate` - Duplicate project

### AI Assistant
- `POST /api/ai/generate-midi` - Generate MIDI patterns
- `POST /api/ai/suggest-harmony` - Analyze audio and suggest harmonies
- `POST /api/ai/generate-drums` - Generate drum patterns
- `POST /api/ai/analyze-audio` - Analyze audio characteristics

### Stems
- `POST /api/stems/separate` - Separate audio into stems
- `GET /api/stems/{job}/status` - Check separation status
- `GET /api/stems/{job}/download` - Download separated stems

## Testing

```bash
php artisan test
```

## License

MIT
