<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\VoiceMemo;
use App\Rules\ValidAudioFile;
use App\Services\AudioAnalysisService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class VoiceMemoController extends Controller
{
    protected $audioService;

    public function __construct(AudioAnalysisService $audioService)
    {
        $this->audioService = $audioService;
    }

    public function index(Request $request)
    {
        $memos = $request->user()->voiceMemos()->latest()->get();

        return response()->json($memos);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'audio_file' => ['required', 'file', 'max:50000', new ValidAudioFile()],
        ]);

        $path = $request->file('audio_file')->store('voice-memos', 'public');

        $duration = $this->audioService->computeAudioDurationSeconds(Storage::disk('public')->path($path));

        $memo = $request->user()->voiceMemos()->create([
            'name' => $validated['name'],
            'audio_path' => $path,
            'duration_seconds' => $duration,
        ]);

        return response()->json($memo, 201);
    }

    public function update(Request $request, VoiceMemo $memo)
    {
        $this->authorize('update', $memo);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'favorite' => 'sometimes|boolean',
        ]);

        $memo->update($validated);

        return response()->json($memo);
    }

    public function destroy(VoiceMemo $memo)
    {
        $this->authorize('delete', $memo);

        Storage::disk('public')->delete($memo->audio_path);
        $memo->delete();

        return response()->json(['message' => 'Voice memo deleted successfully']);
    }
}
