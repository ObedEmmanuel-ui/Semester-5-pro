<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Accepts a file as audio by extension or MIME-type prefix, rather than
 * Laravel's built-in `mimes:` rule — which rejects a file unless its
 * *detected* MIME type exactly matches a fixed extension map, and real
 * recorders/encoders often report MIME types that map isn't aware of (an
 * .m4a straight off a phone can come through as "audio/x-m4a" on one
 * device and something the map has no entry for on another). Mirrors the
 * mobile app's own isLikelyAudioFile check so client and server agree on
 * what counts as "an audio file."
 */
class ValidAudioFile implements ValidationRule
{
    public const ALLOWED_EXTENSIONS = [
        'mp3', 'wav', 'wave', 'm4a', 'aac', 'ogg', 'oga', 'flac',
        'wma', 'opus', '3gp', 'amr', 'caf', 'aiff', 'aif',
    ];

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (!is_object($value) || !method_exists($value, 'getClientOriginalExtension')) {
            $fail('The :attribute must be a file.');
            return;
        }

        $extension = strtolower($value->getClientOriginalExtension() ?: '');
        $mimeType = (string) ($value->getMimeType() ?? '');

        $looksLikeAudio = in_array($extension, self::ALLOWED_EXTENSIONS, true)
            || str_starts_with($mimeType, 'audio/');

        if (!$looksLikeAudio) {
            $fail('The :attribute must be an audio file (mp3, wav, m4a, aac, ogg, or flac).');
        }
    }
}
