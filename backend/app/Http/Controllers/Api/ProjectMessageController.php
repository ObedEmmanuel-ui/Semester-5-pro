<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Rules\ValidAudioFile;
use App\Services\DeepSeekAIService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Per-project chat. Real and persisted, but this app has no
 * project-sharing/invite system, so only the project's own owner can ever
 * view or post here — there is currently no way for a second real user to
 * take part, unlike the multi-participant chat a collaboration feature
 * would eventually need. AI replies (is_ai=true messages) are the one
 * other "participant", generated on demand via aiReply() below.
 */
class ProjectMessageController extends Controller
{
    public function __construct(protected DeepSeekAIService $aiService)
    {
    }

    public function index(Request $request, Project $project)
    {
        $this->authorize('view', $project);

        $messages = $project->messages()->with('user:id,name,avatar_path')->oldest()->get();

        return response()->json($messages);
    }

    public function store(Request $request, Project $project)
    {
        $this->authorize('view', $project);

        $validated = $request->validate([
            'body' => 'required_without:voice_file|nullable|string|max:2000',
            'voice_file' => ['required_without:body', 'nullable', 'file', 'max:20000', new ValidAudioFile()],
        ]);

        $voicePath = null;
        $voiceDuration = null;
        if ($request->hasFile('voice_file')) {
            $voicePath = $request->file('voice_file')->store('project-messages', 'public');
        }

        $message = $project->messages()->create([
            'user_id' => $request->user()->id,
            'body' => $validated['body'] ?? null,
            'voice_path' => $voicePath,
            'voice_duration_seconds' => $voiceDuration,
        ]);

        return response()->json($message->load('user:id,name,avatar_path'), 201);
    }

    /**
     * Generates and saves an AI reply following on from a message the
     * caller has already stored via store() — doesn't re-save the user's
     * own message, just replies to it using the thread's recent history
     * for context.
     */
    public function aiReply(Request $request, Project $project)
    {
        $this->authorize('view', $project);

        $validated = $request->validate([
            'message' => 'required|string|max:2000',
        ]);

        $history = $project->messages()
            ->latest()
            ->take(12)
            ->get(['body', 'is_ai'])
            ->reverse()
            ->values()
            ->toArray();

        $result = $this->aiService->chatReply([
            'message' => $validated['message'],
            'project' => [
                'name' => $project->name,
                'genre' => $project->genre,
                'bpm' => $project->bpm,
                'key' => $project->key,
            ],
            'history' => $history,
        ]);

        $message = $project->messages()->create([
            'user_id' => $request->user()->id,
            'is_ai' => true,
            'body' => $result['reply'],
        ]);

        return response()->json(array_merge($message->toArray(), ['source' => $result['source']]), 201);
    }

    public function destroy(Request $request, Project $project, \App\Models\ProjectMessage $message)
    {
        $this->authorize('view', $project);

        if ($message->user_id !== $request->user()->id) {
            abort(403);
        }

        if ($message->voice_path) {
            Storage::disk('public')->delete($message->voice_path);
        }
        $message->delete();

        return response()->json(['message' => 'Message deleted successfully']);
    }
}
