<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GoogleAuthTest extends TestCase
{
    use RefreshDatabase;

    private function fakeGoogleToken(array $overrides = []): void
    {
        Http::fake([
            'oauth2.googleapis.com/tokeninfo*' => Http::response(array_merge([
                'aud' => 'test-client-id',
                'email' => 'ada@example.com',
                'email_verified' => 'true',
                'name' => 'Ada Lovelace',
                'sub' => '1234567890',
            ], $overrides)),
        ]);
    }

    public function test_a_new_user_is_created_from_a_valid_google_token(): void
    {
        $this->fakeGoogleToken();

        $response = $this->postJson('/api/auth/google', ['id_token' => 'fake-token']);

        $response->assertOk()->assertJsonStructure(['user' => ['id', 'name', 'email'], 'token', 'token_type']);
        $this->assertDatabaseHas('users', ['email' => 'ada@example.com', 'name' => 'Ada Lovelace']);
    }

    public function test_signing_in_again_with_the_same_email_reuses_the_existing_user(): void
    {
        $existing = User::factory()->create(['email' => 'ada@example.com']);
        $this->fakeGoogleToken();

        $response = $this->postJson('/api/auth/google', ['id_token' => 'fake-token']);

        $response->assertOk()->assertJsonPath('user.id', $existing->id);
        $this->assertSame(1, User::where('email', 'ada@example.com')->count());
    }

    public function test_an_unverified_email_is_rejected(): void
    {
        $this->fakeGoogleToken(['email_verified' => 'false']);

        $this->postJson('/api/auth/google', ['id_token' => 'fake-token'])
            ->assertUnprocessable();
    }

    public function test_a_token_issued_for_a_different_client_is_rejected(): void
    {
        config(['services.google.client_id' => 'expected-client-id']);
        $this->fakeGoogleToken(['aud' => 'some-other-client-id']);

        $this->postJson('/api/auth/google', ['id_token' => 'fake-token'])
            ->assertUnprocessable();
    }

    public function test_an_unparseable_token_is_rejected(): void
    {
        Http::fake(['oauth2.googleapis.com/tokeninfo*' => Http::response(['error' => 'invalid_token'], 400)]);

        $this->postJson('/api/auth/google', ['id_token' => 'not-a-real-token'])
            ->assertUnprocessable();
    }
}
