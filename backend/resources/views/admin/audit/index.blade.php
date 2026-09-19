@extends('admin.layout')

@section('title', 'Audit Log')
@section('subtitle', 'Every sensitive admin action — who did what, and when')

@section('content')
<div class="card">
    <table>
        <thead>
            <tr>
                <th>When</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Details</th>
                <th>IP</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($logs as $log)
                <tr>
                    <td class="mono" style="white-space: nowrap;">{{ $log->created_at->format('M j, Y g:i A') }}</td>
                    <td>{{ $log->admin?->name ?? 'Deleted admin' }}</td>
                    <td><span class="badge badge-admin">{{ $log->action }}</span></td>
                    <td>{{ $log->description }}</td>
                    <td class="mono" style="color: var(--text-tertiary); font-size: 12px;">{{ $log->ip_address }}</td>
                </tr>
            @empty
                <tr><td colspan="5"><div class="empty-state">No admin actions recorded yet.</div></td></tr>
            @endforelse
        </tbody>
    </table>
</div>

<div class="pagination">
    {{ $logs->onEachSide(1)->links('admin.partials.pagination') }}
</div>
@endsection
