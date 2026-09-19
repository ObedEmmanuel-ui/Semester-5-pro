<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Track;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class StemSeparationTest extends TestCase
{
    use RefreshDatabase;

    private function fakeSeparationResponse(): void
    {
        Http::fake([
            '*/separate-stems' => Http::response([
                'stems' => [
                    'vocals' => base64_encode('fake-vocals-wav'),
                    'drums' => base64_encode('fake-drums-wav'),
                ],
            ], 200),
        ]);
    }

    public function test_a_user_can_separate_stems_from_an_uploaded_file(): void
    {
        Storage::fake('public');
        $this->fakeSeparationResponse();

        $user = User::factory()->create();
        // UploadedFile::fake()->create() reports a given size for testing
        // max-size validation, but doesn't necessarily write real bytes —
        // createWithContent() is the one that gives a file with genuine,
        // readable content, which this flow actually reads from disk.
        $file = UploadedFile::fake()->createWithContent('song.wav', 'fake-audio-bytes');

        $response = $this->actingAs($user)->postJson('/api/stems/separate', [
            'audio_file' => $file,
            'stems' => ['vocals', 'drums'],
        ]);

        $response->assertOk()->assertJson(['status' => 'completed']);
        $jobId = $response->json('job_id');
        Storage::disk('public')->assertExists("stems/jobs/{$jobId}/vocals.wav");
        Storage::disk('public')->assertExists("stems/jobs/{$jobId}/drums.wav");
    }

    public function test_a_user_can_separate_stems_directly_from_an_existing_track(): void
    {
        Storage::fake('public');
        $this->fakeSeparationResponse();

        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create();
        Storage::disk('public')->put('tracks/existing-clip.wav', 'raw-audio-bytes');
        $track = Track::factory()->for($project)->create([
            'type' => 'audio',
            'audio_url' => 'tracks/existing-clip.wav',
        ]);

        $response = $this->actingAs($user)->postJson("/api/tracks/{$track->id}/separate-stems", [
            'stems' => ['vocals', 'drums'],
        ]);

        $response->assertOk()->assertJson(['status' => 'completed']);
        $jobId = $response->json('job_id');
        Storage::disk('public')->assertExists("stems/jobs/{$jobId}/vocals.wav");

        // No re-upload happened — the service was called with the track's
        // own already-stored bytes.
        Http::assertSent(fn ($request) => str_contains((string) $request->body(), 'raw-audio-bytes'));
    }

    public function test_separating_a_track_with_no_audio_is_rejected(): void
    {
        Storage::fake('public');
        $this->fakeSeparationResponse();

        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create();
        $track = Track::factory()->for($project)->create(['type' => 'audio', 'audio_url' => null]);

        $this->actingAs($user)
            ->postJson("/api/tracks/{$track->id}/separate-stems")
            ->assertUnprocessable();
    }

    public function test_separating_a_midi_track_is_rejected(): void
    {
        Storage::fake('public');
        $this->fakeSeparationResponse();

        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create();
        $track = Track::factory()->for($project)->create(['type' => 'midi', 'audio_url' => null]);

        $this->actingAs($user)
            ->postJson("/api/tracks/{$track->id}/separate-stems")
            ->assertUnprocessable();
    }

    public function test_a_user_cannot_separate_stems_from_another_users_track(): void
    {
        Storage::fake('public');

        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $project = Project::factory()->for($owner)->create();
        Storage::disk('public')->put('tracks/clip.wav', 'bytes');
        $track = Track::factory()->for($project)->create(['type' => 'audio', 'audio_url' => 'tracks/clip.wav']);

        $this->actingAs($intruder)
            ->postJson("/api/tracks/{$track->id}/separate-stems")
            ->assertForbidden();
    }

    public function test_a_failed_separation_service_marks_the_job_as_failed(): void
    {
        Storage::fake('public');
        Http::fake(['*/separate-stems' => Http::response(['error' => 'Demucs failed'], 500)]);

        $user = User::factory()->create();
        $file = UploadedFile::fake()->create('song.wav', 500);

        $this->actingAs($user)
            ->postJson('/api/stems/separate', ['audio_file' => $file])
            ->assertServerError()
            ->assertJson(['status' => 'failed']);
    }

    public function test_a_user_can_add_a_separated_stem_as_a_new_track(): void
    {
        Storage::fake('public');

        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create();
        $jobId = 'test-job-id';
        Storage::disk('public')->put("stems/jobs/{$jobId}/vocals.wav", 'fake-vocals');

        $response = $this->actingAs($user)->postJson("/api/projects/{$project->id}/tracks/from-stem", [
            'name' => 'Vocals Stem',
            'job_id' => $jobId,
            'stem_name' => 'vocals.wav',
        ]);

        $response->assertCreated()->assertJsonFragment(['type' => 'audio', 'name' => 'Vocals Stem']);
        $this->assertDatabaseHas('tracks', [
            'project_id' => $project->id,
            'name' => 'Vocals Stem',
            'audio_url' => "stems/jobs/{$jobId}/vocals.wav",
        ]);
    }
}
