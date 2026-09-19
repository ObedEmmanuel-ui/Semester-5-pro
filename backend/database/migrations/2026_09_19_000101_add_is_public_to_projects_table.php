<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Projects stay private by default — a producer explicitly shares
        // one to their public profile, which is what makes it visible to
        // other producers (Discover) and open to comments.
        Schema::table('projects', function (Blueprint $table) {
            $table->boolean('is_public')->default(false)->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn('is_public');
        });
    }
};
