<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class DeepSeekAIService
{
    protected $apiKey;
    protected $apiUrl;

    public function __construct()
    {
        $this->apiKey = config('services.deepseek.api_key');
        $this->apiUrl = config('services.deepseek.api_url');
    }

    /**
     * Returns ['notes' => [...], 'source' => 'ai'|'fallback']. DeepSeek is the
     * primary source; if it's unreachable, unconfigured, or returns something
     * we can't parse into notes, we fall back to a deterministic procedural
     * pattern so the feature still produces a usable result (and the caller
     * can tell the user which happened via 'source').
     */
    public function generateMidiPattern(array $params)
    {
        try {
            $notes = $this->parseMidiResponse($this->callDeepSeek($this->buildMidiPrompt($params)));
        } catch (\Throwable $e) {
            $notes = [];
        }

        return empty($notes)
            ? ['notes' => $this->proceduralMelody($params), 'source' => 'fallback']
            : ['notes' => $notes, 'source' => 'ai'];
    }

    /**
     * Same AI-with-procedural-fallback shape as generateMidiPattern, but
     * prompts for (and, on fallback, algorithmically builds) a part suited
     * to the given instrument rather than a generic melody.
     */
    public function generateInstrumentPattern(array $params)
    {
        try {
            $notes = $this->parseMidiResponse($this->callDeepSeek($this->buildInstrumentPrompt($params)));
        } catch (\Throwable $e) {
            $notes = [];
        }

        return empty($notes)
            ? ['notes' => $this->proceduralInstrumentPattern($params), 'source' => 'fallback']
            : ['notes' => $notes, 'source' => 'ai'];
    }

    /**
     * Returns ['pattern' => ['kick' => [16 x 0|1], 'snare' => [...], 'hihat' => [...], 'clap' => [...]], 'source' => 'ai'|'fallback'].
     * A 16-step grid (one bar of 16th notes) drives the mobile step
     * sequencer directly — no freeform text to parse or guess at.
     */
    public function generateDrumPattern(array $params)
    {
        try {
            $pattern = $this->parseDrumStepsResponse($this->callDeepSeek($this->buildDrumPrompt($params)));
        } catch (\Throwable $e) {
            $pattern = [];
        }

        return empty($pattern)
            ? ['pattern' => $this->proceduralDrumPattern($params), 'source' => 'fallback']
            : ['pattern' => $pattern, 'source' => 'ai'];
    }

    /**
     * Turns raw lyrics into a full musical starting point: a key/scale/tempo,
     * a suggested drum style, a melody line (roughly one note per word,
     * spanning the whole lyric) to sing it to, and short practical direction
     * on how to actually perform it. Same AI-with-procedural-fallback shape
     * as everything else — the fallback can't "understand" the lyrics the
     * way a real model can, but it still reads their mood from keyword cues
     * and produces a musically coherent (if simpler) result rather than
     * nothing.
     */
    public function generateSongFromLyrics(array $params)
    {
        // Lyrics from the Generate Lyrics feature (or pasted from
        // somewhere) commonly carry [Verse]/[Chorus] section labels —
        // useful for a human reading the text, meaningless as sung words,
        // so they're stripped before anything treats every line as lyrics
        // to sing.
        $lyrics = $this->stripSectionLabels(trim($params['lyrics'] ?? ''));

        // A short snippet sung straight through can be over in a few
        // seconds — pad it out into a full-length structure (verse, a
        // repeated hook, verse again, hook again) before generating any
        // melody, so both the AI and procedural paths always compose
        // against lyrics that are actually long enough to fill a real song.
        $expandedLyrics = $this->expandLyricsForMinDuration($lyrics);

        try {
            // A 60+ second song needs on the order of 100-200 melody notes;
            // the default 2048-token budget used elsewhere in this service
            // truncates a JSON response that long mid-array.
            $response = $this->callDeepSeek($this->buildSongFromLyricsPrompt(['lyrics' => $expandedLyrics]), 8192);
            $song = $this->parseSongResponse($response);
        } catch (\Throwable $e) {
            $song = [];
        }

        if (empty($song['melody'])) {
            $song = array_merge($this->proceduralSongFromLyrics($expandedLyrics), ['source' => 'fallback']);
        } else {
            $song['source'] = 'ai';
        }

        // The drum pattern is a rhythm-preset lookup rather than something
        // that benefits from AI creativity (and asking the model to also
        // invent a well-formed 16-step grid just adds another way for the
        // JSON to come back malformed) — reuse the same hand-tuned presets
        // as the standalone beat generator either way, keyed off whichever
        // style was chosen above.
        $song['drum_pattern'] = $this->proceduralDrumPattern(['style' => $song['style']]);
        $song['lyrics'] = $expandedLyrics;

        $bpm = max(1, (int) ($song['bpm'] ?? 100));
        $totalBeats = 0.0;
        foreach ($song['melody'] as $note) {
            $totalBeats = max($totalBeats, (float) ($note['start'] ?? 0) + (float) ($note['duration'] ?? 0));
        }
        $song['duration_seconds'] = round($totalBeats * (60 / $bpm) + 1, 1);

        return $song;
    }

    /**
     * Drops lines that are only a [Verse]/[Chorus]-style section label,
     * leaving just the actual words to be sung.
     */
    protected function stripSectionLabels(string $lyrics): string
    {
        $lines = preg_split('/\r?\n/', $lyrics);
        $kept = array_filter($lines, fn ($line) => !preg_match('/^\s*\[[^\]]*\]\s*$/', $line));

        return implode("\n", $kept);
    }

    /**
     * Repeats a short lyric into a verse/hook/verse/hook structure until the
     * sung-through length would reach $minSeconds, estimated with the same
     * per-word timing the melody builders below actually use. Sized against
     * a fast assumed tempo (130 BPM) so that whatever tempo is later chosen
     * for the real song — almost always slower — only overshoots this
     * floor, never falls short of it.
     */
    protected function expandLyricsForMinDuration(string $lyrics, float $minSeconds = 62.0): string
    {
        $lines = array_values(array_filter(array_map('trim', preg_split('/\r?\n/', $lyrics))));
        if (empty($lines)) {
            return $lyrics;
        }

        $assumedBpm = 130.0;
        $secPerBeat = 60.0 / $assumedBpm;

        $estimateSeconds = function (array $lines) use ($secPerBeat) {
            $beats = 0.0;
            foreach ($lines as $line) {
                $words = preg_split('/\s+/', trim($line), -1, PREG_SPLIT_NO_EMPTY);
                $n = count($words);
                $beats += $n === 0 ? 1.0 : (($n - 1) * 0.5 + 1.0) + 0.5;
            }
            return $beats * $secPerBeat;
        };

        // Repeating the final line(s) as a "hook" is a much better proxy
        // for a chorus than repeating the whole verse verbatim — it gives
        // the expanded song at least a little structural variety.
        $hookLines = array_slice($lines, -min(2, count($lines)));
        $cycle = array_merge([''], $hookLines, [''], $lines);

        $structured = $lines;
        $guard = 0;
        while ($estimateSeconds($structured) < $minSeconds && $guard < 16) {
            $structured = array_merge($structured, $cycle);
            $guard++;
        }

        return implode("\n", $structured);
    }

    /**
     * Suggest chords/harmony from musical features already extracted from the
     * user's recording by the audio analysis microservice (basic-pitch/librosa),
     * since DeepSeek's API only accepts text input.
     */
    /**
     * Writes original song lyrics from a topic/mood/genre — for the user
     * who wants a song about something but doesn't want to write the words
     * themselves. Same AI-with-fallback shape as everything else here.
     */
    public function generateLyrics(array $params)
    {
        $topic = trim($params['topic'] ?? '');
        $mood = trim($params['mood'] ?? '');
        $genre = trim($params['genre'] ?? '');

        try {
            $lyrics = $this->parseLyricsResponse(
                $this->callDeepSeek($this->buildLyricsPrompt($topic, $mood, $genre), 2048)
            );
        } catch (\Throwable $e) {
            $lyrics = '';
        }

        if ($lyrics === '') {
            return ['lyrics' => $this->proceduralLyrics($topic, $mood), 'source' => 'fallback'];
        }

        return ['lyrics' => $lyrics, 'source' => 'ai'];
    }

    protected function buildLyricsPrompt(string $topic, string $mood, string $genre): string
    {
        $topic = $topic !== '' ? $topic : 'a feeling that is hard to put into words';
        $moodPart = $mood !== '' ? " The mood should be {$mood}." : '';
        $genrePart = $genre !== '' ? " Write it in a {$genre} style." : '';

        return "Write original song lyrics about: \"{$topic}\".{$moodPart}{$genrePart} "
            . 'Structure it as [Verse 1], [Chorus], [Verse 2], [Chorus] — label each section on its own line in '
            . 'square brackets, then the lyric lines below it. Keep lines short and singable (roughly 4-8 words '
            . "each), use vivid concrete imagery rather than cliches, and make the chorus the most memorable, "
            . 'repeatable part. Punctuate it like real lyrics — a comma at a natural mid-line pause, a period, '
            . 'exclamation point, or question mark at the end of a complete line or thought — since these marks '
            . 'become sung phrasing and breaths, not silent formatting. Return ONLY the lyrics text with the '
            . 'section labels — no preamble, no explanation, no markdown formatting.';
    }

    protected function parseLyricsResponse($response): string
    {
        $text = trim($response['choices'][0]['message']['content'] ?? '');
        // A verse-less one-liner or an empty/whitespace response isn't
        // usable as song lyrics — treat it the same as no response at all
        // so the procedural fallback kicks in instead.
        $lineCount = count(array_filter(array_map('trim', preg_split('/\r?\n/', $text))));

        return $lineCount >= 4 ? $text : '';
    }

    /**
     * Mood-appropriate lyric templates with the topic word dropped in —
     * far less original than a real model, but always produces a complete,
     * structured, singable lyric instead of nothing when DeepSeek can't.
     */
    protected function proceduralLyrics(string $topic, string $mood): string
    {
        $topic = $topic !== '' ? $topic : 'this moment';
        $lower = strtolower($mood);
        $isSad = str_contains($lower, 'sad') || str_contains($lower, 'heartbreak') || str_contains($lower, 'lonely');
        $isHappy = !$isSad && (str_contains($lower, 'happy') || str_contains($lower, 'joy') || str_contains($lower, 'upbeat'));

        if ($isSad) {
            return "[Verse 1]\nI keep replaying {$topic} in my mind\nHolding onto shadows I can't leave behind\n"
                . "The silence gets louder every single night\nI'm searching for a piece of you in every light\n\n"
                . "[Chorus]\nAnd I still think about {$topic}\nLike it happened yesterday\nEvery memory's a photograph\n"
                . "I can't just put away\n\n"
                . "[Verse 2]\nThe seasons keep changing but this feeling stays\nI trace the outline of our better days\n"
                . "Maybe one day I'll let the ache go quiet\nBut tonight I'm still caught up in this riot\n\n"
                . "[Chorus]\nAnd I still think about {$topic}\nLike it happened yesterday\nEvery memory's a photograph\n"
                . "I can't just put away";
        }

        if ($isHappy) {
            return "[Verse 1]\nWoke up today thinking about {$topic}\nAnd everything feels like it's finally free\n"
                . "The sun's coming up like it's on our side\nGot nowhere to be but right here tonight\n\n"
                . "[Chorus]\nThis is {$topic}, this is our time\nEverything golden, everything mine\n"
                . "We're dancing in circles under the light\nNothing can touch us, we got it tonight\n\n"
                . "[Verse 2]\nEvery little moment feels like a spark\nLighting up something that started as dark\n"
                . "We don't need a reason, we just let it go\nRiding this feeling, taking it slow\n\n"
                . "[Chorus]\nThis is {$topic}, this is our time\nEverything golden, everything mine\n"
                . "We're dancing in circles under the light\nNothing can touch us, we got it tonight";
        }

        return "[Verse 1]\n{$topic} keeps circling back to me\nLike a tide that won't let the shore be free\n"
            . "I'm learning the shape of it line by line\nSomewhere between the reason and the rhyme\n\n"
            . "[Chorus]\nSo I'll sing about {$topic}\nUntil the words feel true\nEvery verse a version\n"
            . "Of the thing I'm working through\n\n"
            . "[Verse 2]\nThe details blur but the feeling's still clear\nSomething about it keeps bringing me here\n"
            . "Maybe it's simple, maybe it's not\nBut it's the closest thing to a thought I've got\n\n"
            . "[Chorus]\nSo I'll sing about {$topic}\nUntil the words feel true\nEvery verse a version\n"
            . "Of the thing I'm working through";
    }

    /**
     * Same AI-with-fallback shape as the generators above: DeepSeek first,
     * a deterministic chord progression in the detected (or default) key if
     * it's unavailable or returns nothing usable — never a bare "none
     * detected" result with no explanation.
     */
    public function suggestHarmonyFromFeatures(array $features, string $context = '')
    {
        $notesSummary = $this->summarizeNotes($features['notes'] ?? []);
        $tempo = $features['tempo_bpm'] ?? 'unknown';
        $key = $features['estimated_key'] ?? 'unknown';

        $prompt = "A recorded track was analyzed and has an estimated key of {$key} and tempo of {$tempo} BPM. "
            . "The detected notes are: {$notesSummary}. Context from the artist: {$context}. "
            . 'Suggest complementary chord progressions, harmonies, and a scale that would fit well with this track.';

        try {
            $harmony = $this->parseHarmonyResponse($this->callDeepSeek($prompt));
        } catch (\Throwable $e) {
            $harmony = [];
        }

        return empty($harmony['chords'])
            ? $this->proceduralHarmony($features)
            : array_merge($harmony, ['source' => 'ai']);
    }

    /**
     * Guess genre/mood/energy from extracted audio features (tempo, key, note
     * density) rather than from the raw audio, which DeepSeek cannot hear.
     * Same AI-with-fallback shape as everything else in this service.
     */
    public function describeAudioFeatures(array $features)
    {
        $tempo = $features['tempo_bpm'] ?? 'unknown';
        $key = $features['estimated_key'] ?? 'unknown';
        $noteCount = count($features['notes'] ?? []);
        $duration = $features['duration_sec'] ?? 'unknown';

        $prompt = "A track was analyzed with these extracted features: tempo {$tempo} BPM, key {$key}, "
            . "{$noteCount} notes detected over {$duration} seconds. Based on these features, describe the "
            . 'likely genre, mood, and energy level in a short summary.';

        try {
            $analysis = $this->parseAnalysisResponse($this->callDeepSeek($prompt), $features);
            if (empty($analysis['analysis'])) {
                throw new \RuntimeException('Empty analysis response');
            }
        } catch (\Throwable $e) {
            return $this->proceduralAnalysis($features);
        }

        return array_merge($analysis, ['source' => 'ai']);
    }

    /**
     * A safe, versatile I-V-vi-IV progression built from the detected (or
     * default C) key — used whenever DeepSeek can't produce a harmony
     * suggestion, so the feature always returns something musically usable.
     */
    protected function proceduralHarmony(array $features): array
    {
        $key = $features['estimated_key'] ?? 'C';
        $root = $this->rootPitchClass($key);
        $intervals = $this->scaleIntervals('major');
        $names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        // Scale degrees (0-indexed) for I, V, vi, IV; the vi chord is minor.
        $degrees = [0 => '', 4 => '', 5 => 'm', 3 => ''];
        $chords = [];
        foreach ($degrees as $degree => $suffix) {
            $pitchClass = ($root + $intervals[$degree]) % 12;
            $chords[] = $names[$pitchClass] . $suffix;
        }

        return [
            'raw_response' => null,
            'chords' => $chords,
            'detected_scale' => "{$key} major",
            'suggestions' => "A classic I-V-vi-IV progression in {$key} major — a safe, versatile starting point.",
            'source' => 'fallback',
        ];
    }

    /**
     * Tempo-based genre/energy guess used whenever DeepSeek can't describe
     * the clip — coarse, but always returns something instead of nothing.
     */
    protected function proceduralAnalysis(array $features): array
    {
        $tempo = $features['tempo_bpm'] ?? null;
        $key = $features['estimated_key'] ?? null;

        if ($tempo === null) {
            $analysis = 'Not enough detail could be extracted from this clip to describe it — try a longer or clearer recording.';
            $genre = null;
        } else {
            $energy = $tempo >= 120 ? 'high-energy' : ($tempo >= 90 ? 'mid-tempo' : 'relaxed');
            $genre = $tempo >= 130 ? 'Dance/Electronic' : ($tempo >= 100 ? 'Pop/Rock' : 'Ballad/Acoustic');
            $analysis = "Roughly {$energy} at {$tempo} BPM" . ($key ? " in {$key}" : '') . '.';
        }

        return [
            'analysis' => $analysis,
            'bpm' => $tempo,
            'key' => $key,
            'genre' => $genre,
            'source' => 'fallback',
        ];
    }

    /**
     * Open-ended conversational reply for the per-project AI chat — music
     * ideas, songwriting/production help, or just talking through the
     * project. Same AI-with-procedural-fallback shape as every other
     * feature here: DeepSeek's own reply text when available, otherwise a
     * short, genuinely useful (if less tailored) fallback rather than
     * nothing.
     */
    public function chatReply(array $params): array
    {
        $message = trim($params['message'] ?? '');
        $project = $params['project'] ?? [];
        $history = $params['history'] ?? [];

        try {
            $reply = trim(
                $this->callDeepSeek($this->buildChatPrompt($message, $project, $history), 600)['choices'][0]['message']['content']
                    ?? ''
            );
        } catch (\Throwable $e) {
            $reply = '';
        }

        if ($reply === '') {
            return ['reply' => $this->proceduralChatReply($message), 'source' => 'fallback'];
        }

        return ['reply' => $reply, 'source' => 'ai'];
    }

    protected function buildChatPrompt(string $message, array $project, array $history): string
    {
        $name = $project['name'] ?? 'this project';
        $details = trim(implode(' ', array_filter([
            !empty($project['genre']) ? "genre {$project['genre']}," : '',
            !empty($project['bpm']) ? "{$project['bpm']} BPM," : '',
            !empty($project['key']) ? "key {$project['key']}" : '',
        ])), ', ');

        $intro = "You are MproWave's in-app AI music assistant, chatting with the artist inside their project "
            . "\"{$name}\"" . ($details !== '' ? " ({$details})" : '') . '. Help with music ideas, songwriting, '
            . 'arrangement, and production questions, or just have a normal conversation if that\'s what they want. '
            . 'Keep replies conversational and concise (a few sentences, more only if they ask for detail) — no '
            . 'markdown formatting.';

        $transcript = '';
        foreach ($history as $turn) {
            $speaker = ($turn['is_ai'] ?? false) ? 'Assistant' : 'User';
            $body = trim($turn['body'] ?? '');
            if ($body !== '') {
                $transcript .= "{$speaker}: {$body}\n";
            }
        }

        return "{$intro}\n\nConversation so far:\n{$transcript}User: {$message}\nAssistant:";
    }

    /**
     * A handful of genuinely useful, genre-agnostic starting points — not a
     * pretend understanding of what the user actually said, just enough to
     * keep the conversation moving until an AI provider is configured.
     */
    protected function proceduralChatReply(string $message): string
    {
        $lower = strtolower($message);

        if (str_contains($lower, 'idea') || str_contains($lower, 'stuck') || str_contains($lower, 'block')) {
            return "A few starting points: try flipping your chorus melody down an octave for the verse, "
                . 'swap in a call-and-response vocal line, or strip the beat back to just kick + hats for 8 bars '
                . "before the drop hits. (Connect an AI provider in the backend for replies tailored to this project.)";
        }

        if (str_contains($lower, 'mix') || str_contains($lower, 'master')) {
            return 'For a quick mix check: reference against a track you love at matched loudness, high-pass '
                . 'anything that isn\'t bass below ~80Hz, and leave a few dB of headroom before the master bus. '
                . '(Connect an AI provider in the backend for replies tailored to this project.)';
        }

        return "I hear you — I can't give a tailored reply without an AI provider connected in the backend yet, "
            . 'but feel free to keep talking through the idea; sometimes just writing it out helps.';
    }

    protected function callDeepSeek(string $prompt, int $maxTokens = 2048)
    {
        try {
            // Without an explicit timeout, a slow/hung upstream response
            // blocks indefinitely — fatal on PHP's single-threaded dev
            // server, since it freezes every other request too, not just
            // this one. Every caller already wraps this in a try/catch
            // that falls back to procedural generation, so timing out is
            // strictly better than hanging: same fallback behavior, just
            // bounded.
            $response = Http::withHeaders([
                'Content-Type' => 'application/json',
                'Authorization' => "Bearer {$this->apiKey}",
            ])->timeout(60)->post("{$this->apiUrl}/chat/completions", [
                'model' => 'deepseek-chat',
                'messages' => [
                    ['role' => 'user', 'content' => $prompt],
                ],
                'temperature' => 0.7,
                'max_tokens' => $maxTokens,
            ]);

            if ($response->failed()) {
                throw new \RuntimeException('DeepSeek API returned an error: ' . $response->body());
            }

            return $response->json();
        } catch (\Exception $e) {
            Log::error('DeepSeek API Error: ' . $e->getMessage());
            throw $e;
        }
    }

    protected function buildMidiPrompt(array $params)
    {
        $key = $params['key'] ?? 'C';
        $scale = $params['scale'] ?? 'major';
        $duration = $params['duration'] ?? 8;

        return "Generate a MIDI melody pattern in {$key} {$scale} for {$duration} bars. Return as JSON with notes array containing: [{\"note\": \"C4\", \"start\": 0, \"duration\": 0.5, \"velocity\": 80}]";
    }

    protected function buildDrumPrompt(array $params)
    {
        $style = $params['style'] ?? 'rock';
        $bpm = $params['bpm'] ?? 120;

        return "Generate a {$style} drum pattern at {$bpm} BPM as a 16-step sequence (one bar of 16th notes) "
            . 'for kick, snare, hihat, and clap. Return ONLY JSON in exactly this shape, with 1 for a hit and '
            . '0 for silence, each array containing exactly 16 numbers: '
            . '{"kick": [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0], "snare": [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], '
            . '"hihat": [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], "clap": [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}';
    }

    protected function buildInstrumentPrompt(array $params)
    {
        $instrument = $params['instrument'] ?? 'synth';
        $key = $params['key'] ?? 'C';
        $scale = $params['scale'] ?? 'major';
        $bpm = $params['bpm'] ?? 120;
        $duration = $params['duration'] ?? 8;

        $styleHint = match ($instrument) {
            'bass' => 'a rhythmic bassline built mostly from root and fifth notes, in a low octave (2-3)',
            'piano' => 'block or arpeggiated chords that fit a simple progression, in a mid octave (3-5)',
            'guitar' => 'a strummed or picked chord/riff pattern, in a mid octave (3-4)',
            'strings' => 'sustained, pad-like chords with long note durations, in a mid-to-upper octave (3-5)',
            default => 'a melodic synth lead line, in a mid-to-upper octave (4-5)',
        };

        return "Generate a {$instrument} part in {$key} {$scale} at {$bpm} BPM for {$duration} bars. "
            . "Write {$styleHint}. Return ONLY JSON with a notes array containing objects like: "
            . '[{"note": "C3", "start": 0, "duration": 0.5, "velocity": 80}]';
    }

    protected function buildSongFromLyricsPrompt(array $params)
    {
        $lyrics = trim($params['lyrics'] ?? '');

        return "You are a songwriter and vocal coach. Read these lyrics — already structured into a full "
            . "verse/hook arrangement long enough to sing as a complete song — and design how to bring them to "
            . "life musically:\n\n\"\"\"\n{$lyrics}\n\"\"\"\n\n"
            . 'Return ONLY JSON in exactly this shape: '
            . '{"key": "C", "scale": "major", "bpm": 96, "style": "pop", '
            . '"vocal_direction": "2-4 sentences of practical singing direction for THESE specific lyrics — '
            . 'phrasing, dynamics, where to breathe, where the energy should build or fall.", '
            . '"melody": [{"note": "C4", "start": 0, "duration": 1, "velocity": 85, "word": "sing"}]}. '
            . 'The melody MUST have exactly one note per word of the lyrics, in the same order the words appear '
            . '(skip blank lines), with each note\'s "word" field set to that word WITH ANY PUNCTUATION REMOVED '
            . '(e.g. the lyric "night," becomes the word "night") — this melody will be sung back word-by-word, '
            . "so a missing or extra note will throw off the vocals, and leftover punctuation would get spoken "
            . 'aloud. Instead, use the punctuation in the source lyrics to place a real gap in the timing: after '
            . 'a word that ended with a comma/semicolon/colon in the lyrics, start the next note roughly 0.35 '
            . 'beats later than the previous note\'s end (a quick breath); after a word that ended with a '
            . 'period/exclamation mark/question mark, leave roughly a 0.8 beat gap (a fuller pause) — like a '
            . 'singer actually breathing at that punctuation, not running every word together at an even '
            . 'spacing. Stay within the given key/scale, with "start" and "duration" measured in beats, and do '
            . 'not shorten or summarize the lyrics — set every single word. "style" must be exactly one of: '
            . 'rock, funk, trap, hiphop, pop, ballad.';
    }

    /**
     * Reads mood from simple keyword cues in the lyrics — it can't truly
     * understand them the way a real model can — and builds a key, tempo,
     * drum style, and a word-by-word scale-walk melody around that mood, so
     * the feature still produces a coherent, singable starting point when
     * DeepSeek is unavailable rather than nothing at all.
     */
    protected function proceduralSongFromLyrics(string $lyrics): array
    {
        $lower = strtolower($lyrics);
        $sadWords = ['sad', 'cry', 'crying', 'lonely', 'alone', 'pain', 'hurt', 'tears', 'goodbye', 'miss', 'broken', 'dark', 'lost', 'sorry', 'gone', 'cold', 'empty'];
        $happyWords = ['happy', 'dance', 'love', 'party', 'joy', 'sun', 'smile', 'alive', 'free', 'fun', 'celebrate', 'shine', 'bright', 'together', 'forever', 'dream'];

        $sadScore = 0;
        $happyScore = 0;
        foreach ($sadWords as $w) {
            if (str_contains($lower, $w)) $sadScore++;
        }
        foreach ($happyWords as $w) {
            if (str_contains($lower, $w)) $happyScore++;
        }

        $mood = $sadScore > $happyScore ? 'sad' : ($happyScore > $sadScore ? 'happy' : 'neutral');

        $moodPresets = [
            'sad' => ['keys' => ['A', 'D', 'E'], 'scale' => 'minor', 'bpmRange' => [64, 82], 'styles' => ['ballad']],
            'happy' => ['keys' => ['C', 'G', 'D'], 'scale' => 'major', 'bpmRange' => [110, 128], 'styles' => ['pop', 'funk']],
            'neutral' => ['keys' => ['C', 'G', 'F'], 'scale' => 'major', 'bpmRange' => [92, 108], 'styles' => ['pop', 'rock']],
        ];
        $preset = $moodPresets[$mood];
        $key = $preset['keys'][array_rand($preset['keys'])];
        $bpm = mt_rand($preset['bpmRange'][0], $preset['bpmRange'][1]);
        $style = $preset['styles'][array_rand($preset['styles'])];

        $lines = array_values(array_filter(array_map('trim', preg_split('/\r?\n/', $lyrics))));
        if (empty($lines)) {
            $lines = [''];
        }

        $root = $this->rootPitchClass($key);
        $intervals = $this->scaleIntervals($preset['scale']);
        $degreeCount = count($intervals);
        $baseMidi = 60 + $root;

        $melody = [];
        $degree = 0;
        $direction = 1;
        $beat = 0.0;

        foreach ($lines as $line) {
            $words = preg_split('/\s+/', $line, -1, PREG_SPLIT_NO_EMPTY);
            if (empty($words)) {
                $beat += 1.0;
                continue;
            }

            foreach ($words as $i => $word) {
                // Real singing breathes with the punctuation — a short
                // catch-breath at a comma, a fuller pause at the end of a
                // sentence — instead of running every word together at a
                // flat, even spacing. The punctuation itself is stripped
                // from the sung word (the TTS engine has nothing useful to
                // do with a lone trailing comma) and converted into extra
                // silence before the next note starts instead.
                $cleanWord = rtrim($word, ',.;:!?');
                $trailingPunct = substr($word, strlen($cleanWord));
                if ($cleanWord === '') {
                    $cleanWord = $word;
                    $trailingPunct = '';
                }
                $pauseAfter = 0.0;
                if ($trailingPunct !== '') {
                    $pauseAfter = strpbrk($trailingPunct, '.!?') !== false ? 0.85 : 0.35;
                }

                $degree += $direction * (mt_rand(0, 9) < 3 ? 2 : 1);
                if ($degree >= $degreeCount + 2) {
                    $direction = -1;
                } elseif ($degree <= 0) {
                    $direction = 1;
                    $degree = max($degree, 0);
                }

                $octaveShift = intdiv($degree, $degreeCount);
                $pitch = $baseMidi + $intervals[$degree % $degreeCount] + ($octaveShift * 12);
                $duration = $i === count($words) - 1 ? 1.0 : 0.5;

                $melody[] = [
                    'note' => $this->midiNumberToName($pitch),
                    'start' => $beat,
                    'duration' => $duration,
                    'velocity' => 70 + mt_rand(0, 20),
                    'word' => $cleanWord,
                ];
                $beat += $duration + $pauseAfter;
            }

            $beat += 0.5; // a breath between lines
        }

        $directions = [
            'sad' => "Sing this gently and slowly — soften your voice on the quieter lines, hold back until the most emotional moment, and breathe fully at the end of each line rather than rushing into the next.",
            'happy' => "Keep the delivery bright and energetic — lean into the beat, add a little lift at the end of each line, and let your energy and volume build as the song goes on.",
            'neutral' => "Sing this at a natural, conversational pace — prioritize clear diction and let the melody guide your phrasing line by line.",
        ];

        return [
            'key' => $key,
            'scale' => $preset['scale'],
            'bpm' => $bpm,
            'style' => $style,
            'vocal_direction' => $directions[$mood],
            'melody' => $melody,
        ];
    }

    /**
     * Deterministic scale-walk melody used when DeepSeek is unavailable.
     * Not meant to be a sophisticated composer — just musically sane
     * (stays in the requested key/scale) and never empty.
     */
    protected function proceduralMelody(array $params): array
    {
        $root = $this->rootPitchClass($params['key'] ?? 'C');
        $intervals = $this->scaleIntervals($params['scale'] ?? 'major');
        $bars = max(1, min(32, (int) ($params['duration'] ?? 8)));
        $baseMidi = 60 + $root;
        $degreeCount = count($intervals);

        $notes = [];
        $degree = 0;
        $direction = 1;
        $beat = 0.0;

        for ($i = 0; $i < $bars * 4; $i++) {
            $degree += $direction * (mt_rand(0, 9) < 3 ? 2 : 1);
            if ($degree >= $degreeCount + 2) {
                $direction = -1;
            } elseif ($degree <= 0) {
                $direction = 1;
                $degree = max($degree, 0);
            }

            $octaveShift = intdiv($degree, $degreeCount);
            $pitch = $baseMidi + $intervals[$degree % $degreeCount] + ($octaveShift * 12);

            $notes[] = [
                'note' => $this->midiNumberToName($pitch),
                'start' => $beat,
                'duration' => 0.5,
                'velocity' => 70 + mt_rand(0, 20),
            ];
            $beat += 0.5;
        }

        return $notes;
    }

    protected function proceduralInstrumentPattern(array $params): array
    {
        $instrument = $params['instrument'] ?? 'synth';
        $root = $this->rootPitchClass($params['key'] ?? 'C');
        $intervals = $this->scaleIntervals($params['scale'] ?? 'major');
        $bars = max(1, min(16, (int) ($params['duration'] ?? 8)));

        return match ($instrument) {
            'bass' => $this->proceduralBassline($root, $intervals, $bars),
            'piano' => $this->proceduralChords($root, $intervals, $bars, 4),
            'guitar' => $this->proceduralChords($root, $intervals, $bars, 3),
            'strings' => $this->proceduralChords($root, $intervals, $bars, 4, 3.8),
            default => $this->proceduralMelody(array_merge($params, ['duration' => $bars])),
        };
    }

    protected function proceduralBassline(int $root, array $intervals, int $bars): array
    {
        $baseMidi = 36 + $root;
        $degreeCount = count($intervals);
        $pattern = [0, 0, (int) (4 % $degreeCount), 0];

        $notes = [];
        $beat = 0.0;
        for ($bar = 0; $bar < $bars; $bar++) {
            foreach ($pattern as $degree) {
                $pitch = $baseMidi + $intervals[$degree % $degreeCount];
                $notes[] = ['note' => $this->midiNumberToName($pitch), 'start' => $beat, 'duration' => 0.9, 'velocity' => 90];
                $beat += 1.0;
            }
        }

        return $notes;
    }

    protected function proceduralChords(int $root, array $intervals, int $bars, int $octave, float $noteDuration = 3.8): array
    {
        $baseMidi = ($octave + 1) * 12 + $root;
        $degreeCount = count($intervals);
        $progression = [0, 3, 4, 0];

        $notes = [];
        $beat = 0.0;
        for ($bar = 0; $bar < $bars; $bar++) {
            $chordRoot = $progression[$bar % 4] % $degreeCount;
            foreach ([0, 2, 4] as $chordTone) {
                $degree = $chordRoot + $chordTone;
                $pitch = $baseMidi + $intervals[$degree % $degreeCount] + (intdiv($degree, $degreeCount) * 12);
                $notes[] = ['note' => $this->midiNumberToName($pitch), 'start' => $beat, 'duration' => $noteDuration, 'velocity' => 75];
            }
            $beat += 4.0;
        }

        return $notes;
    }

    protected const DRUM_VOICES = ['kick', 'snare', 'hihat', 'clap'];

    /**
     * Style-keyed 16-step patterns used when DeepSeek is unavailable.
     * Deliberately simple, genuine drum-machine patterns rather than
     * randomized noise, so a fallback beat still sounds intentional.
     */
    protected function proceduralDrumPattern(array $params): array
    {
        $style = strtolower(trim($params['style'] ?? 'rock'));

        $patterns = [
            'rock' => [
                'kick'  => [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
                'snare' => [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                'hihat' => [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
                'clap'  => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            ],
            'funk' => [
                'kick'  => [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
                'snare' => [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                'hihat' => [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                'clap'  => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
            ],
            'trap' => [
                'kick'  => [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0],
                'snare' => [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                'hihat' => [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1],
                'clap'  => [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
            ],
            'hiphop' => [
                'kick'  => [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
                'snare' => [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                'hihat' => [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
                'clap'  => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            ],
            'afrobeats' => [
                'kick'  => [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
                'snare' => [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                'hihat' => [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1],
                'clap'  => [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
            ],
            'pop' => [
                'kick'  => [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
                'snare' => [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                'hihat' => [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
                'clap'  => [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
            ],
            'ballad' => [
                'kick'  => [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                'snare' => [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
                'hihat' => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                'clap'  => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            ],
        ];

        return $patterns[$style] ?? $patterns['rock'];
    }

    protected function scaleIntervals(string $scale): array
    {
        return match (strtolower($scale)) {
            'minor', 'natural minor', 'aeolian' => [0, 2, 3, 5, 7, 8, 10],
            'dorian' => [0, 2, 3, 5, 7, 9, 10],
            'mixolydian' => [0, 2, 4, 5, 7, 9, 10],
            default => [0, 2, 4, 5, 7, 9, 11],
        };
    }

    protected function rootPitchClass(string $key): int
    {
        $map = [
            'C' => 0, 'C#' => 1, 'DB' => 1, 'D' => 2, 'D#' => 3, 'EB' => 3, 'E' => 4,
            'F' => 5, 'F#' => 6, 'GB' => 6, 'G' => 7, 'G#' => 8, 'AB' => 8, 'A' => 9,
            'A#' => 10, 'BB' => 10, 'B' => 11,
        ];

        return $map[strtoupper(trim($key))] ?? 0;
    }

    protected function midiNumberToName(int $midi): string
    {
        $names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        $octave = intdiv($midi, 12) - 1;
        $pitchClass = (($midi % 12) + 12) % 12;

        return $names[$pitchClass] . $octave;
    }

    protected function summarizeNotes(array $notes)
    {
        if (empty($notes)) {
            return 'none detected';
        }

        $pitches = array_unique(array_column($notes, 'pitch'));
        sort($pitches);

        return implode(', ', array_slice($pitches, 0, 20));
    }

    protected function parseMidiResponse($response)
    {
        $text = $response['choices'][0]['message']['content'] ?? '';

        preg_match('/\[.*\]/s', $text, $matches);

        if (!empty($matches[0])) {
            return json_decode($matches[0], true);
        }

        return [];
    }

    /**
     * Extracts and validates a {key, scale, bpm, style, vocal_direction,
     * melody} object from the LLM's response. Returns [] (triggering the
     * procedural fallback) if the response isn't valid JSON or the melody
     * is missing/empty — a song with no melody isn't a usable result.
     */
    protected function parseSongResponse($response): array
    {
        $text = $response['choices'][0]['message']['content'] ?? '';

        preg_match('/\{.*\}/s', $text, $matches);
        if (empty($matches[0])) {
            return [];
        }

        $decoded = json_decode($matches[0], true);
        if (!is_array($decoded) || empty($decoded['melody']) || !is_array($decoded['melody'])) {
            return [];
        }

        $validStyles = ['rock', 'funk', 'trap', 'hiphop', 'pop', 'ballad'];
        $style = strtolower(trim((string) ($decoded['style'] ?? 'pop')));

        // Belt-and-suspenders: the prompt asks for punctuation-free words
        // (the pause it implies is supposed to already be baked into the
        // note timing instead), but models don't always comply exactly —
        // a stray trailing comma left in would otherwise get spoken aloud
        // by the TTS step downstream.
        $melody = array_map(function ($note) {
            if (isset($note['word']) && is_string($note['word'])) {
                $note['word'] = trim($note['word'], " ,.;:!?\"'");
            }
            return $note;
        }, $decoded['melody']);

        return [
            'key' => $decoded['key'] ?? 'C',
            'scale' => $decoded['scale'] ?? 'major',
            'bpm' => (int) ($decoded['bpm'] ?? 100),
            'style' => in_array($style, $validStyles, true) ? $style : 'pop',
            'vocal_direction' => $decoded['vocal_direction'] ?? '',
            'melody' => $melody,
        ];
    }

    protected function parseHarmonyResponse($response)
    {
        $text = $response['choices'][0]['message']['content'] ?? '';

        return [
            'raw_response' => $text,
            'chords' => $this->extractChords($text),
            'detected_scale' => $this->extractScale($text),
            'suggestions' => $text,
        ];
    }

    /**
     * Extracts and validates a {"kick": [16 x 0|1], ...} object from the
     * LLM's response. Returns [] (triggering the procedural fallback) if
     * the response isn't valid JSON, is missing a voice, or any voice
     * isn't exactly 16 binary steps — a partially-broken pattern would be
     * a worse experience than a clean, reliable fallback beat.
     */
    protected function parseDrumStepsResponse($response): array
    {
        $text = $response['choices'][0]['message']['content'] ?? '';

        preg_match('/\{.*\}/s', $text, $matches);
        if (empty($matches[0])) {
            return [];
        }

        $decoded = json_decode($matches[0], true);
        if (!is_array($decoded)) {
            return [];
        }

        $pattern = [];
        foreach (self::DRUM_VOICES as $voice) {
            $steps = $decoded[$voice] ?? null;
            if (!is_array($steps) || count($steps) !== 16) {
                return [];
            }
            $pattern[$voice] = array_map(fn ($step) => (int) $step === 1 ? 1 : 0, $steps);
        }

        return $pattern;
    }

    protected function parseAnalysisResponse($response, array $features)
    {
        $text = $response['choices'][0]['message']['content'] ?? '';

        return [
            'analysis' => $text,
            'bpm' => $features['tempo_bpm'] ?? null,
            'key' => $features['estimated_key'] ?? null,
            'genre' => $this->extractGenre($text),
        ];
    }

    protected function extractChords($text)
    {
        preg_match_all('/\b([A-G][#b]?(?:maj|min|m|M|dim|aug|sus)?[0-9]?)\b/', $text, $matches);
        // array_unique() keeps the original (now non-sequential) keys, which
        // json_encode then serializes as a JSON object instead of an array —
        // breaking any client-side array method (e.g. .join()) on this field.
        return array_values(array_unique($matches[1] ?? []));
    }

    protected function extractScale($text)
    {
        preg_match('/\b([A-G][#b]?\s+(?:major|minor|dorian|mixolydian))\b/i', $text, $matches);
        return $matches[1] ?? null;
    }

    protected function extractGenre($text)
    {
        preg_match('/\bgenre[:\s]+([a-z\s]+)\b/i', $text, $matches);
        return $matches[1] ?? null;
    }

}
