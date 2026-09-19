import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const METER_BARS = 20;
const SILENCE_DB = -60;

/**
 * Live input-level meter shown while recording. `meterLevel` is dBFS
 * (~-160 silence to 0 clipping); we clamp to a -60..0 range since that's
 * the useful dynamic range for a mic input meter.
 */
export function RecordingMeter({ durationMillis, meterLevel }: { durationMillis: number; meterLevel: number }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const normalized = Math.max(0, Math.min(1, (meterLevel - SILENCE_DB) / -SILENCE_DB));
  const activeBars = Math.round(normalized * METER_BARS);

  return (
    <View style={styles.container}>
      <Text style={styles.duration}>{formatDuration(durationMillis)}</Text>
      <View style={styles.meter}>
        {Array.from({ length: METER_BARS }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              i < activeBars && (i > METER_BARS - 3 ? styles.barHot : styles.barActive),
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    alignItems: 'center',
    marginTop: 12,
  },
  duration: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    fontVariant: ['tabular-nums'],
  },
  meter: {
    flexDirection: 'row',
    gap: 3,
  },
  bar: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: colors.surfaceAlt,
  },
  barActive: {
    backgroundColor: colors.accentTeal,
  },
  barHot: {
    backgroundColor: colors.danger,
  },
});
