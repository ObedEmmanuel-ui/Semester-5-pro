<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A tier above plain is_admin — regular admins can moderate content
        // and manage/suspend ordinary users, but only a super admin can
        // create or delete accounts, grant/revoke admin access, or view the
        // audit log. Without this split, any admin could already promote
        // themselves or others to admin and delete any account, including
        // other admins.
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_super_admin')->default(false)->after('is_admin');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('is_super_admin');
        });
    }
};
