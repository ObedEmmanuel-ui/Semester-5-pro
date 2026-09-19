@extends('admin.layout')

@section('title', 'Announcements')
@section('subtitle', number_format($announcements->total()) . ' posted · every user sees these in the app')

@section('content')
<style>
    .announce-form { padding: 22px; margin-bottom: 20px; }
    .announce-form h2 { font-size: 14.5px; margin: 0 0 16px; font-weight: 700; }
    textarea {
        width: 100%;
        background: var(--input-bg);
        border: 1px solid var(--border);
        color: var(--text-primary);
        border-radius: 8px;
        padding: 10px 12px;
        font-family: inherit;
        font-size: 13.5px;
        resize: vertical;
        min-height: 90px;
    }
    textarea:focus { outline: 2px solid var(--primary); outline-offset: 1px; }

    .announce-card { padding: 18px 20px; margin-bottom: 14px; display: flex; gap: 14px; align-items: flex-start; }
    .announce-icon {
        width: 36px; height: 36px; border-radius: 10px; flex: none;
        background: rgba(217,142,74,0.16); color: var(--primary-light);
        display: flex; align-items: center; justify-content: center;
    }
    .announce-body { flex: 1; min-width: 0; }
    .announce-title-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .announce-title { font-size: 14.5px; font-weight: 700; color: var(--text-primary); }
    .announce-meta { font-size: 11.5px; color: var(--text-tertiary); margin-top: 2px; }
    .announce-text { font-size: 13.5px; color: var(--text-secondary); margin-top: 8px; line-height: 1.5; white-space: pre-wrap; }
    .delete-btn { background: none; border: none; cursor: pointer; color: var(--text-tertiary); padding: 4px; border-radius: 6px; }
    .delete-btn:hover { color: var(--danger); background: var(--danger-bg); }
</style>

<div class="card announce-form">
    <h2>Post a new announcement</h2>
    <form method="POST" action="{{ route('admin.announcements.store') }}">
        @csrf
        <div class="field">
            <label>Title</label>
            <input type="text" name="title" required maxlength="255" value="{{ old('title') }}" placeholder="e.g. Scheduled maintenance tonight">
        </div>
        <div class="field">
            <label>Message</label>
            <textarea name="body" required maxlength="4000" placeholder="What should every user know?">{{ old('body') }}</textarea>
        </div>
        <button type="submit" class="btn btn-primary">Post to all users</button>
    </form>
</div>

@forelse ($announcements as $announcement)
    <div class="card announce-card">
        <div class="announce-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4.5h13l3 3v9l-3 3H4z"/><path d="M9 9.5h7M9 13.5h5"/></svg>
        </div>
        <div class="announce-body">
            <div class="announce-title-row">
                <div>
                    <div class="announce-title">{{ $announcement->title }}</div>
                    <div class="announce-meta">
                        {{ $announcement->created_at->format('M j, Y \a\t g:i A') }}
                        @if ($announcement->author)
                            · by {{ $announcement->author->name }}
                        @endif
                    </div>
                </div>
                <form method="POST" action="{{ route('admin.announcements.destroy', $announcement) }}" onsubmit="return confirm('Remove this announcement? Users will no longer see it.');">
                    @csrf
                    @method('DELETE')
                    <button type="submit" class="delete-btn" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>
                    </button>
                </form>
            </div>
            <div class="announce-text">{{ $announcement->body }}</div>
        </div>
    </div>
@empty
    <div class="card"><div class="empty-state">No announcements posted yet.</div></div>
@endforelse

<div class="pagination">
    {{ $announcements->onEachSide(1)->links('admin.partials.pagination') }}
</div>
@endsection
