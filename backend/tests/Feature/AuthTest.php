<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_register_and_receives_a_token(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Ada Lovelace',
            'email' => 'ada@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertCreated()
            ->assertJsonStructure(['user' => ['id', 'name', 'email'], 'token', 'token_type']);

        $this->assertDatabaseHas('users', ['email' => 'ada@example.com']);
    }

    public function test_registration_requires_matching_password_confirmation(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Ada Lovelace',
            'email' => 'ada@example.com',
            'password' => 'password123',
            'password_confirmation' => 'nope',
        ]);

        $response->assertUnprocessable()->assertJsonValidationErrors('password');
    }

    public function test_a_user_can_login_with_correct_credentials(): void
    {
        $user = User::factory()->create(['password' => bcrypt('password123')]);

        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
        ]);

        $response->assertOk()->assertJsonStructure(['user', 'token', 'token_type']);
    }

    public function test_login_fails_with_incorrect_password(): void
    {
        $user = User::factory()->create(['password' => bcrypt('password123')]);

        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ]);

        $response->assertUnprocessable();
    }

    public function test_a_guest_cannot_access_the_authenticated_user_endpoint(): void
    {
        $this->getJson('/api/auth/user')->assertUnauthorized();
    }

    public function test_an_authenticated_user_can_fetch_their_profile_and_logout(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/auth/user')
            ->assertOk()
            ->assertJsonFragment(['email' => $user->email]);

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/auth/logout')
            ->assertOk();
    }

    public function test_forgot_password_always_responds_the_same_regardless_of_whether_the_email_exists(): void
    {
        Mail::fake();
        User::factory()->create(['email' => 'known@example.com']);

        $known = $this->postJson('/api/auth/forgot-password', ['email' => 'known@example.com']);
        $unknown = $this->postJson('/api/auth/forgot-password', ['email' => 'nobody@example.com']);

        $known->assertOk();
        $unknown->assertOk();
        $this->assertSame($known->json('message'), $unknown->json('message'));
        $this->assertDatabaseHas('password_reset_tokens', ['email' => 'known@example.com']);
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => 'nobody@example.com']);
    }

    public function test_a_user_can_reset_their_password_with_a_valid_code(): void
    {
        $user = User::factory()->create(['email' => 'reset-me@example.com']);
        DB::table('password_reset_tokens')->insert([
            'email' => $user->email,
            'token' => Hash::make('123456'),
            'created_at' => now(),
        ]);

        $response = $this->postJson('/api/auth/reset-password', [
            'email' => $user->email,
            'code' => '123456',
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

        $response->assertOk()->assertJsonStructure(['user', 'token', 'token_type']);
        $this->assertTrue(Hash::check('new-password-123', $user->fresh()->password));
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);

        // Logging in with the new password should now work.
        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'new-password-123',
        ])->assertOk();
    }

    public function test_reset_password_rejects_an_incorrect_code(): void
    {
        $user = User::factory()->create();
        DB::table('password_reset_tokens')->insert([
            'email' => $user->email,
            'token' => Hash::make('123456'),
            'created_at' => now(),
        ]);

        $this->postJson('/api/auth/reset-password', [
            'email' => $user->email,
            'code' => '999999',
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ])->assertUnprocessable();
    }

    public function test_reset_password_rejects_an_expired_code(): void
    {
        $user = User::factory()->create();
        DB::table('password_reset_tokens')->insert([
            'email' => $user->email,
            'token' => Hash::make('123456'),
            'created_at' => now()->subMinutes(61),
        ]);

        $this->postJson('/api/auth/reset-password', [
            'email' => $user->email,
            'code' => '123456',
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ])->assertUnprocessable();
    }

    public function test_a_user_can_update_their_name(): void
    {
        $user = User::factory()->create(['name' => 'Old Name']);

        $this->actingAs($user)
            ->putJson('/api/auth/profile', ['name' => 'New Name'])
            ->assertOk()
            ->assertJsonFragment(['name' => 'New Name']);

        $this->assertSame('New Name', $user->fresh()->name);
    }

    public function test_updating_the_profile_requires_a_name(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/auth/profile', ['name' => ''])
            ->assertUnprocessable();
    }

    public function test_a_guest_cannot_update_a_profile(): void
    {
        $this->putJson('/api/auth/profile', ['name' => 'New Name'])->assertUnauthorized();
    }

    /**
     * UploadedFile::fake()->image() needs the GD extension to generate
     * pixel data, which isn't installed in this environment — a real
     * (if 1x1) PNG's own file signature is enough for the `image`
     * validation rule (which sniffs real file content, not just the
     * extension) without needing GD at all.
     */
    private function fakePngUpload(string $name): UploadedFile
    {
        $onePixelPng = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
        );

        return UploadedFile::fake()->createWithContent($name, $onePixelPng);
    }

    public function test_a_user_can_upload_an_avatar(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/auth/avatar', ['avatar' => $this->fakePngUpload('avatar.png')]);

        $response->assertOk();
        $this->assertNotNull($user->fresh()->avatar_path);
        $this->assertNotNull($response->json('avatar_url'));
        Storage::disk('public')->assertExists($user->fresh()->avatar_path);
    }

    public function test_uploading_a_new_avatar_replaces_and_deletes_the_old_one(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/auth/avatar', ['avatar' => $this->fakePngUpload('first.png')]);
        $firstPath = $user->fresh()->avatar_path;

        $this->actingAs($user)->postJson('/api/auth/avatar', ['avatar' => $this->fakePngUpload('second.png')]);

        $secondPath = $user->fresh()->avatar_path;
        $this->assertNotSame($firstPath, $secondPath);
        Storage::disk('public')->assertMissing($firstPath);
        Storage::disk('public')->assertExists($secondPath);
    }

    public function test_avatar_upload_rejects_a_non_image_file(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/auth/avatar', ['avatar' => UploadedFile::fake()->create('doc.pdf', 100)])
            ->assertUnprocessable();
    }
}
