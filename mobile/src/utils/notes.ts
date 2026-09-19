const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0, 'C#': 1, DB: 1, D: 2, 'D#': 3, EB: 3, E: 4, F: 5,
  'F#': 6, GB: 6, G: 7, 'G#': 8, AB: 8, A: 9, 'A#': 10, BB: 10, B: 11,
};

/** Parses a note name like "C4" or "D#3" into a MIDI number (C4 = 60). */
export function noteNameToMidi(name: string): number | null {
  const match = /^([A-Ga-g])([#bB]?)(-?\d+)$/.exec(name.trim());
  if (!match) return null;

  const [, letter, accidental, octaveStr] = match;
  const key = letter.toUpperCase() + (accidental ? accidental.toUpperCase() : '');
  const semitone = NOTE_TO_SEMITONE[key];
  if (semitone === undefined) return null;

  return (parseInt(octaveStr, 10) + 1) * 12 + semitone;
}

const SEMITONE_TO_NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Converts a MIDI number (60 = C4) into a note name like "C4" or "D#3". */
export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const semitone = ((midi % 12) + 12) % 12;
  return `${SEMITONE_TO_NOTE[semitone]}${octave}`;
}
