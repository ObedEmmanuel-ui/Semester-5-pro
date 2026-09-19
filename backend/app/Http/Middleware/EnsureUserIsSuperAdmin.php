<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Stacks on top of the 'admin' middleware for the small set of routes only
 * a super admin may reach: creating/deleting accounts, granting or revoking
 * admin/super-admin access, and viewing the audit log. A regular admin
 * hitting one of these gets a plain 403 rather than being logged out (they
 * still have a valid admin session, just not this level of access).
 */
class EnsureUserIsSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless($request->user('web')?->is_super_admin, 403, 'Super admin access required.');

        return $next($request);
    }
}
