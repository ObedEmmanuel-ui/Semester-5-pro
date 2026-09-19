<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
        ]);

        $token = $user->createToken('mobile-app')->plainTextToken;

        return response()->json([
            'user' => $user,
            'token' => $token,
            'token_type' => 'Bearer',
        ], 201);
    }

    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $user = User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if ($user->is_suspended) {
            throw ValidationException::withMessages([
                'email' => ['This account has been suspended. Contact support if you believe this is a mistake.'],
            ]);
        }

        $token = $user->createToken('mobile-app')->plainTextToken;

        return response()->json([
            'user' => $user,
            'token' => $token,
            'token_type' => 'Bearer',
        ]);
    }

    /**
     * Verifies a Google ID token (obtained on the client via expo-auth-session)
     * against Google's tokeninfo endpoint, then finds or creates a matching
     * user by their verified email and issues a normal Sanctum token — same
     * response shape as register/login, so the client treats it identically.
     */
    public function google(Request $request)
    {
        $validated = $request->validate([
            'id_token' => 'required|string',
        ]);

        $response = Http::timeout(15)->get('https://oauth2.googleapis.com/tokeninfo', [
            'id_token' => $validated['id_token'],
        ]);

        if ($response->failed()) {
            throw ValidationException::withMessages([
                'id_token' => ['Could not verify this Google sign-in. Please try again.'],
            ]);
        }

        $payload = $response->json();
        $expectedClientId = config('services.google.client_id');

        if ($expectedClientId && ($payload['aud'] ?? null) !== $expectedClientId) {
            throw ValidationException::withMessages([
                'id_token' => ['This sign-in was not issued for this app.'],
            ]);
        }

        if (($payload['email_verified'] ?? 'false') !== 'true' || empty($payload['email'])) {
            throw ValidationException::withMessages([
                'id_token' => ['Your Google account email is not verified.'],
            ]);
        }

        $user = User::firstOrCreate(
            ['email' => $payload['email']],
            [
                'name' => $payload['name'] ?? Str::before($payload['email'], '@'),
                'password' => Hash::make(Str::random(40)),
            ]
        );

        if ($user->is_suspended) {
            throw ValidationException::withMessages([
                'id_token' => ['This account has been suspended. Contact support if you believe this is a mistake.'],
            ]);
        }

        $token = $user->createToken('mobile-app')->plainTextToken;

        return response()->json([
            'user' => $user,
            'token' => $token,
            'token_type' => 'Bearer',
        ]);
    }

    /**
     * Mobile apps can't follow a mailed web link the way a browser-based
     * password reset does, so this sends a short numeric code by email
     * instead — entered back in the app alongside the new password. Always
     * responds the same way whether or not the email is registered, so the
     * endpoint can't be used to enumerate accounts.
     */
    public function forgotPassword(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
        ]);

        $user = User::where('email', $validated['email'])->first();

        if ($user) {
            $code = (string) random_int(100000, 999999);

            DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $user->email],
                ['token' => Hash::make($code), 'created_at' => now()]
            );

            Mail::raw(
                "Your MproWave password reset code is: {$code}\n\nThis code expires in 60 minutes. "
                . "If you didn't request this, you can safely ignore this email.",
                function ($message) use ($user) {
                    $message->to($user->email)->subject('Your MproWave password reset code');
                }
            );
        }

        return response()->json([
            'message' => 'If an account exists for that email, a reset code has been sent.',
        ]);
    }

    public function resetPassword(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'code' => 'required|string',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $record = DB::table('password_reset_tokens')->where('email', $validated['email'])->first();

        if (!$record || !Hash::check($validated['code'], $record->token)) {
            throw ValidationException::withMessages([
                'code' => ['This reset code is invalid.'],
            ]);
        }

        // diffInMinutes() returns a signed value (negative for a past
        // date) rather than the absolute duration — abs() it, or a code
        // over 60 minutes old would compare as "less than 60" and never
        // expire.
        if (abs(now()->diffInMinutes($record->created_at)) > 60) {
            DB::table('password_reset_tokens')->where('email', $validated['email'])->delete();
            throw ValidationException::withMessages([
                'code' => ['This reset code has expired. Request a new one.'],
            ]);
        }

        $user = User::where('email', $validated['email'])->firstOrFail();
        $user->update(['password' => Hash::make($validated['password'])]);
        DB::table('password_reset_tokens')->where('email', $validated['email'])->delete();

        // Reset invalidates every existing session — a compromised or
        // forgotten password shouldn't leave old tokens usable — then logs
        // the user straight back in on this device instead of making them
        // re-enter the password they just chose.
        $user->tokens()->delete();
        $token = $user->createToken('mobile-app')->plainTextToken;

        return response()->json([
            'user' => $user,
            'token' => $token,
            'token_type' => 'Bearer',
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'message' => 'Successfully logged out'
        ]);
    }

    public function user(Request $request)
    {
        return response()->json($request->user());
    }

    public function updateProfile(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $user = $request->user();
        $user->update($validated);

        return response()->json($user);
    }

    public function uploadAvatar(Request $request)
    {
        $request->validate([
            'avatar' => ['required', 'image', 'max:5000', 'mimes:jpeg,jpg,png,webp'],
        ]);

        $user = $request->user();

        if ($user->avatar_path) {
            Storage::disk('public')->delete($user->avatar_path);
        }

        $path = $request->file('avatar')->store('avatars', 'public');
        $user->update(['avatar_path' => $path]);

        return response()->json($user);
    }
}
