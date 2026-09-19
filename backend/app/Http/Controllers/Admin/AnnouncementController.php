<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminAuditLog;
use App\Models\Announcement;
use Illuminate\Http\Request;

class AnnouncementController extends Controller
{
    public function index()
    {
        $announcements = Announcement::with('author')->latest()->paginate(15);

        return view('admin.announcements.index', compact('announcements'));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'body' => 'required|string|max:4000',
        ]);

        $announcement = Announcement::create([
            ...$validated,
            'created_by' => $request->user('web')->id,
        ]);

        AdminAuditLog::record('announcement.created', 'announcement', $announcement->id, "Posted announcement \"{$announcement->title}\"");

        return back()->with('status', 'Announcement posted — every user will see it in the app.');
    }

    public function destroy(Announcement $announcement)
    {
        $title = $announcement->title;
        $announcement->delete();

        AdminAuditLog::record('announcement.deleted', 'announcement', $announcement->id, "Removed announcement \"{$title}\"");

        return back()->with('status', 'Announcement removed.');
    }
}
