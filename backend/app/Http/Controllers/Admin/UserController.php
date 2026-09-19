<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminAuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $query = User::withCount('projects');

        if ($search = $request->string('q')->trim()->value()) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        match ($request->get('filter')) {
            'admins' => $query->where('is_admin', true),
            'super_admins' => $query->where('is_super_admin', true),
            'suspended' => $query->where('is_suspended', true),
            default => null,
        };

        $users = $query->latest()->paginate(20)->withQueryString();

        return view('admin.users.index', [
            'users' => $users,
            'search' => $search ?? '',
            'filter' => $request->get('filter', ''),
        ]);
    }

    public function show(User $user)
    {
        $user->load(['projects' => fn ($q) => $q->withCount('tracks')->latest()]);

        return view('admin.users.show', compact('user'));
    }

    /**
     * Account creation is super-admin-only (route-gated) — a regular admin
     * could otherwise create a fresh admin account for themselves with no
     * one else's approval.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email',
            'password' => ['required', 'confirmed', Password::defaults()],
            'is_admin' => 'sometimes|boolean',
            'is_super_admin' => 'sometimes|boolean',
        ]);

        $isSuperAdmin = $request->boolean('is_super_admin');

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            // A super admin is definitionally also an admin.
            'is_admin' => $request->boolean('is_admin') || $isSuperAdmin,
            'is_super_admin' => $isSuperAdmin,
        ]);

        AdminAuditLog::record(
            'user.created',
            'user',
            $user->id,
            "Created account \"{$user->name}\" ({$user->email})" . ($user->is_admin ? ' with admin access' : '')
        );

        return redirect()->route('admin.users.show', $user)->with('status', "Account \"{$user->name}\" created.");
    }

    /**
     * Name/email are editable by any admin. Changing is_admin/is_super_admin
     * requires the acting user to already be a super admin — enforced here
     * (not just hidden in the form) so a hand-crafted request can't grant
     * access a regular admin isn't allowed to hand out.
     */
    public function update(Request $request, User $user)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'is_admin' => 'sometimes|boolean',
            'is_super_admin' => 'sometimes|boolean',
        ]);

        $actingUser = $request->user('web');
        $wantsAdmin = $request->boolean('is_admin');
        $wantsSuperAdmin = $request->boolean('is_super_admin');

        $changingAccessLevel = $wantsAdmin !== $user->is_admin || $wantsSuperAdmin !== $user->is_super_admin;
        abort_if($changingAccessLevel && !$actingUser->is_super_admin, 403, 'Only a super admin can change admin access.');

        $update = [
            'name' => $validated['name'],
            'email' => $validated['email'],
        ];

        if ($actingUser->is_super_admin) {
            // A super admin is definitionally also an admin — revoking
            // is_admin while leaving is_super_admin set would be incoherent.
            $update['is_admin'] = $wantsAdmin || $wantsSuperAdmin;
            $update['is_super_admin'] = $wantsSuperAdmin;
        }

        $user->update($update);

        if ($changingAccessLevel) {
            AdminAuditLog::record(
                'user.access_changed',
                'user',
                $user->id,
                "Set access for \"{$user->name}\" to " .
                    ($update['is_super_admin'] ?? $user->is_super_admin
                        ? 'Super Admin'
                        : (($update['is_admin'] ?? $user->is_admin) ? 'Admin' : 'Regular user'))
            );
        }

        return redirect()->route('admin.users.show', $user)->with('status', 'Account details updated.');
    }

    public function suspend(Request $request, User $user)
    {
        $this->preventSelfAction($request, $user, 'suspend your own account');

        $user->update(['is_suspended' => true, 'suspended_at' => now()]);

        // Suspension should cut off access immediately, not just block future
        // logins — revoke every Sanctum token issued to the mobile app.
        $user->tokens()->delete();

        AdminAuditLog::record('user.suspended', 'user', $user->id, "Suspended \"{$user->name}\" ({$user->email})");

        return back()->with('status', "\"{$user->name}\" has been suspended.");
    }

    public function unsuspend(Request $request, User $user)
    {
        $user->update(['is_suspended' => false, 'suspended_at' => null]);

        AdminAuditLog::record('user.unsuspended', 'user', $user->id, "Reinstated \"{$user->name}\" ({$user->email})");

        return back()->with('status', "\"{$user->name}\" has been reinstated.");
    }

    /**
     * Deletion is super-admin-only (route-gated) — deleting an account is
     * irreversible (cascades to every project/track they own), and a
     * regular admin removing another admin's account is exactly the kind
     * of action this tier split exists to prevent.
     */
    public function destroy(Request $request, User $user)
    {
        $this->preventSelfAction($request, $user, 'delete your own account');

        $name = $user->name;
        $email = $user->email;
        $user->delete();

        AdminAuditLog::record('user.deleted', 'user', $user->id, "Deleted account \"{$name}\" ({$email}) and all their projects");

        return redirect()->route('admin.users.index')->with('status', "\"{$name}\" and all of their projects have been deleted.");
    }

    protected function preventSelfAction(Request $request, User $user, string $action): void
    {
        abort_if($request->user('web')->is($user), 403, "You can't {$action} from here.");
    }
}
