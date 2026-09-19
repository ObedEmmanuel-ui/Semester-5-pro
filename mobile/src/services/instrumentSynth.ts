import { createAudioPlayer } from 'expo-audio';
import { noteNameToMidi } from '../utils/notes';

export type Instrument = 'piano' | 'bass' | 'guitar' | 'synth' | 'strings';

// Short synthesized one-shot notes (sine/harmonic additive synthesis, plus
// Karplus-Strong plucked-string modeling for guitar) — see
// mobile/assets/instruments for how they're generated. Each is rendered at
// a fixed reference pitch; playback rate shifts it to other notes.
const SAMPLES: Record<Instrument, number> = {
  piano: require('../../assets/instruments/piano.wav'),
  bass: require('../../assets/instruments/bass.wav'),
  guitar: require('../../assets/instruments/guitar.wav'),
  synth: require('../../assets/instruments/synth.wav'),
  strings: require('../../assets/instruments/strings.wav'),
};

export const REFERENCE_MIDI: Record<Instrument, number> = {
  piano: 60, // C4
  bass: 36, // C2
  guitar: 48, // C3
  synth: 60, // C4
  strings: 60, // C4
};

// expo-audio's playbackRate range is roughly 0.5–2.0 for a musical (rather
// than garbled) pitch shift, which covers about one octave either side of
// each sample's reference note — notes further out just clamp to the edge.
const MIN_RATE = 0.5;
const MAX_RATE = 2.0;

function rateForMidi(instrument: Instrument, midi: number) {
  const semitones = midi - REFERENCE_MIDI[instrument];
  const rate = Math.pow(2, semitones / 12);
  return Math.max(MIN_RATE, Math.min(MAX_RATE, rate));
}

/**
 * Plays one synthesized note for the given instrument, pitched to `midi`
 * (defaults to the instrument's own natural reference note). Each call gets
 * its own short-lived player so overlapping taps/chords don't cut each
 * other off.
 */
export function playInstrumentNote(instrument: Instrument, midi?: number, volume = 0.9) {
  const player = createAudioPlayer(SAMPLES[instrument]);
  player.shouldCorrectPitch = false;
  player.volume = Math.max(0, Math.min(1, volume));

  const rate = rateForMidi(instrument, midi ?? REFERENCE_MIDI[instrument]);
  player.setPlaybackRate(rate);
  player.play();

  const estimatedMs = 1700 / rate + 200;
  setTimeout(() => {
    try {
      player.remove();
    } catch {
      // already removed
    }
  }, estimatedMs);
}

// A custom recorded/imported sample has no fixed reference pitch, but we can
// still play it back at different speeds to approximate other notes — same
// technique as the bundled instruments, just centered on a plain C4 default
// instead of a per-instrument reference. Good enough to tap out a beat or
// melody with your own voice/sound rather than a synthesized one.
export const SAMPLE_REFERENCE_MIDI = 60;

export function playSampleNote(uri: string, midi?: number, volume = 0.9) {
  const player = createAudioPlayer(uri);
  player.shouldCorrectPitch = false;
  player.volume = Math.max(0, Math.min(1, volume));

  const semitones = (midi ?? SAMPLE_REFERENCE_MIDI) - SAMPLE_REFERENCE_MIDI;
  const rate = Math.max(MIN_RATE, Math.min(MAX_RATE, Math.pow(2, semitones / 12)));
  player.setPlaybackRate(rate);
  player.play();

  // Recorded/stem clips run longer than the short one-shot instrument
  // samples, so give them more time before releasing the player.
  setTimeout(() => {
    try {
      player.remove();
    } catch {
      // already removed
    }
  }, 8000 / rate);
}

interface PatternNote {
  note?: string;
  start?: number;
  duration?: number;
  velocity?: number;
}

/**
 * Schedules a generated note pattern (from the MIDI/instrument AI
 * generators, or a recorded keyboard performance) to play back, timed
 * against `bpm`. `voice` is either a built-in instrument, or the URI of a
 * custom recorded/stem sample (from the sample store). Returns a cancel
 * function and the pattern's total duration in milliseconds.
 */
export function playPattern(voice: Instrument | string, notes: PatternNote[], bpm = 120) {
  const beatMs = 60000 / bpm;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let totalMs = 0;

  notes.forEach((n) => {
    if (typeof n.start !== 'number') return;
    const midi = typeof n.note === 'string' ? noteNameToMidi(n.note) : null;
    const volume = Math.max(0.3, Math.min(1, (n.velocity ?? 90) / 127));
    const startMs = n.start * beatMs;
    totalMs = Math.max(totalMs, startMs + (n.duration ?? 0.5) * beatMs);

    timers.push(
      setTimeout(() => {
        if (voice === 'piano' || voice === 'bass' || voice === 'guitar' || voice === 'synth' || voice === 'strings') {
          playInstrumentNote(voice, midi ?? undefined, volume);
        } else {
          playSampleNote(voice, midi ?? undefined, volume);
        }
      }, startMs)
    );
  });

  return {
    totalMs,
    cancel: () => timers.forEach(clearTimeout),
  };
}

const INSTRUMENT_KEYWORDS: Array<[Instrument, string]> = [
  ['piano', 'piano'],
  ['bass', 'bass'],
  ['guitar', 'guitar'],
  ['strings', 'string'],
  ['synth', 'synth'],
];

/**
 * Instrument-type tracks don't have their own dedicated "instrument" column
 * — AddTrackScreen bakes the choice into the track name (e.g. "AI Bass")
 * instead. This recovers a playback voice from that name, falling back to
 * a generic synth for anything unrecognized (e.g. a user-renamed track).
 */
export function guessInstrumentFromName(name: string): Instrument {
  const lower = name.toLowerCase();
  for (const [id, keyword] of INSTRUMENT_KEYWORDS) {
    if (lower.includes(keyword)) return id;
  }
  return 'synth';
}
