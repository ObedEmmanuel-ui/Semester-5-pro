<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Track;
use App\Rules\ValidAudioFile;
use App\Services\AudioAnalysisService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class TrackController extends Controller
{
    protected $audioService;

    public function __construct(AudioAnalysisService $audioService)
    {
        $this->audioService = $audioService;
    }

    public function store(Request $request, Project $project)
    {
        $this->authorize('update', $project);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'type' => 'required|in:audio,midi,instrument',
            'midi_data' => 'nullable|array',
            'volume' => 'nullable|numeric|min:0|max:2',
            'pan' => 'nullable|numeric|min:-1|max:1',
        ]);

        $track = $project->tracks()->create($validated);

        return response()->json($track, 201);
    }

    public function show(Track $track)
    {
        $this->authorize('view', $track->project);

        return response()->json($track);
    }

    public function update(Request $request, Track $track)
    {
        $this->authorize('update', $track->project);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'midi_data' => 'sometimes|array',
            'volume' => 'sometimes|numeric|min:0|max:2',
            'pan' => 'sometimes|numeric|min:-1|max:1',
            'muted' => 'sometimes|boolean',
            'solo' => 'sometimes|boolean',
            'effects' => 'sometimes|array',
            'favorite' => 'sometimes|boolean',
        ]);

        $track->update($validated);

        return response()->json($track);
    }

    public function destroy(Track $track)
    {
        $this->authorize('delete', $track->project);

        if ($track->audio_url) {
            Storage::disk('public')->delete($track->audio_url);
        }

        $track->delete();

        return response()->json(['message' => 'Track deleted successfully']);
    }

    public function uploadAudio(Request $request, Track $track)
    {
        $this->authorize('update', $track->project);

        $request->validate([
            'audio_file' => ['required', 'file', 'max:100000', new ValidAudioFile()],
        ]);

        if ($track->audio_url) {
            Storage::disk('public')->delete($track->audio_url);
        }

        $path = $request->file('audio_file')->store('tracks', 'public');
        $peaks = $this->audioService->computeWaveformPeaks(Storage::disk('public')->path($path));

        $track->update([
            'audio_url' => $path,
            'waveform_peaks' => $peaks,
        ]);

        return response()->json([
            'track' => $track,
            'url' => StemController::absoluteStorageUrl($request, $path),
        ]);
    }
}
