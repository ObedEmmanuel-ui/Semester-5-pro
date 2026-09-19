<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use Illuminate\Http\Request;

class ProjectController extends Controller
{
    public function index(Request $request)
    {
        $projects = $request->user()
            ->projects()
            ->with('tracks')
            ->latest()
            ->paginate(20);

        return response()->json($projects);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'genre' => 'nullable|string|max:60',
            'bpm' => 'nullable|integer|min:20|max:300',
            'key' => 'nullable|string|max:10',
            'time_signature' => 'nullable|string|max:10',
        ]);

        $project = $request->user()->projects()->create([
            'name' => $validated['name'],
            'genre' => $validated['genre'] ?? null,
            'bpm' => $validated['bpm'] ?? 120,
            'key' => $validated['key'] ?? 'C',
            'time_signature' => $validated['time_signature'] ?? '4/4',
            'settings' => [],
        ]);

        return response()->json($project->load('tracks'), 201);
    }

    public function show(Request $request, Project $project)
    {
        $this->authorize('view', $project);

        return response()->json($project->load('tracks'));
    }

    public function update(Request $request, Project $project)
    {
        $this->authorize('update', $project);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'genre' => 'sometimes|nullable|string|max:60',
            'status' => 'sometimes|in:active,completed,archived',
            'is_public' => 'sometimes|boolean',
            'due_date' => 'sometimes|nullable|date',
            'bpm' => 'sometimes|integer|min:20|max:300',
            'key' => 'sometimes|string|max:10',
            'time_signature' => 'sometimes|string|max:10',
            'settings' => 'sometimes|array',
        ]);

        $project->update($validated);

        return response()->json($project->load('tracks'));
    }

    public function destroy(Project $project)
    {
        $this->authorize('delete', $project);

        $project->delete();

        return response()->json(['message' => 'Project deleted successfully']);
    }

    public function duplicate(Request $request, Project $project)
    {
        $this->authorize('view', $project);

        $newProject = $project->replicate();
        $newProject->name = $project->name . ' (Copy)';
        $newProject->user_id = $request->user()->id;
        $newProject->save();

        // Duplicate tracks
        foreach ($project->tracks as $track) {
            $newTrack = $track->replicate();
            $newTrack->project_id = $newProject->id;
            $newTrack->save();
        }

        return response()->json($newProject->load('tracks'), 201);
    }
}
