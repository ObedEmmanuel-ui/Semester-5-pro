<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;

class FollowController extends Controller
{
    public function store(Request $request, User $user)
    {
        abort_if($request->user()->id === $user->id, 422, "You can't follow yourself.");

        $request->user()->following()->syncWithoutDetaching([$user->id]);

        return response()->json([
            'following' => true,
            'follower_count' => $user->followers()->count(),
        ]);
    }

    public function destroy(Request $request, User $user)
    {
        $request->user()->following()->detach($user->id);

        return response()->json([
            'following' => false,
            'follower_count' => $user->followers()->count(),
        ]);
    }

    public function followers(Request $request, User $user)
    {
        $followers = $user->followers()
            ->select('users.id', 'users.name', 'users.avatar_path', 'users.role')
            ->paginate(30);

        $this->markFollowingState($request, $followers->items());

        return response()->json($followers);
    }

    public function following(Request $request, User $user)
    {
        $following = $user->following()
            ->select('users.id', 'users.name', 'users.avatar_path', 'users.role')
            ->paginate(30);

        $this->markFollowingState($request, $following->items());

        return response()->json($following);
    }

    /**
     * Flags each listed user with whether the requesting user already
     * follows them, so the mobile list can render the right Follow/
     * Following button state without a separate round trip per row.
     */
    protected function markFollowingState(Request $request, array $users): void
    {
        $followingIds = $request->user()->following()->pluck('users.id')->all();

        foreach ($users as $user) {
            $user->is_following = in_array($user->id, $followingIds, true);
        }
    }
}
