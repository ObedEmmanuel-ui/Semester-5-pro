<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProjectTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_guest_cannot_list_projects(): void
    {
        $this->getJson('/api/projects')->assertUnauthorized();
    }

    public function test_a_user_can_create_and_list_only_their_own_projects(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        Project::factory()->for($otherUser)->create();

        $response = $this->actingAs($user)->postJson('/api/projects', [
            'name' => 'My First Beat',
            'bpm' => 128,
            'key' => 'A',
            'time_signature' => '4/4',
        ]);

        $response->assertCreated()->assertJsonFragment(['name' => 'My First Beat', 'bpm' => 128]);

        $list = $this->actingAs($user)->getJson('/api/projects');
        $list->assertOk();
        $this->assertCount(1, $list->json('data'));
    }

    public function test_a_user_cannot_view_another_users_project(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $project = Project::factory()->for($owner)->create();

        $this->actingAs($intruder)
            ->getJson("/api/projects/{$project->id}")
            ->assertForbidden();
    }

    public function test_a_user_can_add_a_track_to_their_own_project(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create();

        $response = $this->actingAs($user)->postJson("/api/projects/{$project->id}/tracks", [
            'name' => 'Lead Synth',
            'type' => 'instrument',
        ]);

        $response->assertCreated()->assertJsonFragment(['name' => 'Lead Synth']);
        $this->assertDatabaseHas('tracks', ['project_id' => $project->id, 'name' => 'Lead Synth']);
    }

    public function test_a_user_cannot_add_a_track_to_another_users_project(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $project = Project::factory()->for($owner)->create();

        $this->actingAs($intruder)
            ->postJson("/api/projects/{$project->id}/tracks", [
                'name' => 'Sneaky Track',
                'type' => 'audio',
            ])
            ->assertForbidden();
    }

    public function test_a_user_can_delete_their_own_project(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create();

        $this->actingAs($user)
            ->deleteJson("/api/projects/{$project->id}")
            ->assertOk();

        $this->assertDatabaseMissing('projects', ['id' => $project->id]);
    }
}
