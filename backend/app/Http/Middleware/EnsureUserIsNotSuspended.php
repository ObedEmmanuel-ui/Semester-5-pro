<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserIsNotSuspended
{
    /**
     * Blocks every authenticated API request from a suspended account, not
     * just fresh logins — an admin suspending someone mid-session should cut
     * off their existing token immediately rather than waiting for it to
     * expire or for them to log in again.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->is_suspended) {
            return response()->json([
                'message' => 'This account has been suspended. Contact support if you believe this is a mistake.',
            ], 403);
        }

        return $next($request);
    }
}
