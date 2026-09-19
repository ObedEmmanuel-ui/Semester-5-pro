<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AdminAuditLog extends Model
{
    protected $fillable = [
        'admin_id',
        'action',
        'target_type',
        'target_id',
        'description',
        'ip_address',
    ];

    public function admin()
    {
        return $this->belongsTo(User::class, 'admin_id');
    }

    /**
     * Records one admin action against the currently-authenticated web
     * admin. Called from the admin controllers right after a sensitive
     * change succeeds (suspend/unsuspend/delete/grant-admin/moderation
     * removal) so there's a real trail of who did what, not just the
     * silent, irreversible change itself.
     */
    public static function record(string $action, ?string $targetType, ?int $targetId, string $description): void
    {
        static::create([
            'admin_id' => request()->user('web')?->id,
            'action' => $action,
            'target_type' => $targetType,
            'target_id' => $targetId,
            'description' => $description,
            'ip_address' => request()->ip(),
        ]);
    }
}
