import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

export type DrumVoice = 'kick' | 'snare' | 'hihat' | 'clap';

export const DRUM_VOICES: DrumVoice[] = ['kick', 'snare', 'hihat', 'clap'];

// Short synthesized one-shot hits (sine sweep for kick, filtered-noise
// bursts for snare/hihat/clap) — see mobile/assets/drums for how they're
// generated. Unlike instrumentSynth, these play at a fixed pitch; a drum
// machine doesn't transpose its kit per note.
const SAMPLES: Record<DrumVoice, number> = {
  kick: require('../../assets/drums/kick.wav'),
  snare: require('../../assets/drums/snare.wav'),
  hihat: require('../../assets/drums/hihat.wav'),
  clap: require('../../assets/drums/clap.wav'),
};

// A small round-robin pool of pre-loaded players per voice. Creating a new
// AudioPlayer per hit (the original approach) crosses the native bridge and
// decodes the asset fresh every single time, which is exactly the kind of
// per-hit latency that makes a step sequencer feel loose instead of tight —
// a real drum machine has its samples already loaded and just retriggers
// them. A pool (rather than one player per voice) lets a fast-repeating
// voice like closed hi-hats retrigger without cutting its own tail off.
const POOL_SIZE = 4;
const pools: Record<DrumVoice, AudioPlayer[]> = { kick: [], snare: [], hihat: [], clap: [] };
const poolCursor: Record<DrumVoice, number> = { kick: 0, snare: 0, hihat: 0, clap: 0 };

function getPlayer(voice: DrumVoice): AudioPlayer {
  const pool = pools[voice];
  if (pool.length < POOL_SIZE) {
    const player = createAudioPlayer(SAMPLES[voice]);
    pool.push(player);
    return player;
  }
  const player = pool[poolCursor[voice]];
  poolCursor[voice] = (poolCursor[voice] + 1) % pool.length;
  return player;
}

/** Plays one drum hit immediately, from a pre-loaded pooled player. */
export function playDrum(voice: DrumVoice, volume = 1) {
  const player = getPlayer(voice);
  player.volume = Math.max(0, Math.min(1, volume));
  player.seekTo(0);
  player.play();
}

export type DrumPattern = Record<DrumVoice, number[]>;

export interface DrumTransport {
  cancel: () => void;
}

/**
 * Runs a continuously-looping step sequencer at the given BPM — like a real
 * drum machine's transport, it keeps looping until `cancel()` is called, not
 * just one pass through the bar. `getPattern` is called fresh on every step
 * rather than the pattern being captured once, so toggling cells while it's
 * playing takes effect on the very next step, the same way editing a
 * pattern mid-playback works in FL Studio's step sequencer. The step count
 * is read from the pattern itself (kick's length) rather than assumed to be
 * 16, so an 8- or 32-step grid loops correctly too.
 */
export function playDrumPattern(
  getPattern: () => DrumPattern,
  bpm: number,
  onStep?: (step: number) => void
): DrumTransport {
  const stepMs = 60000 / bpm / 4; // a 16th note
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // Anchor to a fixed start time and compute each step's absolute due time
  // rather than chaining `setTimeout(tick, stepMs)` — the latter re-arms
  // relative to whenever the previous callback actually ran, so any single
  // late tick permanently shifts every step after it. Scheduling against
  // the elapsed wall-clock time keeps the overall tempo accurate even if
  // an individual callback is a few ms late.
  const startTime = Date.now();
  let stepCount = 0;

  const tick = () => {
    if (cancelled) return;

    const pattern = getPattern();
    const stepsPerBar = pattern.kick?.length || 16;
    const step = stepCount % stepsPerBar;
    onStep?.(step);

    DRUM_VOICES.forEach((voice) => {
      if (pattern[voice]?.[step]) {
        playDrum(voice);
      }
    });

    stepCount += 1;
    const dueAt = stepCount * stepMs;
    const delay = Math.max(0, startTime + dueAt - Date.now());
    timer = setTimeout(tick, delay);
  };

  tick();

  return {
    cancel: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  };
}

/** An empty (silent) pattern with the given number of steps (default 16). */
export function emptyDrumPattern(steps = 16): DrumPattern {
  return {
    kick: Array(steps).fill(0),
    snare: Array(steps).fill(0),
    hihat: Array(steps).fill(0),
    clap: Array(steps).fill(0),
  };
}

/**
 * Re-lengthens every voice in a pattern to `steps` — tiling (repeating) it
 * to fill a longer grid, or truncating to a shorter one — so switching step
 * counts transforms the real pattern the user built instead of discarding
 * it or leaving stale, wrongly-sized arrays behind.
 */
export function resizeDrumPattern(pattern: DrumPattern, steps: number): DrumPattern {
  const resized = {} as DrumPattern;
  DRUM_VOICES.forEach((voice) => {
    const source = pattern[voice] || [];
    if (source.length === 0) {
      resized[voice] = Array(steps).fill(0);
      return;
    }
    resized[voice] = Array.from({ length: steps }, (_, i) => source[i % source.length]);
  });
  return resized;
}
