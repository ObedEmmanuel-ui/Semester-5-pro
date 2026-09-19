<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Project>
 */
class ProjectFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'name' => fake()->words(2, true),
            'bpm' => fake()->numberBetween(80, 160),
            'key' => fake()->randomElement(['C', 'D', 'E', 'F', 'G', 'A', 'B']),
            'time_signature' => '4/4',
            'settings' => [],
        ];
    }
}
