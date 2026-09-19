<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tracks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->string('name');
            $table->enum('type', ['audio', 'midi', 'instrument'])->default('audio');
            $table->string('audio_url')->nullable();
            $table->json('midi_data')->nullable();
            $table->decimal('volume', 5, 2)->default(0.8);
            $table->decimal('pan', 5, 2)->default(0);
            $table->boolean('muted')->default(false);
            $table->boolean('solo')->default(false);
            $table->json('effects')->nullable();
            $table->integer('position')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tracks');
    }
};
