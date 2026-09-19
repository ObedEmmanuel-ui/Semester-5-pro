@extends('admin.layout')

@section('title', 'Users')
@section('subtitle', number_format($users->total()) . ' account' . ($users->total() === 1 ? '' : 's') . ' total')

@php($isSuperAdmin = auth('web')->user()?->is_super_admin)

@section('topbar-actions')
    @if ($isSuperAdmin)
        <button class="btn btn-primary" onclick="document.getElementById('add-user').open = true; document.getElementById('add-user').scrollIntoView({behavior:'smooth'});">+ Add user</button>
    @endif
@endsection

@section('content')
<style>
    .toolbar { display: flex; gap: 10px; margin-bottom: 18px; }
    .toolbar form { display: flex; gap: 10px; flex: 1; }
    .toolbar input[type=search] { max-width: 320px; }
    .filter-pill { padding: 9px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--text-secondary); background: var(--surface); border: 1px solid var(--border); }
    .filter-pill.active { background: rgba(217,142,74,0.16); color: var(--primary-light); border-color: transparent; }

    details.add-user-card { margin-bottom: 20px; }
    details.add-user-card summary { list-style: none; cursor: pointer; padding: 16px 22px; font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: space-between; }
    details.add-user-card summary::-webkit-details-marker { display: none; }
    .add-user-form { padding: 0 22px 22px; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px 16px; align-items: end; }
    .add-user-form .field { margin-bottom: 0; }
    .add-user-form .submit-cell { display: flex; }

    .row-actions { display: flex; gap: 6px; justify-content: flex-end; }
</style>

@if ($isSuperAdmin)
<div class="card add-user-card">
    <details id="add-user">
        <summary>Add a new account <span style="color: var(--text-tertiary); font-weight: 500;">▾</span></summary>
        <form method="POST" action="{{ route('admin.users.store') }}" class="add-user-form">
            @csrf
            <div class="field">
                <label>Name</label>
                <input type="text" name="name" required value="{{ old('name') }}">
            </div>
            <div class="field">
                <label>Email</label>
                <input type="email" name="email" required value="{{ old('email') }}">
            </div>
            <div class="field">
                <label>Password</label>
                <input type="password" name="password" required minlength="8">
            </div>
            <div class="field">
                <label>Confirm password</label>
                <input type="password" name="password_confirmation" required minlength="8">
            </div>
            <div class="field">
                <div class="checkbox-row" style="margin-top: 28px;">
                    <input type="checkbox" name="is_admin" id="new-is-admin" value="1">
                    <label for="new-is-admin" style="margin: 0;">Grant admin access</label>
                </div>
            </div>
            <div class="field">
                <div class="checkbox-row" style="margin-top: 28px;">
                    <input type="checkbox" name="is_super_admin" id="new-is-super-admin" value="1">
                    <label for="new-is-super-admin" style="margin: 0;">Grant super admin access</label>
                </div>
            </div>
            <div class="submit-cell">
                <button type="submit" class="btn btn-primary" style="width:100%">Create account</button>
            </div>
        </form>
    </details>
</div>
@endif

<div class="toolbar">
    <form method="GET" action="{{ route('admin.users.index') }}">
        <input type="search" name="q" placeholder="Search by name or email…" value="{{ $search }}">
        @if ($filter)
            <input type="hidden" name="filter" value="{{ $filter }}">
        @endif
        <button type="submit" class="btn btn-ghost">Search</button>
    </form>
    <a href="{{ route('admin.users.index', ['q' => $search]) }}" class="filter-pill {{ $filter === '' ? 'active' : '' }}">All</a>
    <a href="{{ route('admin.users.index', ['q' => $search, 'filter' => 'admins']) }}" class="filter-pill {{ $filter === 'admins' ? 'active' : '' }}">Admins</a>
    <a href="{{ route('admin.users.index', ['q' => $search, 'filter' => 'super_admins']) }}" class="filter-pill {{ $filter === 'super_admins' ? 'active' : '' }}">Super Admins</a>
    <a href="{{ route('admin.users.index', ['q' => $search, 'filter' => 'suspended']) }}" class="filter-pill {{ $filter === 'suspended' ? 'active' : '' }}">Suspended</a>
</div>

<div class="card">
    <table>
        <thead>
            <tr>
                <th>User</th>
                <th>Projects</th>
                <th>Status</th>
                <th>Joined</th>
                <th></th>
            </tr>
        </thead>
        <tbody>
            @forelse ($users as $user)
                <tr>
                    <td>
                        <a href="{{ route('admin.users.show', $user) }}" class="user-cell">
                            <div class="avatar-sm">{{ strtoupper(substr($user->name, 0, 1)) }}</div>
                            <div>
                                <div class="name">{{ $user->name }}</div>
                                <div class="email">{{ $user->email }}</div>
                            </div>
                        </a>
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
                    <td class="mono">{{ $user->created_at->format('M j, Y') }}</td>
                    <td>
                        <div class="row-actions">
                            <a href="{{ route('admin.users.show', $user) }}" class="btn btn-ghost btn-sm">View</a>
                            @if ($user->is_suspended)
                                <form method="POST" action="{{ route('admin.users.unsuspend', $user) }}">
                                    @csrf
                                    <button type="submit" class="btn btn-sm">Reinstate</button>
                                </form>
                            @else
                                <form method="POST" action="{{ route('admin.users.suspend', $user) }}" onsubmit="return confirm('Suspend {{ addslashes($user->name) }}? They will be signed out immediately.');">
                                    @csrf
                                    <button type="submit" class="btn btn-sm">Suspend</button>
                                </form>
                            @endif
                        </div>
                    </td>
                </tr>
            @empty
                <tr><td colspan="5"><div class="empty-state">No accounts match this search.</div></td></tr>
            @endforelse
        </tbody>
    </table>
</div>

<div class="pagination">
    {{ $users->onEachSide(1)->links('admin.partials.pagination') }}
</div>
@endsection
