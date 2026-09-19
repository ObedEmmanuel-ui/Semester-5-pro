<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminAuditLog;
use App\Models\ProjectComment;
use App\Models\ProjectMessage;
use App\Models\VoiceMemo;
use Illuminate\Support\Facades\Storage;

/**
 * Chat messages (including voice messages), personal voice memos, and
 * public project comments were previously invisible to admins entirely —
 * real user-generated content with no review or moderation path at all.
 * Comments are the highest-priority of the three to moderate here: unlike
 * the private AI chat or personal voice memos, a comment is visible to
 * every other producer on the platform via Discover, so it's the one
 * genuinely public-facing content surface in the app.
 */
class ModerationController extends Controller
{
    public function index()
    {
        $comments = ProjectComment::with(['user:id,name,email', 'project:id,name,user_id', 'project.user:id,name'])
            ->latest()
            ->paginate(15, ['*'], 'comments_page');

        $messages = ProjectMessage::with(['user:id,name,email', 'project:id,name'])
            ->latest()
            ->paginate(15, ['*'], 'messages_page');

        $voiceMemos = VoiceMemo::with('user:id,name,email')
            ->latest()
            ->paginate(15, ['*'], 'memos_page');

        return view('admin.moderation.index', compact('comments', 'messages', 'voiceMemos'));
    }

    public function destroyComment(ProjectComment $comment)
    {
        $author = $comment->user?->name;
        $projectName = $comment->project?->name;
        $comment->delete();

        AdminAuditLog::record('moderation.comment_removed', 'project_comment', $comment->id, "Removed a comment from \"{$author}\" on \"{$projectName}\"");

        return back()->with('status', 'Comment removed.');
    }

    public function destroyMessage(ProjectMessage $message)
    {
        if ($message->voice_path) {
            Storage::disk('public')->delete($message->voice_path);
        }

        $description = $message->is_ai
            ? "Removed an AI chat reply in project #{$message->project_id}"
            : "Removed a chat message from \"{$message->user?->name}\" in project #{$message->project_id}";

        $message->delete();

        AdminAuditLog::record('moderation.message_removed', 'project_message', $message->id, $description);

        return back()->with('status', 'Message removed.');
    }

    public function destroyVoiceMemo(VoiceMemo $voiceMemo)
    {
        if ($voiceMemo->audio_path) {
            Storage::disk('public')->delete($voiceMemo->audio_path);
        }

        $name = $voiceMemo->name;
        $owner = $voiceMemo->user?->name;
        $voiceMemo->delete();

        AdminAuditLog::record('moderation.voice_memo_removed', 'voice_memo', $voiceMemo->id, "Removed voice memo \"{$name}\" from \"{$owner}\"");

        return back()->with('status', 'Voice memo removed.');
    }
}
