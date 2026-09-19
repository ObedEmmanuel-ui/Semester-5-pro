<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Track;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProjectExportTest extends TestCase
{
    use RefreshDatabase;

    private function fakeExportResponse(): void
    {
        Http::fake([
            '*/export-project-audio' => Http::response([
                'audio_wav_b64' => base64_encode('fake-wav-bytes'),
                'duration_sec' => 12.5,
            ], 200),
        ]);
    }

    public function test_a_user_can_export_their_project_to_a_mixed_audio_file(): void
    {
        Storage::fake('public');
        $this->fakeExportResponse();

        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create();
        Track::factory()->for($project)->create([
            'type' => 'midi',
            'midi_data' => [['note' => 'C4', 'start' => 0, 'duration' => 1, 'velocity' => 90]],
        ]);

        $response = $this->actingAs($user)->postJson("/api/projects/{$project->id}/export");

        $response->assertOk()->assertJsonStructure(['job_id', 'file_name', 'download_url', 'duration_seconds']);
        Storage::disk('public')->assertExists("exports/{$response->json('job_id')}/mix.wav");
    }

    public function test_exporting_a_project_with_no_audible_tracks_is_rejected(): void
    {
        Storage::fake('public');
        $this->fakeExportResponse();

        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create();
        // A muted track and a midi track with no notes — neither is audible.
        Track::factory()->for($project)->create(['type' => 'midi', 'midi_data' => [], 'muted' => false]);
        Track::factory()->for($project)->create(['type' => 'audio', 'muted' => true]);

        $this->actingAs($user)
            ->postJson("/api/projects/{$project->id}/export")
            ->assertUnprocessable();
    }

    public function test_a_user_cannot_export_another_users_project(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $project = Project::factory()->for($owner)->create();
        Track::factory()->for($project)->create(['type' => 'midi', 'midi_data' => [['note' => 'C4', 'start' => 0, 'duration' => 1]]]);

        $this->actingAs($intruder)
            ->postJson("/api/projects/{$project->id}/export")
            ->assertForbidden();
    }

    public function test_soloed_tracks_exclude_non_soloed_tracks_from_the_export(): void
    {
        Storage::fake('public');
        $this->fakeExportResponse();

        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create();
        Track::factory()->for($project)->create([
            'name' => 'Soloed',
            'type' => 'midi',
            'solo' => true,
            'midi_data' => [['note' => 'C4', 'start' => 0, 'duration' => 1]],
        ]);
        Track::factory()->for($project)->create([
            'name' => 'Not soloed',
            'type' => 'midi',
            'solo' => false,
            'midi_data' => [['note' => 'D4', 'start' => 0, 'duration' => 1]],
        ]);

        $this->actingAs($user)->postJson("/api/projects/{$project->id}/export")->assertOk();

        Http::assertSent(function ($request) {
            $tracks = $request->data()['tracks'];

            return count($tracks) === 1 && $tracks[0]['name'] === 'Soloed';
        });
    }
}
