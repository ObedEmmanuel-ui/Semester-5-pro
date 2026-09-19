<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\Notification;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /**
     * Every user sees the same broadcast feed — these are admin
     * announcements, not per-user messages, so there's no ownership check
     * here beyond just being authenticated.
     */
    public function index(Request $request)
    {
        $announcements = Announcement::with('author:id,name')
            ->latest()
            ->paginate(20);

        return response()->json($announcements);
    }

    /**
     * Real, per-user notifications (currently just "someone commented on
     * your project"). Viewing the list marks everything on it read — the
     * same "seen when opened" semantics the announcement feed already uses
     * client-side, just tracked server-side here since these are genuinely
     * per-user rows.
     */
    public function personal(Request $request)
    {
        $notifications = $request->user()->notifications()->latest()->paginate(20);

        $request->user()->notifications()->whereNull('read_at')->update(['read_at' => now()]);

        return response()->json($notifications);
    }

    public function unreadCount(Request $request)
    {
        return response()->json([
            'count' => $request->user()->notifications()->whereNull('read_at')->count(),
        ]);
    }
}
