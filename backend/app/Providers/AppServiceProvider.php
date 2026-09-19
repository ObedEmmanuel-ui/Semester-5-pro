<?php

namespace App\Providers;

use App\Services\DeepSeekAIService;
use App\Services\GeminiAIService;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // AIAssistantController type-hints DeepSeekAIService directly (it's
        // the shared base with all the prompt/parsing/fallback logic) — this
        // resolves it to GeminiAIService instead when AI_PROVIDER=gemini,
        // so switching providers is a single .env change.
        $this->app->bind(DeepSeekAIService::class, function () {
            return config('services.ai_provider') === 'gemini'
                ? new GeminiAIService()
                : new DeepSeekAIService();
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
