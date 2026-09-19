@extends('admin.layout')

@section('title', 'Dashboard')
@section('subtitle', 'Platform overview across all accounts')

@section('content')
<style>
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; margin-bottom: 28px; }
    .stat-tile { padding: 20px; }
    .stat-tile .label { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); font-weight: 700; margin-bottom: 10px; }
    .stat-tile .value { font-size: 30px; font-weight: 800; }
    .stat-tile .value.accent { color: var(--primary-light); }
    .stat-tile .value.danger { color: var(--danger); }

    .grid-2 { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; align-items: start; }
    @media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }

    .section-card { padding: 22px; margin-bottom: 20px; }
    .section-card h2 { font-size: 14.5px; margin: 0 0 18px; font-weight: 700; }

    .pie-wrap { display: flex; align-items: center; gap: 28px; }
    .pie-outer { position: relative; width: 192px; height: 192px; flex: none; }
    .pie { width: 100%; height: 100%; border-radius: 50%; }
    .pie-hole {
        position: absolute; inset: 32px; border-radius: 50%; background: var(--surface);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
    }
    .pie-total { font-size: 27px; font-weight: 800; font-family: 'JetBrains Mono', monospace; }
    .pie-total-label { font-size: 11px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 3px; }
    .pie-legend { flex: 1; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 16px; min-width: 0; }
    .legend-item { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
    .legend-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
    .legend-label { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .legend-count { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--text-primary); }

    .mini-user-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .mini-user-row:last-child { border-bottom: none; }
    .mini-user-row .user-cell .name { font-size: 13px; }
    .mini-user-row .count { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; color: var(--text-secondary); }
</style>

<div class="stat-grid">
    <div class="card stat-tile">
        <div class="label">Total Users</div>
        <div class="value">{{ number_format($stats['total_users']) }}</div>
    </div>
    <div class="card stat-tile">
        <div class="label">New (7 days)</div>
        <div class="value accent">+{{ number_format($stats['new_users_7d']) }}</div>
    </div>
    <div class="card stat-tile">
        <div class="label">Suspended</div>
        <div class="value {{ $stats['suspended_users'] > 0 ? 'danger' : '' }}">{{ number_format($stats['suspended_users']) }}</div>
    </div>
    <div class="card stat-tile">
        <div class="label">Admins</div>
        <div class="value">{{ number_format($stats['admin_users']) }}</div>
    </div>
    <div class="card stat-tile">
        <div class="label">Projects</div>
        <div class="value">{{ number_format($stats['total_projects']) }}</div>
    </div>
    <div class="card stat-tile">
        <div class="label">Tracks</div>
        <div class="value">{{ number_format($stats['total_tracks']) }}</div>
    </div>
    <div class="card stat-tile">
        <div class="label">Voice Memos</div>
        <div class="value">{{ number_format($stats['total_voice_memos']) }}</div>
    </div>
    <div class="card stat-tile">
        <div class="label">Chat Messages</div>
        <div class="value">{{ number_format($stats['total_messages']) }}</div>
    </div>
    <div class="card stat-tile">
        <div class="label">Storage Used</div>
        <div class="value accent">{{ $storage['total_human'] }}</div>
    </div>
    <div class="card stat-tile">
        <div class="label">Public Projects</div>
        <div class="value">{{ number_format($stats['public_projects']) }}</div>
    </div>
    <div class="card stat-tile">
        <div class="label">Comments</div>
        <div class="value">{{ number_format($stats['total_comments']) }}</div>
    </div>
    <div class="card stat-tile">
        <div class="label">Follows</div>
        <div class="value accent">{{ number_format($stats['total_follows']) }}</div>
    </div>
</div>

<div class="grid-2">
    <div class="card section-card">
        <h2>Signups — last 14 days</h2>
        @php
            // One hue per active day rather than a single accent color — a
            // smooth sweep across the wheel so each day reads as visually
            // distinct at a glance, warm-to-cool in date order.
            $dayColors = ['#F2B673', '#F0A374', '#EE8F82', '#E67B95', '#D671AC', '#C16BC4', '#A76BD8', '#8A72E0', '#6E85E2', '#5FA0DE', '#57BAD3', '#5DCFB8', '#78DB98', '#A6DE78'];
            $activeDays = [];
            foreach ($signupSeries as $i => $day) {
                if ($day['count'] > 0) {
                    $activeDays[] = ['label' => $day['label'], 'count' => $day['count'], 'color' => $dayColors[$i % count($dayColors)]];
                }
            }
            $totalSignups = array_sum(array_column($activeDays, 'count'));
        @endphp
        @if ($totalSignups > 0)
            @php
                $gradientStops = [];
                $cursor = 0;
                foreach ($activeDays as $slice) {
                    $start = $cursor;
                    $cursor += ($slice['count'] / $totalSignups) * 360;
                    $gradientStops[] = "{$slice['color']} {$start}deg {$cursor}deg";
                }
            @endphp
            <div class="pie-wrap">
                <div class="pie-outer">
                    <div class="pie" style="background: conic-gradient({{ implode(', ', $gradientStops) }});"></div>
                    <div class="pie-hole">
                        <span class="pie-total">{{ $totalSignups }}</span>
                        <span class="pie-total-label">signups</span>
                    </div>
                </div>
                <div class="pie-legend">
                    @foreach ($activeDays as $slice)
                        <div class="legend-item">
                            <span class="legend-dot" style="background: {{ $slice['color'] }};"></span>
                            <span class="legend-label">{{ $slice['label'] }}</span>
                            <span class="legend-count">{{ $slice['count'] }}</span>
                        </div>
                    @endforeach
                </div>
            </div>
        @else
            <p style="color: var(--text-tertiary); font-size: 13px;">No signups in the last 14 days.</p>
        @endif
    </div>

    <div class="card section-card">
        <h2>Most active producers</h2>
        @forelse ($topProducers as $producer)
            <div class="mini-user-row">
                <div class="user-cell">
                    <div class="avatar-sm">{{ strtoupper(substr($producer->name, 0, 1)) }}</div>
                    <div class="name">{{ $producer->name }}</div>
                </div>
                <span class="count">{{ $producer->projects_count }} project{{ $producer->projects_count === 1 ? '' : 's' }}</span>
            </div>
        @empty
            <p style="color: var(--text-tertiary); font-size: 13px;">No projects created yet.</p>
        @endforelse
    </div>
</div>

<div class="grid-2">
    <div class="card section-card">
        <h2>Most followed producers</h2>
        @forelse ($mostFollowed as $producer)
            <div class="mini-user-row">
                <div class="user-cell">
                    <div class="avatar-sm">{{ strtoupper(substr($producer->name, 0, 1)) }}</div>
                    <div class="name">{{ $producer->name }}</div>
                </div>
                <span class="count">{{ $producer->followers_count }} follower{{ $producer->followers_count === 1 ? '' : 's' }}</span>
            </div>
        @empty
            <p style="color: var(--text-tertiary); font-size: 13px;">No one has followed another producer yet.</p>
        @endforelse
    </div>

    <div class="card section-card">
        <h2>Recent comments</h2>
        @forelse ($recentComments as $comment)
            <div class="mini-user-row" style="align-items: flex-start;">
                <div class="user-cell" style="min-width: 0;">
                    <div class="avatar-sm">{{ strtoupper(substr($comment->user->name ?? '?', 0, 1)) }}</div>
                    <div style="min-width: 0;">
                        <div class="name">{{ $comment->user->name ?? 'Unknown' }}</div>
                        <div style="font-size: 11.5px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px;">
                            "{{ $comment->body }}" on {{ $comment->project->name ?? 'a project' }}
                        </div>
                    </div>
                </div>
                <span class="count">{{ $comment->created_at->diffForHumans() }}</span>
            </div>
        @empty
            <p style="color: var(--text-tertiary); font-size: 13px;">No comments posted yet.</p>
        @endforelse
    </div>
</div>

<div class="card section-card">
    <h2>Storage breakdown</h2>
    @foreach ($storage['breakdown'] as $row)
        <div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border); font-size:13px;">
            <span style="color: var(--text-secondary);">{{ $row['label'] }} <span class="mono" style="color: var(--text-tertiary);">({{ number_format($row['count']) }})</span></span>
            <span class="mono" style="font-weight:700;">{{ $row['human'] }}</span>
        </div>
    @endforeach
</div>

<div class="card section-card">
    <h2>Recently joined</h2>
    <table>
        <thead>
            <tr><th>User</th><th>Projects</th><th>Status</th><th>Joined</th></tr>
        </thead>
        <tbody>
            @foreach ($recentUsers as $user)
                <tr onclick="window.location='{{ route('admin.users.show', $user) }}'" style="cursor:pointer">
                    <td>
                        <div class="user-cell">
                            <div class="avatar-sm">{{ strtoupper(substr($user->name, 0, 1)) }}</div>
                            <div>
                                <div class="name">{{ $user->name }}</div>
                                <div class="email">{{ $user->email }}</div>
                            </div>
                        </div>
                    </td>
                    <td class="mono">{{ $user->projects_count }}</td>
                    <td>
                        @if ($user->is_suspended)
                            <span class="badge badge-suspended">Suspended</span>
                        @elseif ($user->is_super_admin)
                            <span class="badge badge-admin">Super Admin</span>
                        @elseif ($user->is_admin)
                            <span class="badge badge-admin">Admin</span>
                        @else
                            <span class="badge badge-active">Active</span>
                        @endif
                    </td>
                    <td class="mono">{{ $user->created_at->diffForHumans() }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>
</div>
@endsection
