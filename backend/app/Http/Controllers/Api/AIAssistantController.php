<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Rules\ValidAudioFile;
use App\Services\AudioAnalysisService;
use App\Services\DeepSeekAIService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class AIAssistantController extends Controller
{
    protected $aiService;
    protected $audioService;

    public function __construct(DeepSeekAIService $aiService, AudioAnalysisService $audioService)
    {
        $this->aiService = $aiService;
        $this->audioService = $audioService;
    }

    public function generateMidi(Request $request)
    {
        $validated = $request->validate([
            'prompt' => 'required|string',
            'duration' => 'nullable|integer|min:1|max:300',
            'key' => 'nullable|string',
            'scale' => 'nullable|string',
        ]);

        $result = $this->aiService->generateMidiPattern($validated);

        return response()->json([
            'midi_data' => $result['notes'],
            'source' => $result['source'],
            'format' => 'midi',
        ]);
    }

    public function generateInstrument(Request $request)
    {
        $validated = $request->validate([
            'instrument' => 'required|string|in:piano,bass,guitar,synth,strings',
            'bpm' => 'nullable|integer|min:20|max:300',
            'key' => 'nullable|string',
            'scale' => 'nullable|string',
            'duration' => 'nullable|integer|min:1|max:16',
        ]);

        $result = $this->aiService->generateInstrumentPattern($validated);

        return response()->json([
            'midi_data' => $result['notes'],
            'instrument' => $validated['instrument'],
            'source' => $result['source'],
            'format' => 'midi',
        ]);
    }

    public function suggestHarmony(Request $request)
    {
        $validated = $request->validate([
            'audio_file' => ['required', 'file', 'max:50000', new ValidAudioFile()],
            'context' => 'nullable|string',
        ]);

        $features = $this->audioService->extractMidiAndFeatures($validated['audio_file']);
        $harmonySuggestions = $this->aiService->suggestHarmonyFromFeatures(
            $features,
            $validated['context'] ?? ''
        );

        return response()->json([
            'suggestions' => $harmonySuggestions,
            'chords' => $harmonySuggestions['chords'] ?? [],
            'scale' => $harmonySuggestions['detected_scale'] ?? null,
            'detected_tempo_bpm' => $features['tempo_bpm'] ?? null,
            'detected_key' => $features['estimated_key'] ?? null,
            'source' => $harmonySuggestions['source'] ?? 'ai',
        ]);
    }

    public function generateDrums(Request $request)
    {
        $validated = $request->validate([
            'style' => 'required|string',
            'bpm' => 'required|integer|min:20|max:300',
            'bars' => 'nullable|integer|min:1|max:16',
        ]);

        $result = $this->aiService->generateDrumPattern($validated);

        return response()->json([
            'pattern' => $result['pattern'],
            'source' => $result['source'],
            'style' => $validated['style'],
            'bpm' => $validated['bpm'],
        ]);
    }

    public function analyzeAudio(Request $request)
    {
        $validated = $request->validate([
            'audio_file' => ['required', 'file', 'max:50000', new ValidAudioFile()],
        ]);

        $features = $this->audioService->extractMidiAndFeatures($validated['audio_file']);
        $analysis = $this->aiService->describeAudioFeatures($features);

        return response()->json(array_merge($analysis, [
            'notes' => $features['notes'] ?? [],
            'duration_sec' => $features['duration_sec'] ?? null,
        ]));
    }

    public function generateLyrics(Request $request)
    {
        $validated = $request->validate([
            'topic' => 'required|string|max:200',
            'mood' => 'nullable|string|max:60',
            'genre' => 'nullable|string|max:60',
        ]);

        $result = $this->aiService->generateLyrics($validated);

        return response()->json([
            'lyrics' => $result['lyrics'],
            'source' => $result['source'],
        ]);
    }

    public function generateSong(Request $request)
    {
        $validated = $request->validate([
            'lyrics' => 'required|string|max:4000',
        ]);

        $result = $this->aiService->generateSongFromLyrics($validated);

        return response()->json([
            'key' => $result['key'],
            'scale' => $result['scale'],
            'bpm' => $result['bpm'],
            'style' => $result['style'],
            'vocal_direction' => $result['vocal_direction'],
            'midi_data' => $result['melody'],
            'drum_pattern' => $result['drum_pattern'],
            'lyrics' => $result['lyrics'] ?? null,
            'duration_seconds' => $result['duration_seconds'] ?? null,
            'source' => $result['source'],
        ]);
    }

    /**
     * Renders the melody/beat from generateSong() into real playable audio
     * (TTS-sung vocals + synthesized drum hits) — a separate, much slower
     * step so the fast text/melody planning call above isn't blocked on it.
     * Output files are stored under the same stems/jobs/{id} layout the
     * stem-separation feature uses, so the existing
     * POST /projects/{project}/tracks/from-stem endpoint can add either
     * file as a real audio track with no changes of its own.
     */
    public function generateSongAudio(Request $request)
    {
        // Word-by-word TTS plus per-word pitch/time fitting for a full
        // song is CPU work on the same order as stem separation.
        set_time_limit(1800);

        $validated = $request->validate([
            'melody' => 'required|array|min:1',
            'melody.*.note' => 'required|string',
            'melody.*.start' => 'required|numeric',
            'melody.*.duration' => 'required|numeric',
            'melody.*.word' => 'nullable|string',
            'drum_pattern' => 'required|array',
            'bpm' => 'required|numeric|min:20|max:300',
        ]);

        $jobId = Str::uuid()->toString();

        try {
            $result = $this->audioService->generateSongAudio(
                $validated['melody'],
                $validated['drum_pattern'],
                $validated['bpm']
            );

            Storage::disk('public')->put(
                "stems/jobs/{$jobId}/vocals.wav",
                base64_decode($result['vocals_wav_b64'])
            );
            Storage::disk('public')->put(
                "stems/jobs/{$jobId}/beat.wav",
                base64_decode($result['beat_wav_b64'])
            );

            return response()->json([
                'job_id' => $jobId,
                'vocals_stem_name' => 'vocals.wav',
                'beat_stem_name' => 'beat.wav',
                'vocals_url' => StemController::absoluteStorageUrl($request, "stems/jobs/{$jobId}/vocals.wav"),
                'beat_url' => StemController::absoluteStorageUrl($request, "stems/jobs/{$jobId}/beat.wav"),
                'duration_seconds' => $result['duration_sec'] ?? null,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to render song audio: ' . $e->getMessage(),
            ], 500);
        }
    }

}
