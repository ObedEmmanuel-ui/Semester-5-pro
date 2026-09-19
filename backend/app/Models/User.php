<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'role',
        'email',
        'password',
        'avatar_path',
        'is_admin',
        'is_super_admin',
        'is_suspended',
        'suspended_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'suspended_at' => 'datetime',
        'password' => 'hashed',
        'is_admin' => 'boolean',
        'is_super_admin' => 'boolean',
        'is_suspended' => 'boolean',
    ];

    // Same pattern as Track's audio_playback_url: avatar_path stays the
    // raw relative storage path for internal use, this appended field is
    // the absolute, host-correct URL clients actually load.
    protected $appends = ['avatar_url'];

    public function getAvatarUrlAttribute()
    {
        if (!$this->avatar_path) {
            return null;
        }

        $request = request();

        return $request
            ? \App\Http\Controllers\Api\StemController::absoluteStorageUrl($request, $this->avatar_path)
            : null;
    }

    public function projects()
    {
        return $this->hasMany(Project::class);
    }

    public function voiceMemos()
    {
        return $this->hasMany(VoiceMemo::class);
    }

    public function notifications()
    {
        return $this->hasMany(Notification::class);
    }

    /** Users who follow this user. */
    public function followers()
    {
        return $this->belongsToMany(User::class, 'follows', 'followed_id', 'follower_id')->withTimestamps();
    }

    /** Users this user follows. */
    public function following()
    {
        return $this->belongsToMany(User::class, 'follows', 'follower_id', 'followed_id')->withTimestamps();
    }

    public function isFollowing(User $user): bool
    {
        return $this->following()->where('followed_id', $user->id)->exists();
    }
}
