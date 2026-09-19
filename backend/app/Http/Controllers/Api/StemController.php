<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Track;
use App\Rules\ValidAudioFile;
use App\Services\AudioAnalysisService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class StemController extends Controller
{
    protected $audioService;

    public function __construct(AudioAnalysisService $audioService)
    {
        $this->audioService = $audioService;
    }

    public function separateStems(Request $request)
    {
        $request->validate([
            'audio_file' => ['required', 'file', 'max:200000', new ValidAudioFile()],
            'stems' => 'nullable|array',
            'stems.*' => 'in:vocals,drums,bass,other',
        ]);

        $audioFile = $request->file('audio_file');
        $jobId = Str::uuid()->toString();
        $requestedStems = $request->input('stems', ['vocals', 'drums', 'bass', 'other']);
        $path = $audioFile->store("stems/jobs/{$jobId}", 'public');

        $result = $this->runSeparationJob(
            $jobId,
            file_get_contents($audioFile->getRealPath()),
            $audioFile->getClientOriginalName(),
            $requestedStems,
            ['audio_path' => $path]
        );

        return response()->json($result, $result['status'] === 'completed' ? 200 : 500);
    }

    /**
     * Splits an existing track's already-uploaded audio into stems, without
     * making the phone re-upload bytes it already sent once — the track's
     * file is read directly from local storage instead. This is what lets
     * the Editor's "Edit" button on an audio track jump straight to
     * splitting it, with no file picker step.
     */
    public function separateFromTrack(Request $request, Track $track)
    {
        $this->authorize('update', $track->project);

        $request->validate([
            'stems' => 'nullable|array',
            'stems.*' => 'in:vocals,drums,bass,other',
        ]);

        if ($track->type !== 'audio' || !$track->audio_url || !Storage::disk('public')->exists($track->audio_url)) {
            return response()->json(['message' => 'This track has no audio to split into stems.'], 422);
        }

        $jobId = Str::uuid()->toString();
        $requestedStems = $request->input('stems', ['vocals', 'drums', 'bass', 'other']);
        $localPath = Storage::disk('public')->path($track->audio_url);

        $result = $this->runSeparationJob(
            $jobId,
            file_get_contents($localPath),
            basename($track->audio_url),
            $requestedStems,
            ['source_track_id' => $track->id, 'source_track_name' => $track->name]
        );

        return response()->json($result, $result['status'] === 'completed' ? 200 : 500);
    }

    /**
     * Shared by both entry points above: writes the job's metadata before
     * and after calling the Demucs microservice, so a crash mid-separation
     * still leaves a "failed" status behind instead of a job that just
     * silently never finishes.
     */
    protected function runSeparationJob(
        string $jobId,
        string $fileContents,
        string $fileName,
        array $requestedStems,
        array $extraMetadata = []
    ): array {
        // Demucs on CPU can take well over PHP's default 60s
        // max_execution_time for anything longer than a short clip — a full
        // song can run well past ten minutes on CPU, so this needs real
        // headroom, matching the timeout used for the audio-service HTTP
        // call, or the request gets killed mid-separation regardless of
        // that timeout.
        set_time_limit(1800);

        Storage::disk('public')->put("stems/jobs/{$jobId}/metadata.json", json_encode(array_merge($extraMetadata, [
            'job_id' => $jobId,
            'status' => 'processing',
            'created_at' => now()->toIso8601String(),
            'requested_stems' => $requestedStems,
        ])));

        try {
            $result = $this->audioService->separateStems($fileContents, $fileName, $requestedStems);
            $outputStems = $this->storeStemOutputs($jobId, $result['stems'] ?? []);

            Storage::disk('public')->put("stems/jobs/{$jobId}/metadata.json", json_encode(array_merge($extraMetadata, [
                'job_id' => $jobId,
                'status' => 'completed',
                'created_at' => now()->toIso8601String(),
                'requested_stems' => $requestedStems,
                'output_stems' => $outputStems,
            ])));

            return ['job_id' => $jobId, 'status' => 'completed', 'message' => 'Stem separation complete.'];
        } catch (\Exception $e) {
            Storage::disk('public')->put("stems/jobs/{$jobId}/metadata.json", json_encode(array_merge($extraMetadata, [
                'job_id' => $jobId,
                'status' => 'failed',
                'created_at' => now()->toIso8601String(),
                'requested_stems' => $requestedStems,
                'error' => $e->getMessage(),
            ])));

            // A connection failure (the Python audio microservice isn't
            // running) is a completely different, actionable situation from
            // a real processing error — surfacing that distinction is what
            // makes the failure diagnosable from the app instead of a bare
            // "failed" with no clue why.
            $message = $e instanceof \Illuminate\Http\Client\ConnectionException
                ? 'The audio processing service is temporarily unavailable. Please try again shortly.'
                : 'Stem separation failed. The audio file may be unsupported or too long — try a shorter clip.';

            return ['job_id' => $jobId, 'status' => 'failed', 'message' => $message];
        }
    }

    /**
     * Decode the base64 stem audio returned by the Demucs microservice and
     * persist each stem under the job's storage folder.
     */
    protected function storeStemOutputs(string $jobId, array $stems)
    {
        $outputStems = [];

        foreach ($stems as $name => $base64Audio) {
            $fileName = "{$name}.wav";
            Storage::disk('public')->put("stems/jobs/{$jobId}/{$fileName}", base64_decode($base64Audio));
            $outputStems[] = ['name' => $fileName];
        }

        return $outputStems;
    }

    public function checkStatus($jobId)
    {
        $metadataPath = "stems/jobs/{$jobId}/metadata.json";

        if (!Storage::disk('public')->exists($metadataPath)) {
            return response()->json(['error' => 'Job not found'], 404);
        }

        $metadata = json_decode(Storage::disk('public')->get($metadataPath), true);

        return response()->json($metadata);
    }

    public function download(Request $request, $jobId)
    {
        $metadataPath = "stems/jobs/{$jobId}/metadata.json";

        if (!Storage::disk('public')->exists($metadataPath)) {
            return response()->json(['error' => 'Job not found'], 404);
        }

        $metadata = json_decode(Storage::disk('public')->get($metadataPath), true);

        if ($metadata['status'] !== 'completed') {
            return response()->json([
                'error' => 'Stems not ready yet',
                'status' => $metadata['status']
            ], 400);
        }

        return response()->json([
            'stems' => $metadata['output_stems'] ?? [],
            'download_urls' => $this->generateDownloadUrls($request, $jobId, $metadata['output_stems'] ?? []),
        ]);
    }

    /**
     * Storage::url() builds against the static app.url config ("localhost"
     * in dev), which a phone on the same LAN can't resolve back to the dev
     * machine — swap in whatever host the client actually used to reach
     * this API, the same LAN IP api.ts already derives on the mobile side.
     */
    public static function absoluteStorageUrl(Request $request, string $path): string
    {
        $url = Storage::disk('public')->url($path);

        return preg_replace('#^https?://[^/]+#', $request->getSchemeAndHttpHost(), $url);
    }

    protected function generateDownloadUrls(Request $request, $jobId, $stems)
    {
        $urls = [];

        foreach ($stems as $stem) {
            $path = "stems/jobs/{$jobId}/{$stem['name']}";
            if (Storage::disk('public')->exists($path)) {
                $urls[$stem['name']] = static::absoluteStorageUrl($request, $path);
            }
        }

        return $urls;
    }

    /**
     * Attaches an already-separated stem to a project as a new audio track,
     * referencing the stem file already stored under the job's folder
     * directly rather than round-tripping it back through the client.
     */
    public function addStemAsTrack(Request $request, Project $project)
    {
        $this->authorize('update', $project);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'job_id' => 'required|string',
            'stem_name' => 'required|string',
        ]);

        $path = "stems/jobs/{$validated['job_id']}/{$validated['stem_name']}";

        if (!Storage::disk('public')->exists($path)) {
            return response()->json(['message' => 'Stem file not found'], 404);
        }

        $track = $project->tracks()->create([
            'name' => $validated['name'],
            'type' => 'audio',
            'audio_url' => $path,
            'waveform_peaks' => $this->audioService->computeWaveformPeaks(Storage::disk('public')->path($path)),
            'volume' => 0.8,
            'pan' => 0,
        ]);

        return response()->json($track, 201);
    }
}
