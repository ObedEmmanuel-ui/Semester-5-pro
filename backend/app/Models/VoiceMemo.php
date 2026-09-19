<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class VoiceMemo extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'name',
        'audio_path',
        'duration_seconds',
        'favorite',
    ];

    protected $casts = [
        'duration_seconds' => 'float',
        'favorite' => 'boolean',
    ];

    // Same "raw path stays internal, appended attribute is the real URL"
    // pattern as Track::audio_playback_url / User::avatar_url.
    protected $appends = ['audio_url'];

    public function getAudioUrlAttribute()
    {
        if (!$this->audio_path) {
            return null;
        }

        $request = request();

        return $request
            ? \App\Http\Controllers\Api\StemController::absoluteStorageUrl($request, $this->audio_path)
            : null;
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
