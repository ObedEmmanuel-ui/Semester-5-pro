<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ProjectExportController;
use App\Http\Controllers\Api\TrackController;
use App\Http\Controllers\Api\AIAssistantController;
use App\Http\Controllers\Api\StemController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\VoiceMemoController;
use App\Http\Controllers\Api\ProjectMessageController;
use App\Http\Controllers\Api\FollowController;
use App\Http\Controllers\Api\ProducerController;
use App\Http\Controllers\Api\ProjectCommentController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

Route::get('/health', function () {
    return response()->json([
        'status' => 'healthy',
        'service' => 'MproWave API',
        'version' => '1.0.0',
        'timestamp' => now()->toIso8601String()
    ]);
});

// Authentication routes
Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:6,1');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:6,1');
    Route::post('/google', [AuthController::class, 'google'])->middleware('throttle:6,1');
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
    Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:6,1');
    Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
    Route::get('/user', [AuthController::class, 'user'])->middleware('auth:sanctum');
    Route::put('/profile', [AuthController::class, 'updateProfile'])->middleware('auth:sanctum');
    Route::post('/avatar', [AuthController::class, 'uploadAvatar'])->middleware('auth:sanctum');
});

// Protected routes
Route::middleware(['auth:sanctum', 'not_suspended'])->group(function () {
    
    // Project management
    Route::apiResource('projects', ProjectController::class);
    Route::post('projects/{project}/duplicate', [ProjectController::class, 'duplicate']);
    Route::post('projects/{project}/export', [ProjectExportController::class, 'export']);
    
    // Track management
    Route::apiResource('projects.tracks', TrackController::class)->shallow();
    Route::post('tracks/{track}/upload', [TrackController::class, 'uploadAudio']);
    Route::post('tracks/{track}/separate-stems', [StemController::class, 'separateFromTrack']);
    Route::post('projects/{project}/tracks/from-stem', [StemController::class, 'addStemAsTrack']);
    
    // AI Assistant endpoints
    Route::prefix('ai')->group(function () {
        Route::post('/generate-midi', [AIAssistantController::class, 'generateMidi']);
        Route::post('/generate-instrument', [AIAssistantController::class, 'generateInstrument']);
        Route::post('/suggest-harmony', [AIAssistantController::class, 'suggestHarmony']);
        Route::post('/generate-drums', [AIAssistantController::class, 'generateDrums']);
        Route::post('/analyze-audio', [AIAssistantController::class, 'analyzeAudio']);
        Route::post('/generate-lyrics', [AIAssistantController::class, 'generateLyrics']);
        Route::post('/generate-song', [AIAssistantController::class, 'generateSong']);
        Route::post('/generate-song-audio', [AIAssistantController::class, 'generateSongAudio']);    });
    
    // Stem separation
    Route::prefix('stems')->group(function () {
        Route::post('/separate', [StemController::class, 'separateStems']);
        Route::get('/{job}/status', [StemController::class, 'checkStatus']);
        Route::get('/{job}/download', [StemController::class, 'download']);
    });

    // Announcements posted by admins, shown as in-app notifications
    Route::get('/notifications', [NotificationController::class, 'index']);
    // Real per-user notifications (e.g. "someone commented on your project")
    Route::get('/notifications/personal', [NotificationController::class, 'personal']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);

    // Voice memos — personal recordings, not tied to any project
    Route::get('/voice-memos', [VoiceMemoController::class, 'index']);
    Route::post('/voice-memos', [VoiceMemoController::class, 'store']);
    Route::put('/voice-memos/{memo}', [VoiceMemoController::class, 'update']);
    Route::delete('/voice-memos/{memo}', [VoiceMemoController::class, 'destroy']);

    // Per-project chat
    Route::get('/projects/{project}/messages', [ProjectMessageController::class, 'index']);
    Route::post('/projects/{project}/messages', [ProjectMessageController::class, 'store']);
    Route::post('/projects/{project}/messages/ai-reply', [ProjectMessageController::class, 'aiReply']);
    Route::delete('/projects/{project}/messages/{message}', [ProjectMessageController::class, 'destroy']);

    // Comments from other producers on a project its owner has shared publicly
    Route::get('/projects/{project}/comments', [ProjectCommentController::class, 'index']);
    Route::post('/projects/{project}/comments', [ProjectCommentController::class, 'store']);
    Route::delete('/projects/{project}/comments/{comment}', [ProjectCommentController::class, 'destroy']);

    // Discover producers, public profiles, and the follow graph
    Route::get('/producers', [ProducerController::class, 'index']);
    // Must be registered before /producers/{user} so "activity" doesn't get
    // swallowed as a {user} route-model-binding lookup.
    Route::get('/producers/activity', [ProducerController::class, 'activity']);
    Route::get('/producers/{user}', [ProducerController::class, 'show']);
    Route::post('/producers/{user}/follow', [FollowController::class, 'store']);
    Route::delete('/producers/{user}/follow', [FollowController::class, 'destroy']);
    Route::get('/producers/{user}/followers', [FollowController::class, 'followers']);
    Route::get('/producers/{user}/following', [FollowController::class, 'following']);
});
