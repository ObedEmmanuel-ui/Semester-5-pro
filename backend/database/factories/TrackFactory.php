<?php

namespace Database\Factories;

use App\Models\Project;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Track>
 */
class TrackFactory extends Factory
{
    public function definition(): array
    {
        return [
            'project_id' => Project::factory(),
            'name' => fake()->words(2, true),
            'type' => 'audio',
            'volume' => 0.8,
            'pan' => 0,
            'muted' => false,
            'solo' => false,
            'position' => 0,
        ];
    }
}
