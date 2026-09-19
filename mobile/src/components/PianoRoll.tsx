import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect, Line } from 'react-native-svg';
import { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { noteNameToMidi } from '../utils/notes';

interface Note {
  note?: string;
  start?: number;
  duration?: number;
  velocity?: number;
}

interface PositionedNote {
  midi: number;
  start: number;
  duration: number;
  velocity: number;
}

function positionNotes(notes: Note[]): PositionedNote[] {
  return notes
    .map((n) => {
      const midi = typeof n.note === 'string' ? noteNameToMidi(n.note) : null;
      if (midi === null || typeof n.start !== 'number' || typeof n.duration !== 'number' || n.duration <= 0) {
        return null;
      }
      return {
        midi,
        start: n.start,
        duration: n.duration,
        velocity: typeof n.velocity === 'number' ? n.velocity : 90,
      };
    })
    .filter((n): n is PositionedNote => n !== null);
}

const ROW_HEIGHT = 7;
const H_PADDING = 4;

/**
 * Renders generated note data (from the MIDI/instrument AI generators) as a
 * compact piano-roll strip — pitch on the vertical axis, time on the
 * horizontal axis — instead of dumping raw JSON at the user.
 */
export function PianoRoll({
  notes,
  height = 96,
  accent,
}: {
  notes: Note[] | null | undefined;
  height?: number;
  accent?: string;
}) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const resolvedAccent = accent ?? colors.primaryLight;
  const positioned = useMemo(() => positionNotes(notes ?? []), [notes]);

  if (positioned.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>No readable notes to preview</Text>
      </View>
    );
  }

  const minMidi = Math.min(...positioned.map((n) => n.midi));
  const maxMidi = Math.max(...positioned.map((n) => n.midi));
  const span = Math.max(maxMidi - minMidi, 4);
  const contentHeight = (span + 3) * ROW_HEIGHT;
  const totalBeats = Math.max(...positioned.map((n) => n.start + n.duration), 1);

  return (
    <View style={[styles.container, { height }]}>
      <Svg width="100%" height={contentHeight} viewBox={`0 0 1000 ${contentHeight}`} preserveAspectRatio="none">
        {Array.from({ length: Math.ceil(totalBeats) + 1 }).map((_, beat) => (
          <Line
            key={`grid-${beat}`}
            x1={(beat / totalBeats) * 1000}
            x2={(beat / totalBeats) * 1000}
            y1={0}
            y2={contentHeight}
            stroke={colors.surfaceAlt}
            strokeWidth={beat % 4 === 0 ? 1.5 : 0.75}
          />
        ))}
        {positioned.map((n, i) => {
          const x = (n.start / totalBeats) * 1000 + H_PADDING / 2;
          const w = Math.max((n.duration / totalBeats) * 1000 - H_PADDING, 4);
          const rowFromTop = maxMidi + 1 - n.midi;
          const y = rowFromTop * ROW_HEIGHT;
          const opacity = 0.55 + (Math.min(n.velocity, 127) / 127) * 0.45;

          return (
            <Rect
              key={i}
              x={x}
              y={y}
              width={w}
              height={ROW_HEIGHT - 2}
              rx={2}
              fill={resolvedAccent}
              opacity={opacity}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.surfaceAlt,
  },
  empty: {
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textTertiary,
    fontSize: 12,
  },
});
