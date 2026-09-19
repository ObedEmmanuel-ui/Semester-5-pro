"""
MproWave Audio Analysis Service

A small FastAPI microservice that does the audio DSP work DeepSeek's
text-only API can't: stem separation (Demucs) and audio-to-MIDI
transcription with tempo/key estimation (basic-pitch + librosa).

The Laravel backend calls this service over HTTP instead of embedding
these heavy ML dependencies in the PHP process.
"""

import base64
import os
import re
import shutil
import subprocess
import sys
import tempfile
from typing import List, Optional

import static_ffmpeg
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# A "shared" FFmpeg build (ships avcodec/avformat/avutil/... DLLs alongside
# ffmpeg.exe/ffprobe.exe) rather than a statically-linked one. demucs shells
# out to "ffmpeg"/"ffprobe" by name to read/decode audio, but *saving* the
# separated output goes through torchaudio's torchcodec backend, which
# dynamically loads the real FFmpeg shared libraries at runtime — a static
# build (e.g. static-ffmpeg's) satisfies the first need but not the second.
# Windows has no system FFmpeg to fall back on, so we fetch this once and
# cache it locally; other platforms typically already have a real FFmpeg
# install, so static-ffmpeg's simpler static build is fine there.
_FFMPEG_SHARED_URL = (
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/"
    "ffmpeg-master-latest-win64-gpl-shared.zip"
)
_FFMPEG_SHARED_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ffmpeg-shared")


def _find_shared_ffmpeg_bin_dir():
    if not os.path.isdir(_FFMPEG_SHARED_DIR):
        return None
    for name in os.listdir(_FFMPEG_SHARED_DIR):
        bin_dir = os.path.join(_FFMPEG_SHARED_DIR, name, "bin")
        if os.path.exists(os.path.join(bin_dir, "ffmpeg.exe")):
            return bin_dir
    return None


def _fetch_shared_ffmpeg_bin_dir():
    import urllib.request
    import zipfile

    os.makedirs(_FFMPEG_SHARED_DIR, exist_ok=True)
    zip_path = os.path.join(_FFMPEG_SHARED_DIR, "ffmpeg-shared.zip")
    try:
        urllib.request.urlretrieve(_FFMPEG_SHARED_URL, zip_path)
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(_FFMPEG_SHARED_DIR)
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)
    return _find_shared_ffmpeg_bin_dir()


def _ensure_ffmpeg_on_path():
    if os.name == "nt":
        bin_dir = _find_shared_ffmpeg_bin_dir()
        if bin_dir is None:
            try:
                bin_dir = _fetch_shared_ffmpeg_bin_dir()
            except Exception:
                bin_dir = None
        if bin_dir:
            os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
            return

    # Non-Windows, or the shared-build fetch above failed: fall back to
    # static-ffmpeg's statically-linked binaries (covers demucs's own
    # ffmpeg/ffprobe calls even if torchcodec's save step still can't
    # find shared libraries).
    static_ffmpeg.add_paths()


_ensure_ffmpeg_on_path()

# These two capabilities have different Python requirements, so they're
# tracked and imported independently:
#   - librosa (tempo/key detection, duration) works fine on any modern
#     Python, including 3.13 — numba/llvmlite caught up to 3.13 support
#     since this split was first written.
#   - basic-pitch (note-by-note transcription) still needs Python 3.10/3.11
#     specifically — its TensorFlow pin has no build for newer Python.
# So /audio-to-midi now degrades gracefully: with only librosa installed it
# still returns real tempo/key/duration for the recording (just no
# note-level transcription), instead of refusing the request outright.
try:
    import librosa

    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False

try:
    from basic_pitch import ICASSP_2022_MODEL_PATH
    from basic_pitch.inference import predict

    BASIC_PITCH_AVAILABLE = True
except ImportError:
    BASIC_PITCH_AVAILABLE = False

# Lyrics-to-Song vocal rendering: a real singing voice built by running each
# word through a neural TTS voice, then pitch- and time-shifting that word's
# audio to land on the melody note the song generator assigned it. Piper
# (VITS-based, ONNX runtime) replaced the earlier Windows-SAPI5/pyttsx3
# engine here — SAPI5's classic formant synthesis sounded audibly robotic no
# matter how the pitch/timing post-processing below was tuned; Piper is a
# real neural vocoder and sounds like an actual human voice, runs fast on
# CPU alone (no GPU needed), and is cross-platform, so this feature is no
# longer Windows-only.
try:
    import numpy as np
    import pyworld as pw
    import scipy.signal
    import soundfile as sf
    from piper.config import SynthesisConfig
    from piper.voice import PiperVoice

    TTS_AVAILABLE = LIBROSA_AVAILABLE
except ImportError:
    TTS_AVAILABLE = False

_PIPER_VOICE_NAME = "en_US-lessac-medium"
_PIPER_VOICES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "piper_voices")
_piper_voice = None


def _ensure_piper_voice() -> "PiperVoice":
    """Loads (and caches) the Piper neural voice model, downloading it on
    first use if it isn't already present — mirrors the FFmpeg
    auto-fetch pattern above so a fresh checkout of this service doesn't
    need a manual setup step.
    """
    global _piper_voice
    if _piper_voice is not None:
        return _piper_voice

    model_path = os.path.join(_PIPER_VOICES_DIR, f"{_PIPER_VOICE_NAME}.onnx")
    if not os.path.exists(model_path):
        from pathlib import Path

        from piper.download_voices import download_voice

        os.makedirs(_PIPER_VOICES_DIR, exist_ok=True)
        download_voice(_PIPER_VOICE_NAME, Path(_PIPER_VOICES_DIR))

    _piper_voice = PiperVoice.load(model_path)
    return _piper_voice


def _synthesize_speech(voice: "PiperVoice", syn_config: "SynthesisConfig", text: str) -> "tuple[np.ndarray, int]":
    """Runs Piper on one short phrase and returns float32 PCM samples
    directly in memory. Unlike the old SAPI5 pipeline — which had to
    batch every word's save_to_file() call and flush them all with one
    runAndWait() to avoid COM engine reinit overhead — Piper's ONNX
    session is already loaded once (see _ensure_piper_voice) and each
    call here is just a forward pass, so words can be synthesized one at
    a time with no file I/O at all.
    """
    chunks = list(voice.synthesize(text, syn_config=syn_config))
    if not chunks:
        return np.zeros(1, dtype=np.float32), voice.config.sample_rate
    audio = np.concatenate([c.audio_float_array for c in chunks]).astype(np.float32)
    return audio, chunks[0].sample_rate

app = FastAPI(title="MproWave Audio Analysis Service")

KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


@app.get("/health")
def health():
    return {
        "status": "ok",
        "features": {
            "stem_separation": True,
            "audio_to_midi": BASIC_PITCH_AVAILABLE,
            "tempo_key_detection": LIBROSA_AVAILABLE,
            "song_vocal_synthesis": TTS_AVAILABLE,
        },
    }


@app.post("/audio-to-midi")
async def audio_to_midi(audio_file: UploadFile = File(...)):
    if not LIBROSA_AVAILABLE:
        return JSONResponse(
            status_code=501,
            content={
                "error": "Audio analysis isn't installed on this service. "
                         "Install requirements-midi.txt."
            },
        )

    suffix = os.path.splitext(audio_file.filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio_file.read())
        tmp_path = tmp.name

    try:
        y, sr = librosa.load(tmp_path, sr=None, mono=True)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        tempo_bpm = float(tempo[0]) if hasattr(tempo, "__len__") else float(tempo)

        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        estimated_key = KEYS[int(chroma.mean(axis=1).argmax())]

        notes = []
        if BASIC_PITCH_AVAILABLE:
            _, _, note_events = predict(tmp_path, ICASSP_2022_MODEL_PATH)
            notes = [
                {
                    "start": round(float(note[0]), 3),
                    "end": round(float(note[1]), 3),
                    "pitch": int(note[2]),
                    "amplitude": round(float(note[3]), 3) if len(note) > 3 else None,
                }
                for note in note_events
            ]

        return {
            "notes": notes,
            "tempo_bpm": round(tempo_bpm, 1),
            "estimated_key": estimated_key,
            "duration_sec": round(float(librosa.get_duration(y=y, sr=sr)), 2),
        }
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": str(exc)})
    finally:
        os.remove(tmp_path)


@app.post("/separate-stems")
async def separate_stems(
    audio_file: UploadFile = File(...),
    stems: str = Form("vocals,drums,bass,other"),
):
    requested = {s.strip() for s in stems.split(",") if s.strip()}
    work_dir = tempfile.mkdtemp()

    try:
        input_path = os.path.join(work_dir, audio_file.filename)
        with open(input_path, "wb") as f:
            f.write(await audio_file.read())

        # Invoke via "python -m demucs" (rather than the "demucs" console
        # script) so it resolves correctly regardless of whether this
        # process's PATH includes the venv's Scripts/bin directory.
        #
        # -j splits the work across every CPU core instead of running
        # single-threaded (there's no GPU on this machine, so this is the
        # only real lever available); --shifts 0 skips Demucs's optional
        # multi-pass quality mode (each additional shift re-runs inference
        # entirely, multiplying runtime) — 0 is already the CLI's own
        # default, set explicitly so a future Demucs version changing that
        # default can't silently slow every request back down.
        subprocess.run(
            [
                sys.executable, "-m", "demucs",
                "-n", "htdemucs",
                "-j", str(os.cpu_count() or 1),
                "--shifts", "0",
                "-o", work_dir,
                input_path,
            ],
            check=True,
            capture_output=True,
        )

        track_name = os.path.splitext(os.path.basename(input_path))[0]
        stem_dir = os.path.join(work_dir, "htdemucs", track_name)

        result = {}
        for stem_file in os.listdir(stem_dir):
            name = os.path.splitext(stem_file)[0]
            if name in requested:
                with open(os.path.join(stem_dir, stem_file), "rb") as sf:
                    result[name] = base64.b64encode(sf.read()).decode("utf-8")

        return {"stems": result}
    except subprocess.CalledProcessError as exc:
        details = (exc.stdout or b"").decode(errors="ignore") + (exc.stderr or b"").decode(errors="ignore")
        return JSONResponse(
            status_code=500,
            content={"error": "Demucs failed", "details": details},
        )
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": str(exc)})
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


# --- Lyrics-to-Song vocal + beat rendering -----------------------------


class MelodyNoteIn(BaseModel):
    note: str = "C4"
    start: float = 0.0
    duration: float = 0.5
    word: str = ""


class DrumPatternIn(BaseModel):
    kick: List[int] = []
    snare: List[int] = []
    hihat: List[int] = []
    clap: List[int] = []


class SongAudioRequest(BaseModel):
    melody: List[MelodyNoteIn]
    drum_pattern: DrumPatternIn
    bpm: float = 100.0


def _note_name_to_midi(name: str) -> int:
    match = re.match(r"^([A-Ga-g])(#|b)?(-?\d+)$", (name or "C4").strip())
    if not match:
        return 60
    letter, accidental, octave = match.groups()
    pitch_class = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}[letter.upper()]
    if accidental == "#":
        pitch_class += 1
    elif accidental == "b":
        pitch_class -= 1
    return (int(octave) + 1) * 12 + pitch_class


def _estimate_pitch_hz(y: "np.ndarray", sr: int, fmin: float = 70.0, fmax: float = 350.0) -> float:
    """Fast, dependency-free pitch estimate via lag-restricted autocorrelation.

    librosa's pyin/yin are far more accurate but pay a one-time ~90s numba
    JIT-warmup the first time they run in a process, and stay in the
    single-digit seconds per call even warm — fine once, ruinous across
    100+ words in a song. Plain autocorrelation over just the plausible
    voice pitch range runs in well under a millisecond and is accurate
    enough for this feature's actual bar: does the word land roughly on
    the right note, not lab-grade pitch tracking.
    """
    y = y.astype(np.float64) - float(np.mean(y))
    if np.max(np.abs(y)) < 1e-4:
        return 150.0

    min_lag = max(1, int(sr / fmax))
    max_lag = min(int(sr / fmin), len(y) - 1)
    if min_lag >= max_lag:
        return 150.0

    best_lag, best_val = min_lag, -np.inf
    for lag in range(min_lag, max_lag):
        val = np.dot(y[:-lag], y[lag:])
        if val > best_val:
            best_val, best_lag = val, lag

    return sr / best_lag if best_lag > 0 else 150.0


def _world_pitch_shift(
    y: "np.ndarray",
    sr: int,
    ratio_start: float,
    ratio_end: float,
    glide_seconds: float = 0.05,
    vibrato: bool = False,
) -> "np.ndarray":
    """Formant-preserving pitch shift via the WORLD vocoder.

    Naively resampling ("tape speed") to change pitch drags the formants
    (the resonances that make a vowel sound like that vowel, and largely
    what makes a word recognizable) along with the pitch — shift a voice
    up by even a few semitones this way and it stops sounding like the
    intended word. WORLD decomposes speech into pitch (F0), spectral
    envelope (the formants), and aperiodicity; scaling only the F0 curve
    and resynthesizing from the *original* envelope changes the note
    without dragging the word's identity with it.

    ratio_start/ratio_end let the shift glide from one pitch to another
    instead of snapping instantly: real singers slide (portamento) into a
    note rather than jumping to it, and an instantly-snapped, perfectly
    flat pitch is itself a strong "robotic" cue independent of how good
    the underlying voice sounds. When vibrato is set, a subtle sinusoidal
    wobble is layered on top of the held portion (after the glide
    settles) for the same reason — real sustained notes waver slightly;
    a dead-steady one doesn't.
    """
    if ratio_end <= 0 or len(y) < int(sr * 0.03):
        return y
    try:
        y64 = np.ascontiguousarray(y.astype(np.float64))
        _f0, t = pw.dio(y64, sr)
        f0 = pw.stonemask(y64, _f0, t, sr)
        sp = pw.cheaptrick(y64, f0, t, sr)
        ap = pw.d4c(y64, f0, t, sr)

        n_frames = len(f0)
        if n_frames == 0:
            return y
        frame_period = float(t[1] - t[0]) if n_frames > 1 else 0.005
        glide_frames = min(n_frames, max(1, int(round(glide_seconds / frame_period))))

        if abs(ratio_start - ratio_end) < 1e-6:
            ratio_curve = np.full(n_frames, ratio_end, dtype=np.float64)
        else:
            ramp = np.linspace(ratio_start, ratio_end, glide_frames)
            hold = np.full(max(0, n_frames - glide_frames), ratio_end)
            ratio_curve = np.concatenate([ramp, hold])[:n_frames]

        if vibrato:
            hold_from = glide_frames
            # Only worth adding once there's a real sustain to wobble —
            # otherwise this is just noise on a note too short to hold.
            if n_frames - hold_from > int(round(0.08 / frame_period)):
                hold_t = np.arange(n_frames - hold_from) * frame_period
                wobble = 1.0 + 0.012 * np.sin(2 * np.pi * 5.5 * hold_t)
                ratio_curve[hold_from:] *= wobble

        resynthesized = pw.synthesize(f0 * ratio_curve, sp, ap, sr)
        return resynthesized.astype(np.float32)
    except Exception:
        return y


def _safe_time_stretch(y: "np.ndarray", rate: float) -> "np.ndarray":
    """librosa.effects.time_stretch with an n_fft sized to the clip.

    These clips are often much shorter than librosa's default n_fft
    (2048 samples) — single syllables, or the small "core"/"edge" slices
    _stretch_preserving_edges splits a word into — which otherwise just
    logs a UserWarning on every single word of every song.
    """
    if len(y) < 32:
        return y
    n_fft = min(2048, 1 << max(5, int(np.log2(len(y)))))
    try:
        return librosa.effects.time_stretch(y=y, rate=rate, n_fft=n_fft, hop_length=n_fft // 4)
    except Exception:
        return y


def _nearest_octave_midi(target_midi: int, reference_midi: float, max_semitones: float = 6.0) -> int:
    """Moves target_midi by whole octaves until it's within max_semitones
    of reference_midi — keeps the melody's up/down shape (pitch class,
    roughly) while bounding how far any single word actually gets shifted
    from the voice's natural register. Shifting spoken word audio by a
    full octave or more doesn't just sound bad, it actively destroys the
    consonants/formants that make it recognizable as the intended word —
    this is the fix for that, at the cost of not hitting every note's
    literal absolute pitch.
    """
    while target_midi - reference_midi > max_semitones:
        target_midi -= 12
    while reference_midi - target_midi > max_semitones:
        target_midi += 12
    return target_midi


def _fit_word_clip(
    y: "np.ndarray",
    sr: int,
    target_midi: int,
    target_duration: float,
    reference_midi: float,
    prev_ratio: "Optional[float]" = None,
) -> "tuple[np.ndarray, float]":
    """Pitch- and time-shifts one TTS word clip to land on a melody note.

    Every TTS engine pads a synthesized utterance with a bit of leading/
    trailing silence — left in, that silence gets measured as if it were
    part of the word, throwing off every downstream duration/rate
    calculation (this was the actual cause of song vocals coming out oddly
    slow back when SAPI's much larger padding — up to half a second-plus —
    went untrimmed). Trimmed first, then re-pitched only as far as it can
    go while staying recognizable as speech (octave-wrapped toward
    the voice's own calibrated register — see _nearest_octave_midi) via
    the formant-preserving WORLD shift — gliding in from prev_ratio (the
    previous word's landed pitch) instead of snapping instantly, and
    adding subtle vibrato on notes long enough to hold one — then gently
    time-stretched toward the note's duration plus a short legato tail so
    consecutive words crossfade into each other in the mix instead of
    cutting hard.

    Returns the clip and the pitch ratio actually used, so the caller can
    pass it back in as the next word's prev_ratio and keep the glide
    continuous across the whole phrase.
    """
    target_duration = max(0.08, target_duration)
    # The tail overlaps into the next word once both are additively mixed
    # into the shared vocal buffer — this is what turns choppy word-by-word
    # playback into something that reads as one continuous phrase.
    legato_tail = min(0.05, target_duration * 0.25)
    render_duration = target_duration + legato_tail
    target_len = int(round(render_duration * sr))

    try:
        y, _ = librosa.effects.trim(y, top_db=30)
    except Exception:
        pass

    if len(y) < int(sr * 0.02):
        return np.zeros(target_len, dtype=np.float32), (prev_ratio if prev_ratio is not None else 1.0)

    # A/B listening across several processing stages (raw vs. WORLD-identity
    # vs. WORLD-with-a-real-pitch-shift vs. vibrato-only) pointed at the
    # actual pitch-correction itself as the dominant "robotic" cue — WORLD's
    # resynthesis stays natural-sounding when it isn't being asked to move
    # the pitch much, but a several-semitone correction audibly vocodes the
    # voice even with formants preserved. So the bound here is deliberately
    # tight (±3 semitones, half the old ±6) and shifts smaller than a
    # semitone are skipped entirely rather than "corrected" — trading exact
    # note accuracy for a voice that still sounds like a person. Vibrato,
    # confirmed to sound more natural rather than less, is kept unconditional.
    bounded_midi = _nearest_octave_midi(target_midi, reference_midi, max_semitones=3.0)
    n_steps = bounded_midi - reference_midi
    ratio = float(np.clip(2.0 ** (n_steps / 12.0), 0.84, 1.19)) if abs(n_steps) >= 1.0 else 1.0
    glide_from = prev_ratio if prev_ratio is not None else ratio
    shifted = _world_pitch_shift(y, sr, glide_from, ratio, vibrato=render_duration >= 0.35)

    current_duration = len(shifted) / sr
    # A gentle nudge, not a forced fit — landing slightly off the exact
    # beat but still sounding like the actual word is the right trade.
    rate = float(np.clip(current_duration / render_duration, 0.6, 1.8)) if current_duration > 0 else 1.0
    stretched = _safe_time_stretch(shifted, rate)

    out = np.zeros(target_len, dtype=np.float32)
    out[: min(target_len, len(stretched))] = stretched[: min(target_len, len(stretched))]

    fade_in = min(int(sr * 0.012), max(1, target_len // 4))
    fade_out = min(int(sr * (0.012 + legato_tail)), target_len - fade_in)
    out[:fade_in] *= np.linspace(0.0, 1.0, fade_in, dtype=np.float32)
    if fade_out > 0:
        out[-fade_out:] *= np.linspace(1.0, 0.0, fade_out, dtype=np.float32)
    return out, ratio


def _drum_kick(sr: int) -> "np.ndarray":
    dur = 0.18
    t = np.linspace(0, dur, int(sr * dur), endpoint=False)
    freq = np.linspace(150, 40, len(t))
    phase = 2 * np.pi * np.cumsum(freq) / sr
    return (np.sin(phase) * np.exp(-t * 18) * 0.9).astype(np.float32)


def _drum_snare(sr: int) -> "np.ndarray":
    dur = 0.15
    n = int(sr * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    noise = np.random.uniform(-1, 1, n)
    tone = np.sin(2 * np.pi * 180 * t)
    env = np.exp(-t * 22)
    return ((noise * 0.6 + tone * 0.4) * env * 0.8).astype(np.float32)


def _drum_hihat(sr: int) -> "np.ndarray":
    dur = 0.06
    n = int(sr * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    noise = np.random.uniform(-1, 1, n)
    smoothed = np.convolve(noise, np.ones(5) / 5, mode="same")
    return ((noise - smoothed) * np.exp(-t * 60) * 0.6).astype(np.float32)


def _drum_clap(sr: int) -> "np.ndarray":
    dur = 0.12
    n = int(sr * dur)
    out = np.zeros(n, dtype=np.float32)
    for offset in (0.0, 0.01, 0.02):
        start = int(offset * sr)
        if start >= n:
            continue
        seg_len = n - start
        t = np.linspace(0, seg_len / sr, seg_len, endpoint=False)
        out[start:] += np.random.uniform(-1, 1, seg_len) * np.exp(-t * 40) * 0.5
    return np.clip(out, -1, 1).astype(np.float32)


_DRUM_VOICE_SYNTH = {"kick": _drum_kick, "snare": _drum_snare, "hihat": _drum_hihat, "clap": _drum_clap}


def _render_beat_audio(pattern: dict, bpm: float, total_seconds: float, sr: int) -> "np.ndarray":
    sec_per_beat = 60.0 / max(1.0, bpm)
    step_dur = sec_per_beat / 4.0
    bar_len = max(1, int(round(step_dur * 16 * sr)))
    bar = np.zeros(bar_len, dtype=np.float32)
    samples = {name: fn(sr) for name, fn in _DRUM_VOICE_SYNTH.items()}

    for voice, steps in pattern.items():
        sample = samples.get(voice)
        if sample is None or not steps:
            continue
        for i, hit in enumerate(steps[:16]):
            if not hit:
                continue
            start = int(round(i * step_dur * sr))
            end = min(bar_len, start + len(sample))
            if end > start:
                bar[start:end] += sample[: end - start]

    total_len = max(bar_len, int(round(total_seconds * sr)))
    reps = int(np.ceil(total_len / bar_len))
    full = np.tile(bar, reps)[:total_len]
    peak = float(np.max(np.abs(full))) if len(full) else 0.0
    return full / peak if peak > 1.0 else full


def _apply_reverb(y: "np.ndarray", sr: int, wet: float = 0.05, tail_seconds: float = 0.5) -> "np.ndarray":
    """A cheap convolution reverb — an exponentially-decaying noise burst
    as the impulse response — to take the "recorded in a dry vacuum" edge
    off raw TTS. FFT convolution keeps this fast even for a full song.

    Kept very subtle on purpose: this audio is already working hard to
    stay intelligible after pitch-shifting, and reverb smears word
    boundaries together — more "polish" here directly fights the actual
    priority, which is that the words remain recognizable as words.
    """
    if len(y) == 0:
        return y
    ir_len = max(1, int(sr * tail_seconds))
    t = np.linspace(0, tail_seconds, ir_len, endpoint=False)
    rng = np.random.default_rng(7)
    impulse = rng.standard_normal(ir_len).astype(np.float32) * np.exp(-t * 4.5).astype(np.float32)
    impulse[0] = 1.0
    impulse /= np.max(np.abs(impulse))

    wet_signal = scipy.signal.fftconvolve(y, impulse)[: len(y)]
    wet_peak = float(np.max(np.abs(wet_signal))) if len(wet_signal) else 0.0
    if wet_peak > 1e-6:
        wet_signal = wet_signal * (float(np.max(np.abs(y))) / wet_peak)

    return ((1.0 - wet) * y + wet * wet_signal).astype(np.float32)


def _apply_presence_eq(y: "np.ndarray", sr: int) -> "np.ndarray":
    """A gentle low-cut (removes sub-100Hz rumble the TTS voice never
    actually uses) plus a high-shelf lift around 4kHz for clarity/"air" —
    the difference between a vocal that sounds boxy/muffled and one that
    sounds present in the mix.
    """
    if len(y) < 64:
        return y
    sos_hp = scipy.signal.butter(2, 90, btype="highpass", fs=sr, output="sos")
    y = scipy.signal.sosfilt(sos_hp, y).astype(np.float32)

    sos_shelf = scipy.signal.butter(2, 4000, btype="highpass", fs=sr, output="sos")
    presence = scipy.signal.sosfilt(sos_shelf, y).astype(np.float32)
    return (y + 0.35 * presence).astype(np.float32)


def _soft_limit(y: "np.ndarray", target_peak: float = 0.85) -> "np.ndarray":
    """Normalizes to a headroom-safe peak, then a gentle tanh soft-knee so
    the loudest transients round off instead of hard-clipping — cheap
    mastering-bus glue rather than a real multiband limiter.
    """
    if len(y) == 0:
        return y
    peak = float(np.max(np.abs(y)))
    if peak > 1e-6:
        y = y * (target_peak / peak)
    return np.tanh(y * 1.15).astype(np.float32)


@app.post("/generate-song-audio")
async def generate_song_audio(req: SongAudioRequest):
    if not TTS_AVAILABLE:
        return JSONResponse(
            status_code=501,
            content={"error": "Vocal synthesis needs the Piper TTS package, which isn't available on this service."},
        )
    if not req.melody:
        return JSONResponse(status_code=400, content={"error": "melody is required"})

    work_dir = tempfile.mkdtemp()
    sr = 22050
    sec_per_beat = 60.0 / max(1.0, req.bpm)

    try:
        total_seconds = max((n.start + n.duration) * sec_per_beat for n in req.melody) + 1.0

        voice = _ensure_piper_voice()
        # length_scale < 1 speaks faster than Piper's default pace — mirrors
        # the old pipeline's SAPI rate bump, keeping delivery closer to a
        # natural conversational/singing tempo rather than Piper's default
        # (which reads a little deliberately for short, isolated words).
        syn_config = SynthesisConfig(length_scale=0.9)

        # A longer, stable phrase gives a far more reliable pitch estimate
        # than any single short/consonant-heavy word would — this is
        # measured once and used as the "natural register" every word's
        # shift is bounded relative to, instead of re-estimating (noisily)
        # per word.
        reference_midi = 55.0  # G3 — a reasonable fallback if calibration fails
        try:
            cal_y, cal_sr = _synthesize_speech(voice, syn_config, "testing one two three four five")
            if cal_sr != sr:
                cal_y = librosa.resample(cal_y, orig_sr=cal_sr, target_sr=sr)
            cal_f0 = _estimate_pitch_hz(cal_y, sr)
            reference_midi = 69.0 + 12.0 * float(np.log2(cal_f0 / 440.0))
        except Exception:
            pass

        vocal_buf = np.zeros(int(round(total_seconds * sr)) + sr, dtype=np.float32)
        # Tracks the previous word's landed pitch ratio so each new word's
        # WORLD shift can glide in from it (portamento) instead of
        # snapping instantly — reset to None across a real pause (a
        # breath) so a note after a rest attacks cleanly rather than
        # sliding in from a phrase sung several seconds earlier.
        prev_ratio: "Optional[float]" = None
        prev_note_end_beat = None
        for note in req.melody:
            if prev_note_end_beat is not None:
                gap_seconds = (note.start - prev_note_end_beat) * sec_per_beat
                if gap_seconds > 0.3:
                    prev_ratio = None
            prev_note_end_beat = note.start + note.duration

            # Punctuation is meant to become a timing gap upstream (see
            # DeepSeekAIService), not literal text — a stray trailing
            # comma/period reaching the TTS engine would just get spoken
            # aloud as part of a lone one-word utterance. Stripped here too
            # as a last line of defense regardless of where the word came
            # from.
            text = (note.word or "la").strip(" ,.;:!?\"'") or "la"
            try:
                y, file_sr = _synthesize_speech(voice, syn_config, text)
            except Exception:
                continue
            if file_sr != sr:
                y = librosa.resample(y, orig_sr=file_sr, target_sr=sr)

            clip, prev_ratio = _fit_word_clip(
                y, sr, _note_name_to_midi(note.note), note.duration * sec_per_beat, reference_midi, prev_ratio
            )
            start_sample = int(round(note.start * sec_per_beat * sr))
            end_sample = min(len(vocal_buf), start_sample + len(clip))
            if end_sample > start_sample:
                vocal_buf[start_sample:end_sample] += clip[: end_sample - start_sample]

        # Polish pass: EQ for presence/clarity, a touch of reverb so the
        # TTS voice doesn't sound like it's singing into a dead room, then
        # a limiter so the mix sits at a consistent, headroom-safe level.
        vocal_buf = _apply_presence_eq(vocal_buf, sr)
        vocal_buf = _apply_reverb(vocal_buf, sr)
        vocal_buf = _soft_limit(vocal_buf, target_peak=0.85)

        beat_buf = _render_beat_audio(req.drum_pattern.model_dump(), req.bpm, total_seconds, sr)
        beat_buf = _soft_limit(beat_buf, target_peak=0.9)

        out_sr = 44100
        vocal_final = librosa.resample(vocal_buf, orig_sr=sr, target_sr=out_sr)
        beat_final = librosa.resample(beat_buf, orig_sr=sr, target_sr=out_sr)

        vocals_path = os.path.join(work_dir, "vocals_out.wav")
        beat_path = os.path.join(work_dir, "beat_out.wav")
        sf.write(vocals_path, vocal_final, out_sr, subtype="PCM_16")
        sf.write(beat_path, beat_final, out_sr, subtype="PCM_16")

        with open(vocals_path, "rb") as f:
            vocals_b64 = base64.b64encode(f.read()).decode("utf-8")
        with open(beat_path, "rb") as f:
            beat_b64 = base64.b64encode(f.read()).decode("utf-8")

        return {
            "vocals_wav_b64": vocals_b64,
            "beat_wav_b64": beat_b64,
            "duration_sec": round(total_seconds, 2),
        }
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": str(exc)})
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


# --- Project export / bounce-to-audio ----------------------------------


# The mobile app plays instrument/midi tracks by pitch-shifting one of
# these five bundled one-shot samples via playback rate rather than
# synthesizing from scratch — reusing the exact same samples here (instead
# of separately synthesizing similar-but-different tones in Python) is
# what makes an exported mix actually sound like what the app played.
_INSTRUMENT_SAMPLES_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "mobile", "assets", "instruments"
)
_INSTRUMENT_REFERENCE_MIDI = {"piano": 60, "bass": 36, "guitar": 48, "synth": 60, "strings": 60}
_INSTRUMENT_KEYWORDS = [("piano", "piano"), ("bass", "bass"), ("guitar", "guitar"), ("strings", "string"), ("synth", "synth")]


def _guess_instrument_from_name(name: str) -> str:
    lower = (name or "").lower()
    for instrument, keyword in _INSTRUMENT_KEYWORDS:
        if keyword in lower:
            return instrument
    return "synth"


_instrument_sample_cache: dict = {}


def _load_instrument_sample(instrument: str, sr: int) -> "np.ndarray":
    if instrument in _instrument_sample_cache:
        cached_sr, cached_y = _instrument_sample_cache[instrument]
        if cached_sr == sr:
            return cached_y

    path = os.path.join(_INSTRUMENT_SAMPLES_DIR, f"{instrument}.wav")
    y, file_sr = sf.read(path, dtype="float32", always_2d=False)
    if getattr(y, "ndim", 1) > 1:
        y = y.mean(axis=1)
    if file_sr != sr:
        y = librosa.resample(y, orig_sr=file_sr, target_sr=sr)

    _instrument_sample_cache[instrument] = (sr, y)
    return y


class ExportNoteIn(BaseModel):
    note: str = "C4"
    start: float = 0.0
    duration: float = 0.5
    velocity: float = 90.0


class ExportTrackIn(BaseModel):
    type: str = "audio"
    name: str = ""
    volume: float = 0.8
    pan: float = 0.0
    audio_path: Optional[str] = None
    midi_data: Optional[List[ExportNoteIn]] = None


class ExportRequest(BaseModel):
    tracks: List[ExportTrackIn]
    bpm: float = 120.0


def _equal_power_pan(pan: float) -> "tuple[float, float]":
    angle = (float(np.clip(pan, -1.0, 1.0)) + 1.0) * (np.pi / 4.0)
    return float(np.cos(angle)), float(np.sin(angle))


def _mix_into(master: "np.ndarray", clip: "np.ndarray", start_sample: int, gain_l: float, gain_r: float) -> None:
    end_sample = min(master.shape[0], start_sample + len(clip))
    if end_sample <= start_sample:
        return
    segment = clip[: end_sample - start_sample]
    master[start_sample:end_sample, 0] += segment * gain_l
    master[start_sample:end_sample, 1] += segment * gain_r


@app.post("/export-project-audio")
async def export_project_audio(req: ExportRequest):
    if not req.tracks:
        return JSONResponse(status_code=400, content={"error": "At least one track is required"})

    sr = 44100
    sec_per_beat = 60.0 / max(1.0, req.bpm)

    try:
        # Each instrument/midi note plays the sample's full natural length
        # (pitch-shifted, not time-stretched) — matching exactly what
        # instrumentSynth.ts does on-device — so a generous fixed tail
        # covers the longest sample fully decaying after the last note.
        end_times = [2.5]
        for track in req.tracks:
            if track.type == "audio" and track.audio_path and os.path.exists(track.audio_path):
                try:
                    info = sf.info(track.audio_path)
                    end_times.append(info.duration)
                except Exception:
                    pass
            elif track.midi_data:
                for note in track.midi_data:
                    end_times.append(note.start * sec_per_beat + 2.5)
        total_seconds = max(end_times)

        master = np.zeros((int(round(total_seconds * sr)) + sr, 2), dtype=np.float32)

        for track in req.tracks:
            gain_l, gain_r = _equal_power_pan(track.pan)
            volume = max(0.0, min(2.0, track.volume))

            if track.type == "audio":
                if not track.audio_path or not os.path.exists(track.audio_path):
                    continue
                y, file_sr = sf.read(track.audio_path, dtype="float32", always_2d=False)
                if getattr(y, "ndim", 1) > 1:
                    y = y.mean(axis=1)
                if file_sr != sr:
                    y = librosa.resample(y, orig_sr=file_sr, target_sr=sr)
                _mix_into(master, y * volume, 0, gain_l, gain_r)
                continue

            if not track.midi_data:
                continue

            instrument = "piano" if track.type == "midi" else _guess_instrument_from_name(track.name)
            sample = _load_instrument_sample(instrument, sr)
            reference_midi = _INSTRUMENT_REFERENCE_MIDI[instrument]

            for note in track.midi_data:
                midi = _note_name_to_midi(note.note)
                rate = float(np.clip(2.0 ** ((midi - reference_midi) / 12.0), 0.5, 2.0))
                voiced = _resample_pitch_shift(sample, rate)
                note_volume = volume * max(0.3, min(1.0, note.velocity / 127.0))
                start_sample = int(round(note.start * sec_per_beat * sr))
                _mix_into(master, voiced * note_volume, start_sample, gain_l, gain_r)

        master = _soft_limit(master, target_peak=0.9)

        work_dir = tempfile.mkdtemp()
        try:
            out_path = os.path.join(work_dir, "mix.wav")
            sf.write(out_path, master, sr, subtype="PCM_16")
            with open(out_path, "rb") as f:
                audio_b64 = base64.b64encode(f.read()).decode("utf-8")
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

        return {"audio_wav_b64": audio_b64, "duration_sec": round(total_seconds, 2)}
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": str(exc)})


# --- Waveform peaks -----------------------------------------------------


class WaveformRequest(BaseModel):
    audio_path: str
    points: int = 120


@app.post("/waveform-peaks")
async def waveform_peaks(req: WaveformRequest):
    """Downsamples an audio file to a small array of 0-1 peak values for a
    lightweight client-side waveform (a row of plain View bars — no native
    audio-decoding module needed on-device). Takes a local file path
    rather than an upload since Laravel and this service share a
    filesystem, avoiding re-transferring the audio bytes.
    """
    if not LIBROSA_AVAILABLE:
        return JSONResponse(status_code=501, content={"error": "librosa isn't installed on this service."})
    if not os.path.exists(req.audio_path):
        return JSONResponse(status_code=404, content={"error": "Audio file not found"})

    try:
        y, sr = librosa.load(req.audio_path, sr=8000, mono=True)
        if len(y) == 0:
            return {"peaks": [0.0] * req.points, "duration_sec": 0.0}

        points = max(8, min(500, req.points))
        chunk_size = max(1, len(y) // points)
        peaks = []
        for i in range(points):
            chunk = y[i * chunk_size : (i + 1) * chunk_size]
            peaks.append(float(np.max(np.abs(chunk))) if len(chunk) else 0.0)

        peak_max = max(peaks) if peaks else 0.0
        if peak_max > 1e-6:
            peaks = [round(p / peak_max, 4) for p in peaks]

        return {"peaks": peaks, "duration_sec": round(float(len(y) / sr), 2)}
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": str(exc)})
