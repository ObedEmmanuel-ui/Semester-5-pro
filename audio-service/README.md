# MproWave Audio Analysis Service

A Python microservice that performs the audio DSP work the Laravel backend
offloads instead of doing in PHP: stem separation via
[Demucs](https://github.com/facebookresearch/demucs) and audio-to-MIDI
transcription via [basic-pitch](https://github.com/spotify/basic-pitch),
with tempo/key estimation via [librosa](https://librosa.org/).

Both Demucs and basic-pitch are free and open-source (MIT / Apache-2.0) —
there's no API key or usage fee, just local compute.

## Setup

```bash
cd audio-service
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
```

`demucs` and `basic-pitch` pull in PyTorch/TensorFlow, so the first
`pip install` will download several hundred MB. The first request to
`/separate-stems` also downloads the pretrained `htdemucs` model
(~80MB) on first use.

## Run

```bash
uvicorn main:app --reload --port 8001
```

Set `AUDIO_SERVICE_URL=http://localhost:8001` in the Laravel backend's
`.env` (this is already the default in `.env.example`).

## Endpoints

- `GET /health` — liveness check
- `POST /audio-to-midi` — multipart `audio_file`; returns detected notes,
  tempo (BPM), estimated key, and duration
- `POST /separate-stems` — multipart `audio_file` + `stems` (comma-separated,
  e.g. `vocals,drums,bass,other`); returns each requested stem as base64 WAV

## Notes

- CPU-only inference works but is slow, especially Demucs on longer tracks.
  For a course demo, keep test clips short (under ~30s).
- A CUDA-capable GPU speeds up both Demucs and basic-pitch significantly if
  available — install the matching CUDA build of PyTorch first.
