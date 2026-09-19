<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->string('genre')->nullable()->after('name');
            $table->enum('status', ['active', 'completed', 'archived'])->default('active')->after('genre');
            $table->date('due_date')->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn(['genre', 'status', 'due_date']);
        });
    }
};
