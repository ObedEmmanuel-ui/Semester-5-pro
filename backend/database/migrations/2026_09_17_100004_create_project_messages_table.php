<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Real, persisted per-project messages — but this app has no
        // project-sharing/invite system yet, so in practice every message
        // is from the project's own owner (there's no one else who could
        // have access to post here). Kept as a genuine feature rather than
        // faked with pretend collaborators.
        Schema::create('project_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->text('body')->nullable();
            $table->string('voice_path')->nullable();
            $table->decimal('voice_duration_seconds', 8, 2)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_messages');
    }
};
