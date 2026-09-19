<?php

namespace App\Policies;

use App\Models\User;
use App\Models\VoiceMemo;

class VoiceMemoPolicy
{
    public function update(User $user, VoiceMemo $memo)
    {
        return $user->id === $memo->user_id;
    }

    public function delete(User $user, VoiceMemo $memo)
    {
        return $user->id === $memo->user_id;
    }
}
