<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AIGenerationTest extends TestCase
{
    use RefreshDatabase;

    public function test_midi_generation_falls_back_to_a_procedural_pattern_when_deepseek_is_unavailable(): void
    {
        Http::fake(['api.deepseek.com/*' => Http::response(['error' => 'unauthorized'], 401)]);

        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/ai/generate-midi', [
            'prompt' => 'a happy melody',
            'key' => 'C',
        ]);

        $response->assertOk()->assertJsonPath('source', 'fallback');
        $this->assertNotEmpty($response->json('midi_data'));
    }

    public function test_midi_generation_uses_the_ai_response_when_deepseek_succeeds(): void
    {
        Http::fake(['api.deepseek.com/*' => Http::response([
            'choices' => [
                ['message' => ['content' => '[{"note":"C4","start":0,"duration":0.5,"velocity":80}]']],
            ],
        ])]);

        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/ai/generate-midi', [
            'prompt' => 'a happy melody',
        ]);

        $response->assertOk()->assertJsonPath('source', 'ai');
        $this->assertSame(
            [['note' => 'C4', 'start' => 0, 'duration' => 0.5, 'velocity' => 80]],
            $response->json('midi_data')
        );
    }

    public function test_instrument_generation_returns_notes_for_every_supported_instrument(): void
    {
        Http::fake(['api.deepseek.com/*' => Http::response(['error' => 'unauthorized'], 401)]);

        $user = User::factory()->create();

        foreach (['piano', 'bass', 'guitar', 'synth', 'strings'] as $instrument) {
            $response = $this->actingAs($user)->postJson('/api/ai/generate-instrument', [
                'instrument' => $instrument,
                'bpm' => 120,
                'key' => 'C',
            ]);

            $response->assertOk()
                ->assertJsonPath('instrument', $instrument)
                ->assertJsonPath('source', 'fallback');
            $this->assertNotEmpty($response->json('midi_data'), "Expected notes for {$instrument}");
        }
    }

    public function test_instrument_generation_rejects_an_unsupported_instrument(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/ai/generate-instrument', ['instrument' => 'kazoo'])
            ->assertUnprocessable();
    }

    public function test_drum_generation_falls_back_to_a_valid_16_step_pattern_when_deepseek_is_unavailable(): void
    {
        Http::fake(['api.deepseek.com/*' => Http::response(['error' => 'unauthorized'], 401)]);

        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/ai/generate-drums', [
            'style' => 'funk',
            'bpm' => 100,
        ]);

        $response->assertOk()->assertJsonPath('source', 'fallback')->assertJsonPath('style', 'funk');

        foreach (['kick', 'snare', 'hihat', 'clap'] as $voice) {
            $steps = $response->json("pattern.{$voice}");
            $this->assertCount(16, $steps, "Expected 16 steps for {$voice}");
            foreach ($steps as $step) {
                $this->assertContains($step, [0, 1]);
            }
        }
    }

    public function test_drum_generation_uses_a_valid_ai_response_when_deepseek_succeeds(): void
    {
        $pattern = [
            'kick' => [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
            'snare' => [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
            'hihat' => [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            'clap' => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ];

        Http::fake(['api.deepseek.com/*' => Http::response([
            'choices' => [
                ['message' => ['content' => json_encode($pattern)]],
            ],
        ])]);

        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/ai/generate-drums', [
            'style' => 'rock',
            'bpm' => 120,
        ]);

        $response->assertOk()->assertJsonPath('source', 'ai');
        $this->assertSame($pattern, $response->json('pattern'));
    }

    public function test_drum_generation_falls_back_when_the_ai_response_has_a_malformed_voice(): void
    {
        Http::fake(['api.deepseek.com/*' => Http::response([
            'choices' => [
                // "snare" only has 4 steps instead of 16 — should be rejected wholesale.
                ['message' => ['content' => '{"kick":[1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],"snare":[1,0,0,0],"hihat":[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],"clap":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}']],
            ],
        ])]);

        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/ai/generate-drums', [
            'style' => 'rock',
            'bpm' => 120,
        ]);

        $response->assertOk()->assertJsonPath('source', 'fallback');
    }
}
