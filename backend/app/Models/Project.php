<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Project extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'name',
        'genre',
        'status',
        'is_public',
        'due_date',
        'bpm',
        'key',
        'time_signature',
        'settings',
    ];

    protected $casts = [
        'settings' => 'array',
        'bpm' => 'integer',
        'is_public' => 'boolean',
        'due_date' => 'date',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function tracks()
    {
        return $this->hasMany(Track::class);
    }

    public function messages()
    {
        return $this->hasMany(ProjectMessage::class);
    }

    public function comments()
    {
        return $this->hasMany(ProjectComment::class);
    }
}
