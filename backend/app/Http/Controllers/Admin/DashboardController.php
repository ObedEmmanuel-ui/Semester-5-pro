<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Follow;
use App\Models\Project;
use App\Models\ProjectComment;
use App\Models\ProjectMessage;
use App\Models\Track;
use App\Models\User;
use App\Models\VoiceMemo;
use Illuminate\Support\Facades\Storage;

class DashboardController extends Controller
{
    public function index()
    {
        $stats = [
            'total_users' => User::count(),
            'new_users_7d' => User::where('created_at', '>=', now()->subDays(7))->count(),
            'suspended_users' => User::where('is_suspended', true)->count(),
            'admin_users' => User::where('is_admin', true)->count(),
            'super_admin_users' => User::where('is_super_admin', true)->count(),
            'total_projects' => Project::count(),
            'total_tracks' => Track::count(),
            'total_voice_memos' => VoiceMemo::count(),
            'total_messages' => ProjectMessage::count(),
            'public_projects' => Project::where('is_public', true)->count(),
            'total_comments' => ProjectComment::count(),
            'total_follows' => Follow::count(),
        ];

        // One bar per day for the last 14 days, so the dashboard shows a
        // signup trend at a glance rather than just a single running total.
        $signupSeries = [];
        for ($i = 13; $i >= 0; $i--) {
            $day = now()->subDays($i)->startOfDay();
            $count = User::whereBetween('created_at', [$day, $day->copy()->endOfDay()])->count();
            $signupSeries[] = ['label' => $day->format('M j'), 'count' => $count];
        }
        $maxSignupDay = max(1, collect($signupSeries)->max('count'));

        $recentUsers = User::latest()->take(8)->withCount('projects')->get();

        $topProducers = User::withCount('projects')
            ->orderByDesc('projects_count')
            ->take(5)
            ->get()
            ->filter(fn ($u) => $u->projects_count > 0)
            ->values();

        $mostFollowed = User::withCount('followers')
            ->orderByDesc('followers_count')
            ->take(5)
            ->get()
            ->filter(fn ($u) => $u->followers_count > 0)
            ->values();

        $recentComments = ProjectComment::with(['user:id,name', 'project:id,name,user_id', 'project.user:id,name'])
            ->latest()
            ->take(6)
            ->get();

        $storage = $this->resolveStorageUsage();

        return view('admin.dashboard', compact(
            'stats',
            'signupSeries',
            'maxSignupDay',
            'recentUsers',
            'topProducers',
            'mostFollowed',
            'recentComments',
            'storage'
        ));
    }

    /**
     * Real bytes-on-disk across every kind of audio the app stores (track
     * uploads, voice memos, project voice messages) — there's no
     * file_size column anywhere, so this reads actual file sizes from the
     * public disk rather than fabricating a number. Missing files (already
     * deleted, moved) are silently skipped rather than throwing.
     */
    protected function resolveStorageUsage(): array
    {
        $disk = Storage::disk('public');

        $sumSizes = function (iterable $paths) use ($disk): array {
            $bytes = 0;
            $count = 0;
            foreach ($paths as $path) {
                if ($path && $disk->exists($path)) {
                    $bytes += $disk->size($path);
                    $count++;
                }
            }
            return [$bytes, $count];
        };

        [$trackBytes, $trackCount] = $sumSizes(Track::whereNotNull('audio_url')->pluck('audio_url'));
        [$memoBytes, $memoCount] = $sumSizes(VoiceMemo::pluck('audio_path'));
        [$voiceMsgBytes, $voiceMsgCount] = $sumSizes(ProjectMessage::whereNotNull('voice_path')->pluck('voice_path'));

        $totalBytes = $trackBytes + $memoBytes + $voiceMsgBytes;

        return [
            'total_bytes' => $totalBytes,
            'total_human' => $this->humanBytes($totalBytes),
            'breakdown' => [
                ['label' => 'Track audio', 'count' => $trackCount, 'bytes' => $trackBytes, 'human' => $this->humanBytes($trackBytes)],
                ['label' => 'Voice memos', 'count' => $memoCount, 'bytes' => $memoBytes, 'human' => $this->humanBytes($memoBytes)],
                ['label' => 'Chat voice messages', 'count' => $voiceMsgCount, 'bytes' => $voiceMsgBytes, 'human' => $this->humanBytes($voiceMsgBytes)],
            ],
        ];
    }

    protected function humanBytes(int $bytes): string
    {
        if ($bytes < 1024) {
            return "{$bytes} B";
        }
        $units = ['KB', 'MB', 'GB', 'TB'];
        $value = $bytes;
        foreach ($units as $unit) {
            $value /= 1024;
            if ($value < 1024) {
                return round($value, 1) . " {$unit}";
            }
        }
        return round($value, 1) . ' TB';
    }
}
