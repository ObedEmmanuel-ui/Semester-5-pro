<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Same generator/prompt/parsing/procedural-fallback logic as
 * DeepSeekAIService — every one of those methods just operates on a plain
 * text string, so nothing about them is provider-specific. The only thing
 * that actually differs between providers is the HTTP call and the shape
 * of the response, so this overrides just that one method (callDeepSeek)
 * and translates Gemini's response into the same
 * {choices:[{message:{content}}]} shape the inherited parsers already
 * expect — everything else is reused as-is.
 */
class GeminiAIService extends DeepSeekAIService
{
    protected $geminiApiKey;
    protected $geminiApiUrl;
    protected $geminiModel;

    public function __construct()
    {
        $this->geminiApiKey = config('services.gemini.api_key');
        $this->geminiApiUrl = config('services.gemini.api_url');
        $this->geminiModel = config('services.gemini.model');
    }

    protected function callDeepSeek(string $prompt)
    {
        try {
            $url = "{$this->geminiApiUrl}/models/{$this->geminiModel}:generateContent?key={$this->geminiApiKey}";

            $response = Http::withHeaders([
                'Content-Type' => 'application/json',
            ])->timeout(60)->post($url, [
                'contents' => [
                    ['parts' => [['text' => $prompt]]],
                ],
                'generationConfig' => [
                    'temperature' => 0.7,
                    // This model spends a large, variable chunk of its
                    // budget "thinking" before writing any visible output
                    // (observed 1500-2000+ thought tokens even for short
                    // prompts) — too small a budget here means the response
                    // gets cut off mid-JSON (finishReason: MAX_TOKENS)
                    // before any real content is written.
                    'maxOutputTokens' => 8192,
                ],
            ]);

            if ($response->failed()) {
                throw new \RuntimeException('Gemini API returned an error: ' . $response->body());
            }

            // Concatenate every text part rather than just the first — a
            // response can split across multiple parts, notably when it
            // very nearly hits the token limit.
            $parts = $response->json('candidates.0.content.parts', []);
            $text = collect($parts)->pluck('text')->filter()->implode('');

            return ['choices' => [['message' => ['content' => $text]]]];
        } catch (\Exception $e) {
            Log::error('Gemini API Error: ' . $e->getMessage());
            throw $e;
        }
    }
}
