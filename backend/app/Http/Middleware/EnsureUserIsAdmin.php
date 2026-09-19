<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserIsAdmin
{
    /**
     * Gates every /admin route behind a logged-in, non-suspended account
     * flagged is_admin — a regular MproWave user (even with a valid web
     * session) never sees anything under here.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user('web');

        if (!$user || !$user->is_admin || $user->is_suspended) {
            auth('web')->logout();

            return redirect()->route('admin.login')->withErrors([
                'email' => 'Admin access required.',
            ]);
        }

        return $next($request);
    }
}
