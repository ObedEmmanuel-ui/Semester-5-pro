<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectComment;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Comments from OTHER producers on a project its owner has shared publicly
 * (Project::is_public). The owner's own private "AI chat" on a project
 * (ProjectMessageController) is a completely separate, single-user feature —
 * this is the real multi-user surface: any authenticated user may view or
 * post here once a project is public, not just the owner.
 */
class ProjectCommentController extends Controller
{
    public function index(Request $request, Project $project)
    {
        $this->authorizeView($request, $project);

        $comments = $project->comments()->with('user:id,name,avatar_path')->oldest()->paginate(30);

        return response()->json($comments);
    }

    public function store(Request $request, Project $project)
    {
        $this->authorizeView($request, $project);

        $validated = $request->validate([
            'body' => 'required|string|max:2000',
        ]);

        $comment = $project->comments()->create([
            'user_id' => $request->user()->id,
            'body' => $validated['body'],
        ]);

        // Tell the project's owner someone commented on their shared work —
        // the one person a comment is genuinely "for". Skipped when
        // commenting on your own project, since that isn't news to you.
        if ($project->user_id !== $request->user()->id) {
            Notification::create([
                'user_id' => $project->user_id,
                'type' => 'project_comment',
                'data' => [
                    'project_id' => $project->id,
                    'project_name' => $project->name,
                    'comment_id' => $comment->id,
                    'commenter_id' => $request->user()->id,
                    'commenter_name' => $request->user()->name,
                    'comment_preview' => Str::limit($comment->body, 80),
                ],
            ]);
        }

        return response()->json($comment->load('user:id,name,avatar_path'), 201);
    }

    public function destroy(Request $request, Project $project, ProjectComment $comment)
    {
        $this->authorizeView($request, $project);

        abort_if(
            $comment->user_id !== $request->user()->id && $project->user_id !== $request->user()->id,
            403,
            'Only the comment author or the project owner can remove this comment.'
        );

        $comment->delete();

        return response()->json(['message' => 'Comment deleted successfully']);
    }

    /**
     * A public project is open to any authenticated user; a private one is
     * still owner-only — reuses the same rule the mobile app's Discover/
     * profile screens already enforce, checked again here since a comment
     * endpoint is a new way to reach project data.
     */
    protected function authorizeView(Request $request, Project $project): void
    {
        abort_unless($project->is_public || $project->user_id === $request->user()->id, 403, 'This project is private.');
    }
}
