<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectComment extends Model
{
    protected $fillable = [
        'project_id',
        'user_id',
        'body',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
