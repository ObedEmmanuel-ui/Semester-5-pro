<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A real, persisted social graph — one row per follow relationship.
        // The unique pair prevents double-following the same producer, and
        // both FKs cascade so a deleted account cleanly drops out of
        // everyone's followers/following lists instead of leaving orphans.
        Schema::create('follows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('follower_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('followed_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['follower_id', 'followed_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('follows');
    }
};
