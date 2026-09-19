<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectMessage extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'user_id',
        'is_ai',
        'body',
        'voice_path',
        'voice_duration_seconds',
    ];

    protected $casts = [
        'is_ai' => 'boolean',
        'voice_duration_seconds' => 'float',
    ];

    protected $appends = ['voice_url'];

    public function getVoiceUrlAttribute()
    {
        if (!$this->voice_path) {
            return null;
        }

        $request = request();

        return $request
            ? \App\Http\Controllers\Api\StemController::absoluteStorageUrl($request, $this->voice_path)
            : null;
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
