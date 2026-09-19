<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // AI reply messages still carry the project owner's user_id (no
        // schema change needed there, and it's already the only real user
        // who could see this project) — is_ai is what distinguishes an AI
        // reply from that same user's own words when rendering the thread.
        Schema::table('project_messages', function (Blueprint $table) {
            $table->boolean('is_ai')->default(false)->after('user_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('project_messages', function (Blueprint $table) {
            $table->dropColumn('is_ai');
        });
    }
};
