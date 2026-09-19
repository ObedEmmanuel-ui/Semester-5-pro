<?php

return [

    // Which text-generation provider AIAssistantController's AI service
    // resolves to — 'deepseek' or 'gemini'. Swappable via .env so testing a
    // different provider never requires touching code.
    'ai_provider' => env('AI_PROVIDER', 'deepseek'),

    'deepseek' => [
        'api_key' => env('DEEPSEEK_API_KEY'),
        'api_url' => env('DEEPSEEK_API_URL', 'https://api.deepseek.com'),
    ],

    'gemini' => [
        'api_key' => env('GEMINI_API_KEY'),
        'api_url' => env('GEMINI_API_URL', 'https://generativelanguage.googleapis.com/v1beta'),
        'model' => env('GEMINI_MODEL', 'gemini-3.6-flash'),
    ],

    'audio_service' => [
        'base_url' => env('AUDIO_SERVICE_URL', 'http://localhost:8001'),
    ],

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
    ],

    'mailgun' => [
        'domain' => env('MAILGUN_DOMAIN'),
        'secret' => env('MAILGUN_SECRET'),
        'endpoint' => env('MAILGUN_ENDPOINT', 'api.mailgun.net'),
        'scheme' => 'https',
    ],

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

];
