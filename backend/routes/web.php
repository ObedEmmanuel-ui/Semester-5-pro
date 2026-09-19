<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Admin\AnnouncementController as AdminAnnouncementController;
use App\Http\Controllers\Admin\AuditLogController as AdminAuditLogController;
use App\Http\Controllers\Admin\AuthController as AdminAuthController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\ModerationController as AdminModerationController;
use App\Http\Controllers\Admin\UserController as AdminUserController;

Route::get('/', function () {
    return ['Laravel' => app()->version()];
});

Route::prefix('admin')->name('admin.')->group(function () {
    Route::middleware('guest:web')->group(function () {
        Route::get('/login', [AdminAuthController::class, 'showLogin'])->name('login');
        Route::post('/login', [AdminAuthController::class, 'login'])->name('login.attempt');
    });

    Route::middleware('admin')->group(function () {
        Route::post('/logout', [AdminAuthController::class, 'logout'])->name('logout');
        Route::get('/', [DashboardController::class, 'index'])->name('dashboard');

        Route::get('/users', [AdminUserController::class, 'index'])->name('users.index');
        Route::get('/users/{user}', [AdminUserController::class, 'show'])->name('users.show');
        Route::put('/users/{user}', [AdminUserController::class, 'update'])->name('users.update');
        Route::post('/users/{user}/suspend', [AdminUserController::class, 'suspend'])->name('users.suspend');
        Route::post('/users/{user}/unsuspend', [AdminUserController::class, 'unsuspend'])->name('users.unsuspend');

        Route::get('/announcements', [AdminAnnouncementController::class, 'index'])->name('announcements.index');
        Route::post('/announcements', [AdminAnnouncementController::class, 'store'])->name('announcements.store');
        Route::delete('/announcements/{announcement}', [AdminAnnouncementController::class, 'destroy'])->name('announcements.destroy');

        Route::get('/moderation', [AdminModerationController::class, 'index'])->name('moderation.index');
        Route::delete('/moderation/comments/{comment}', [AdminModerationController::class, 'destroyComment'])->name('moderation.comments.destroy');
        Route::delete('/moderation/messages/{message}', [AdminModerationController::class, 'destroyMessage'])->name('moderation.messages.destroy');
        Route::delete('/moderation/voice-memos/{voiceMemo}', [AdminModerationController::class, 'destroyVoiceMemo'])->name('moderation.voice-memos.destroy');

        // Account creation, deletion, and the audit trail are the small set
        // of actions only a super admin may reach — see EnsureUserIsSuperAdmin.
        Route::middleware('super_admin')->group(function () {
            Route::post('/users', [AdminUserController::class, 'store'])->name('users.store');
            Route::delete('/users/{user}', [AdminUserController::class, 'destroy'])->name('users.destroy');
            Route::get('/audit-log', [AdminAuditLogController::class, 'index'])->name('audit.index');
        });
    });
});
