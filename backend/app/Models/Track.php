<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Track extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'name',
        'type',
        'audio_url',
        'waveform_peaks',
        'midi_data',
        'volume',
        'pan',
        'muted',
        'solo',
        'effects',
        'position',
        'favorite',
    ];

    protected $casts = [
        'midi_data' => 'array',
        'waveform_peaks' => 'array',
        'effects' => 'array',
        'volume' => 'float',
        'pan' => 'float',
        'muted' => 'boolean',
        'solo' => 'boolean',
        'position' => 'integer',
        'favorite' => 'boolean',
    ];

    // 'audio_url' is deliberately kept as the raw relative storage path
    // (e.g. "tracks/xyz.wav") everywhere in the backend — TrackController,
    // ProjectExportController, StemController etc. all resolve it via
    // Storage::disk('public') themselves. This appended field is the one
    // clients should actually play/download: an absolute URL built fresh
    // per-request against whatever host the client used to reach the API,
    // computed here rather than baked into audio_url itself so nothing
    // that reads the raw path breaks.
    protected $appends = ['audio_playback_url'];

    public function getAudioPlaybackUrlAttribute()
    {
        if (!$this->audio_url) {
            return null;
        }

        $request = request();

        return $request
            ? \App\Http\Controllers\Api\StemController::absoluteStorageUrl($request, $this->audio_url)
            : null;
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }
}
