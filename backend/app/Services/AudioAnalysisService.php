<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Client for the local Python audio microservice (Demucs + basic-pitch),
 * which handles the actual audio DSP work that DeepSeek's text-only API can't.
 */
class AudioAnalysisService
{
    protected $baseUrl;

    public function __construct()
    {
        $this->baseUrl = config('services.audio_service.base_url');
    }

    /**
     * Audio-to-MIDI transcription (basic-pitch + librosa) needs a Python
     * 3.10/3.11 environment that isn't installed alongside this service
     * (see audio-service/requirements-midi.txt) — the microservice reports
     * that via a 501 on /audio-to-midi. Rather than let that fail the whole
     * harmony/analysis request, degrade to empty features so the caller
     * still gets a (less precise, text-only) DeepSeek result instead of a
     * hard error.
     */
    public function extractMidiAndFeatures($audioFile)
    {
        try {
            $response = Http::timeout(120)
                ->attach('audio_file', file_get_contents($audioFile->getRealPath()), $audioFile->getClientOriginalName())
                ->post("{$this->baseUrl}/audio-to-midi");

            if ($response->successful()) {
                return $response->json();
            }

            Log::warning('Audio-to-MIDI unavailable, falling back to empty features: ' . $response->body());
        } catch (\Exception $e) {
            Log::warning('Audio Analysis Service unreachable, falling back to empty features: ' . $e->getMessage());
        }

        return ['notes' => [], 'tempo_bpm' => null, 'estimated_key' => null, 'duration_sec' => null];
    }

    public function separateStems(string $fileContents, string $fileName, array $stems)
    {
        try {
            // A full song can take well over ten minutes to separate on
            // CPU-only Demucs — this timeout needs to match the controller's
            // set_time_limit(1800) or the request gets cut off mid-job.
            $response = Http::timeout(1800)
                ->attach('audio_file', $fileContents, $fileName)
                ->post("{$this->baseUrl}/separate-stems", [
                    'stems' => implode(',', $stems),
                ]);

            if ($response->failed()) {
                throw new \RuntimeException('Stem separation service returned an error: ' . $response->body());
            }

            return $response->json();
        } catch (\Exception $e) {
            Log::error('Stem Separation Service Error: ' . $e->getMessage());
            throw $e;
        }
    }

    /**
     * Renders the Lyrics-to-Song melody into a real (TTS-based) sung vocal
     * track plus a matching drum-beat audio track. Word-by-word speech
     * synthesis and per-word pitch/time fitting for a full song is CPU
     * work on the same order as stem separation, so it gets the same
     * generous timeout.
     */
    public function generateSongAudio(array $melody, array $drumPattern, $bpm)
    {
        try {
            $response = Http::timeout(1800)
                ->post("{$this->baseUrl}/generate-song-audio", [
                    'melody' => $melody,
                    'drum_pattern' => $drumPattern,
                    'bpm' => $bpm,
                ]);

            if ($response->failed()) {
                throw new \RuntimeException('Song audio service returned an error: ' . $response->body());
            }

            return $response->json();
        } catch (\Exception $e) {
            Log::error('Song Audio Service Error: ' . $e->getMessage());
            throw $e;
        }
    }

    /**
     * Bounces every audible track in a project down to one mixed stereo
     * WAV — resolving audio tracks to real files and re-synthesizing
     * midi/instrument tracks from their note data, same generous timeout
     * as the other heavy audio jobs.
     */
    public function exportProjectAudio(array $tracks, $bpm)
    {
        try {
            $response = Http::timeout(1800)
                ->post("{$this->baseUrl}/export-project-audio", [
                    'tracks' => $tracks,
                    'bpm' => $bpm,
                ]);

            if ($response->failed()) {
                throw new \RuntimeException('Export service returned an error: ' . $response->body());
            }

            return $response->json();
        } catch (\Exception $e) {
            Log::error('Project Export Service Error: ' . $e->getMessage());
            throw $e;
        }
    }

    /**
     * A small array of 0-1 peak values for a lightweight waveform preview
     * — best-effort: returns null on any failure (missing local file,
     * service down, unsupported format) rather than blocking the upload
     * that triggered it, since the waveform is a visual nicety, not a
     * dependency of anything else.
     */
    public function computeWaveformPeaks(string $localPath, int $points = 120)
    {
        try {
            $response = Http::timeout(30)->post("{$this->baseUrl}/waveform-peaks", [
                'audio_path' => $localPath,
                'points' => $points,
            ]);

            return $response->successful() ? $response->json('peaks') : null;
        } catch (\Exception $e) {
            Log::warning('Waveform peaks unavailable: ' . $e->getMessage());

            return null;
        }
    }

    /**
     * The same /waveform-peaks call as above, but returning the duration
     * it also computes instead of discarding it — used wherever a real
     * clip length is wanted (voice memos) rather than just the preview
     * bars. Kept separate from computeWaveformPeaks() so that method's
     * existing "returns just the peaks array" contract doesn't change for
     * its other callers.
     */
    public function computeAudioDurationSeconds(string $localPath): ?float
    {
        try {
            $response = Http::timeout(30)->post("{$this->baseUrl}/waveform-peaks", [
                'audio_path' => $localPath,
                'points' => 1,
            ]);

            return $response->successful() ? $response->json('duration_sec') : null;
        } catch (\Exception $e) {
            Log::warning('Audio duration unavailable: ' . $e->getMessage());

            return null;
        }
    }
}
