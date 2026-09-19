<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tracks', function (Blueprint $table) {
            $table->json('waveform_peaks')->nullable()->after('audio_url');
        });
    }

    public function down(): void
    {
        Schema::table('tracks', function (Blueprint $table) {
            $table->dropColumn('waveform_peaks');
        });
    }
};
