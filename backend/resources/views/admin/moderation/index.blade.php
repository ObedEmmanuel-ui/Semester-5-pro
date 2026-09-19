@extends('admin.layout')

@section('title', 'Moderation')
@section('subtitle', 'Review and remove public comments, chat messages, and voice memos')

@section('content')
<style>
    .mod-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border); gap: 16px; }
    .mod-row:last-child { border-bottom: none; }
    .mod-body { min-width: 0; flex: 1; }
    .mod-meta { font-size: 12px; color: var(--text-tertiary); margin-top: 3px; }
    .mod-text { font-size: 13.5px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 520px; }
    .section-card { padding: 22px; margin-bottom: 20px; }
    .section-card h2 { font-size: 14.5px; margin: 0 0 6px; font-weight: 700; }
    .section-card .count { color: var(--text-tertiary); font-size: 12.5px; margin-bottom: 14px; }
</style>

<div class="card section-card">
    <h2>Public comments</h2>
    <div class="count">{{ number_format($comments->total()) }} comment{{ $comments->total() === 1 ? '' : 's' }} on shared projects — visible to every producer on Discover</div>

    @forelse ($comments as $comment)
        <div class="mod-row">
            <div class="mod-body">
                <div class="mod-text">{{ $comment->body }}</div>
                <div class="mod-meta">
                    {{ $comment->user?->name ?? 'Unknown user' }}
                    on "{{ $comment->project?->name ?? 'Deleted project' }}"
                    (owned by {{ $comment->project?->user?->name ?? 'Unknown' }}) · {{ $comment->created_at->diffForHumans() }}
                </div>
            </div>
            <form method="POST" action="{{ route('admin.moderation.comments.destroy', $comment) }}" onsubmit="return confirm('Remove this comment?');">
                @csrf
                @method('DELETE')
                <button type="submit" class="btn btn-danger btn-sm">Remove</button>
            </form>
        </div>
    @empty
        <div class="empty-state">No comments yet.</div>
    @endforelse

    <div class="pagination">
        {{ $comments->onEachSide(1)->links('admin.partials.pagination') }}
    </div>
</div>

<div class="card section-card">
    <h2>Chat messages</h2>
    <div class="count">{{ number_format($messages->total()) }} message{{ $messages->total() === 1 ? '' : 's' }} across every project</div>

    @forelse ($messages as $message)
        <div class="mod-row">
            <div class="mod-body">
                @if ($message->is_ai)
                    <div class="mod-text">🤖 MproWave AI · {{ $message->body }}</div>
                @elseif ($message->voice_url)
                    <div class="mod-text">🎤 Voice message{{ $message->voice_duration_seconds ? ' · ' . round($message->voice_duration_seconds) . 's' : '' }}</div>
                @else
                    <div class="mod-text">{{ $message->body }}</div>
                @endif
                <div class="mod-meta">
                    {{ $message->is_ai ? 'AI reply' : ($message->user?->name ?? 'Unknown user') }}
                    in "{{ $message->project?->name ?? 'Deleted project' }}" · {{ $message->created_at->diffForHumans() }}
                </div>
            </div>
            <form method="POST" action="{{ route('admin.moderation.messages.destroy', $message) }}" onsubmit="return confirm('Remove this message?');">
                @csrf
                @method('DELETE')
                <button type="submit" class="btn btn-danger btn-sm">Remove</button>
            </form>
        </div>
    @empty
        <div class="empty-state">No chat messages yet.</div>
    @endforelse

    <div class="pagination">
        {{ $messages->onEachSide(1)->links('admin.partials.pagination') }}
    </div>
</div>

<div class="card section-card">
    <h2>Voice memos</h2>
    <div class="count">{{ number_format($voiceMemos->total()) }} memo{{ $voiceMemos->total() === 1 ? '' : 's' }} across every account</div>

    @forelse ($voiceMemos as $memo)
        <div class="mod-row">
            <div class="mod-body">
                <div class="mod-text">🎙️ {{ $memo->name }}{{ $memo->duration_seconds ? ' · ' . round($memo->duration_seconds) . 's' : '' }}</div>
                <div class="mod-meta">{{ $memo->user?->name ?? 'Unknown user' }} · {{ $memo->created_at->diffForHumans() }}</div>
            </div>
            <form method="POST" action="{{ route('admin.moderation.voice-memos.destroy', $memo) }}" onsubmit="return confirm('Remove this voice memo?');">
                @csrf
                @method('DELETE')
                <button type="submit" class="btn btn-danger btn-sm">Remove</button>
            </form>
        </div>
    @empty
        <div class="empty-state">No voice memos yet.</div>
    @endforelse

    <div class="pagination">
        {{ $voiceMemos->onEachSide(1)->links('admin.partials.pagination') }}
    </div>
</div>
@endsection
