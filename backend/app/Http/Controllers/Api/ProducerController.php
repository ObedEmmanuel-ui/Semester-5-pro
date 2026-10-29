<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProjectComment;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * The public, other-producers-facing side of a user — distinct from the
 * private AuthController "me" profile. Only a producer's own public
 * projects (is_public = true) are ever shown here; private work-in-progress
 * projects never leave the owner's own Home/Projects screens.
 */
class ProducerController extends Controller
{
    public function index(Request $request)
    {
        $query = User::withCount(['followers', 'following'])
            ->where('id', '!=', $request->user()->id)
            ->where('is_discoverable', true);

        if ($search = $request->string('q')->trim()->value()) {
            $query->where('name', 'like', "%{$search}%");
        }

        $producers = $query->orderByDesc('followers_count')->paginate(20);

        $followingIds = $request->user()->following()->pluck('users.id')->all();
        foreach ($producers->items() as $producer) {
            $producer->is_following = in_array($producer->id, $followingIds, true);
        }

        return response()->json($producers);
    }

    public function show(Request $request, User $user)
    {
        $user->loadCount(['followers', 'following']);
        $user->is_following = $request->user()->isFollowing($user);

        $publicProjects = $user->projects()
            ->where('is_public', true)
            ->withCount(['tracks', 'comments'])
            ->latest()
            ->get();

        return response()->json([
            'user' => $user,
            'projects' => $publicProjects,
        ]);
    }

    /**
     * A real activity feed for the Discover page — the most recent comments
     * left on any publicly-shared project, so a new comment is genuinely
     * visible to the wider producer community, not just the project owner
     * (who gets their own personal notification instead).
     */
    public function activity(Request $request)
    {
        $comments = ProjectComment::query()
            ->whereHas('project', fn ($q) => $q->where('is_public', true))
            ->whereHas('user', fn ($q) => $q->where('is_discoverable', true))
            ->with(['user:id,name,avatar_path', 'project:id,name,user_id', 'project.user:id,name'])
            ->latest()
            ->take(20)
            ->get();

        $followingIds = $request->user()->following()->pluck('users.id')->all();
        foreach ($comments as $comment) {
            $comment->user->is_following = $comment->user->id === $request->user()->id
                ? null
                : in_array($comment->user->id, $followingIds, true);
        }

        return response()->json($comments);
    }
}
