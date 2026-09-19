<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Services\AudioAnalysisService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProjectExportController extends Controller
{
    protected $audioService;

    public function __construct(AudioAnalysisService $audioService)
    {
        $this->audioService = $audioService;
    }

    public function export(Request $request, Project $project)
    {
        $this->authorize('view', $project);

        // Re-synthesizing every instrument/midi track's notes plus mixing
        // any audio tracks is CPU work on the same order as stem
        // separation or song-audio rendering.
        set_time_limit(1800);

        $tracks = $project->tracks()->orderBy('position')->get();
        $hasSolo = $tracks->contains('solo', true);

        $payload = [];
        foreach ($tracks as $track) {
            if ($track->muted) {
                continue;
            }
            if ($hasSolo && !$track->solo) {
                continue;
            }

            $item = [
                'type' => $track->type,
                'name' => $track->name,
                'volume' => (float) $track->volume,
                'pan' => (float) $track->pan,
            ];

            if ($track->type === 'audio') {
                if (!$track->audio_url || !Storage::disk('public')->exists($track->audio_url)) {
                    continue;
                }
                $item['audio_path'] = Storage::disk('public')->path($track->audio_url);
            } else {
                if (empty($track->midi_data)) {
                    continue;
                }
                $item['midi_data'] = $track->midi_data;
            }

            $payload[] = $item;
        }

        if (empty($payload)) {
            return response()->json([
                'message' => 'This project has no audible tracks to export — add or unmute at least one track first.',
            ], 422);
        }

        try {
            $result = $this->audioService->exportProjectAudio($payload, $project->bpm);

            $jobId = Str::uuid()->toString();
            Storage::disk('public')->put("exports/{$jobId}/mix.wav", base64_decode($result['audio_wav_b64']));

            return response()->json([
                'job_id' => $jobId,
                'file_name' => 'mix.wav',
                'download_url' => StemController::absoluteStorageUrl($request, "exports/{$jobId}/mix.wav"),
                'duration_seconds' => $result['duration_sec'] ?? null,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to export project: ' . $e->getMessage(),
            ], 500);
        }
    }
}
