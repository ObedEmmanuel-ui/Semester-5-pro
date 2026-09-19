@extends('admin.layout')

@section('title', $user->name)
@section('subtitle', $user->email)

@section('topbar-actions')
    <a href="{{ route('admin.users.index') }}" class="btn btn-ghost">← Back to users</a>
@endsection

@php($isSuperAdmin = auth('web')->user()?->is_super_admin)

@section('content')
<style>
    .grid-2 { display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px; align-items: start; }
    @media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }
    .section-card { padding: 22px; margin-bottom: 20px; }
    .section-card h2 { font-size: 14.5px; margin: 0 0 18px; font-weight: 700; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
    .detail-row:last-child { border-bottom: none; }
    .detail-row .k { color: var(--text-tertiary); }
    .detail-row .v { font-weight: 600; }
    .danger-zone { border-color: rgba(193,73,90,0.3); }
    .danger-zone h2 { color: var(--danger); }
    .action-row { display: flex; gap: 10px; margin-top: 4px; }
    .project-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border); }
    .project-row:last-child { border-bottom: none; }
    .project-name { font-weight: 600; font-size: 13.5px; }
    .project-meta { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
</style>

<div class="grid-2">
    <div>
        <div class="card section-card">
            <h2>Account details</h2>
            <form method="POST" action="{{ route('admin.users.update', $user) }}">
                @csrf
                @method('PUT')
                <div class="field">
                    <label>Name</label>
                    <input type="text" name="name" value="{{ old('name', $user->name) }}" required>
                </div>
                <div class="field">
                    <label>Email</label>
                    <input type="email" name="email" value="{{ old('email', $user->email) }}" required>
                </div>
                @if ($isSuperAdmin)
                    <div class="field">
                        <div class="checkbox-row">
                            <input type="checkbox" name="is_admin" id="is-admin" value="1" {{ $user->is_admin ? 'checked' : '' }} {{ $user->is_super_admin ? 'disabled' : '' }}>
                            <label for="is-admin" style="margin:0;">Admin access</label>
                        </div>
                    </div>
                    <div class="field">
                        <div class="checkbox-row">
                            <input type="checkbox" name="is_super_admin" id="is-super-admin" value="1" {{ $user->is_super_admin ? 'checked' : '' }}>
                            <label for="is-super-admin" style="margin:0;">Super admin access</label>
                        </div>
                    </div>
                @else
                    <div class="field">
                        <div class="checkbox-row">
                            @if ($user->is_super_admin)
                                <span class="badge badge-admin">Super Admin</span>
                            @elseif ($user->is_admin)
                                <span class="badge badge-admin">Admin</span>
                            @else
                                <span class="badge badge-active">Regular user</span>
                            @endif
                            <span style="color: var(--text-tertiary); font-size: 12px;">— only a super admin can change access level</span>
                        </div>
                    </div>
                @endif
                <button type="submit" class="btn btn-primary">Save changes</button>
            </form>
        </div>

        <div class="card section-card">
            <h2>Status</h2>
            <div class="detail-row"><span class="k">Account status</span><span class="v">
                @if ($user->is_suspended)
                    <span class="badge badge-suspended">Suspended</span>
                @else
                    <span class="badge badge-active">Active</span>
                @endif
            </span></div>
            <div class="detail-row"><span class="k">Joined</span><span class="v mono">{{ $user->created_at->format('M j, Y \a\t g:i A') }}</span></div>
            <div class="detail-row"><span class="k">Projects</span><span class="v mono">{{ $user->projects->count() }}</span></div>
            <div class="detail-row"><span class="k">Tracks</span><span class="v mono">{{ $user->projects->sum('tracks_count') }}</span></div>

            <div class="action-row" style="margin-top: 16px;">
                @if ($user->is_suspended)
                    <form method="POST" action="{{ route('admin.users.unsuspend', $user) }}" style="flex:1">
                        @csrf
                        <button type="submit" class="btn" style="width:100%">Reinstate account</button>
                    </form>
                @else
                    <form method="POST" action="{{ route('admin.users.suspend', $user) }}" style="flex:1" onsubmit="return confirm('Suspend {{ addslashes($user->name) }}? They will be signed out immediately.');">
                        @csrf
                        <button type="submit" class="btn" style="width:100%">Suspend account</button>
                    </form>
                @endif
            </div>
        </div>

        @if ($isSuperAdmin)
        <div class="card section-card danger-zone">
            <h2>Danger zone</h2>
            <p style="color: var(--text-secondary); font-size: 13px; margin-top: 0;">
                Permanently deletes this account along with every project and track they own. This cannot be undone.
            </p>
            <form method="POST" action="{{ route('admin.users.destroy', $user) }}" onsubmit="return confirm('Permanently delete {{ addslashes($user->name) }} and all their projects? This cannot be undone.');">
                @csrf
                @method('DELETE')
                <button type="submit" class="btn btn-danger">Delete account</button>
            </form>
        </div>
        @endif
    </div>

    <div class="card section-card">
        <h2>Projects ({{ $user->projects->count() }})</h2>
        @forelse ($user->projects as $project)
            <div class="project-row">
                <div>
                    <div class="project-name">{{ $project->name }}</div>
                    <div class="project-meta">{{ $project->bpm }} BPM · {{ $project->key }} · {{ $project->time_signature }} · created {{ $project->created_at->diffForHumans() }}</div>
                </div>
                <span class="mono" style="color: var(--text-secondary); font-size: 12.5px;">{{ $project->tracks_count }} track{{ $project->tracks_count === 1 ? '' : 's' }}</span>
            </div>
        @empty
            <div class="empty-state" style="padding: 30px 0;">No projects yet.</div>
        @endforelse
    </div>
</div>
@endsection
