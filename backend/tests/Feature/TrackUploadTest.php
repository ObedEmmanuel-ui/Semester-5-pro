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

class TrackUploadTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_upload_common_audio_formats_to_their_own_track(): void
    {
        Storage::fake('public');
        Http::fake(['*/waveform-peaks' => Http::response(['peaks' => [0.1, 0.5, 1.0]], 200)]);

        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create();
        $track = Track::factory()->for($project)->create();

        foreach (['mp3', 'wav', 'm4a', 'ogg', 'flac'] as $extension) {
            $file = UploadedFile::fake()->create("clip.{$extension}", 500);

            $response = $this->actingAs($user)->postJson("/api/tracks/{$track->id}/upload", [
                'audio_file' => $file,
            ]);

            $response->assertOk();
        }
    }

    public function test_uploading_audio_computes_and_stores_waveform_peaks(): void
    {
        Storage::fake('public');
        Http::fake(['*/waveform-peaks' => Http::response(['peaks' => [0.1, 0.5, 0.95, 0.3]], 200)]);

        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create();
        $track = Track::factory()->for($project)->create();

        $this->actingAs($user)
            ->postJson("/api/tracks/{$track->id}/upload", ['audio_file' => UploadedFile::fake()->create('clip.wav', 500)])
            ->assertOk()
            ->assertJsonPath('track.waveform_peaks', [0.1, 0.5, 0.95, 0.3]);

        $this->assertEquals([0.1, 0.5, 0.95, 0.3], $track->fresh()->waveform_peaks);
    }

    public function test_a_failed_waveform_service_does_not_block_the_upload(): void
    {
        Storage::fake('public');
        Http::fake(['*/waveform-peaks' => Http::response([], 500)]);

        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create();
        $track = Track::factory()->for($project)->create();

        $this->actingAs($user)
            ->postJson("/api/tracks/{$track->id}/upload", ['audio_file' => UploadedFile::fake()->create('clip.wav', 500)])
            ->assertOk()
            ->assertJsonPath('track.waveform_peaks', null);
    }

    public function test_uploading_a_non_audio_file_is_rejected(): void
    {
        Storage::fake('public');

        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create();
        $track = Track::factory()->for($project)->create();

        $file = UploadedFile::fake()->create('notes.txt', 10, 'text/plain');

        $this->actingAs($user)
            ->postJson("/api/tracks/{$track->id}/upload", ['audio_file' => $file])
            ->assertUnprocessable();
    }

    public function test_a_user_cannot_upload_audio_to_another_users_track(): void
    {
        Storage::fake('public');

        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $project = Project::factory()->for($owner)->create();
        $track = Track::factory()->for($project)->create();

        $file = UploadedFile::fake()->create('clip.mp3', 500);

        $this->actingAs($intruder)
            ->postJson("/api/tracks/{$track->id}/upload", ['audio_file' => $file])
            ->assertForbidden();
    }
}
