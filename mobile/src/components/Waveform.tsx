import React from 'react';
import { View, StyleSheet } from 'react-native';

interface WaveformProps {
  peaks?: number[] | null;
  height?: number;
  color: string;
  backgroundColor?: string;
}

/**
 * A lightweight waveform preview drawn from a small array of 0-1 peak
 * values computed server-side on upload — plain Views rather than SVG or
 * a native audio-decoding module, since there's nothing to draw but a row
 * of bars.
 */
export const Waveform = ({ peaks, height = 40, color, backgroundColor }: WaveformProps) => {
  if (!peaks || peaks.length === 0) {
    return null;
  }

  return (
    <View style={[styles.row, { height, backgroundColor }]}>
      {peaks.map((peak, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            {
              height: Math.max(2, peak * height),
              backgroundColor: color,
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    borderRadius: 6,
    paddingHorizontal: 4,
  },
  bar: {
    flex: 1,
    minWidth: 1,
    borderRadius: 1,
  },
});
