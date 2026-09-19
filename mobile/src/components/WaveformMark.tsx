import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { primaryGradient } from '../theme/colors';

// A simple vertical-bar "waveform" glyph — the reference design's app icon
// is this same idea (a soundwave made of bars) rendered as a purple-to-blue
// gradient mark, rather than the photo-based AppLogo badge used elsewhere.
const BAR_HEIGHTS = [0.4, 0.7, 1, 0.6, 0.85, 0.5];

interface WaveformMarkProps {
  size?: number;
}

export const WaveformMark = ({ size = 72 }: WaveformMarkProps) => {
  const barWidth = size / 10;
  const gap = barWidth * 0.6;

  return (
    <LinearGradient
      colors={primaryGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.wrap, { width: size, height: size, borderRadius: size * 0.28 }]}
    >
      <View style={[styles.bars, { gap }]}>
        {BAR_HEIGHTS.map((h, i) => (
          <View
            key={i}
            style={{
              width: barWidth,
              height: size * 0.55 * h,
              borderRadius: barWidth / 2,
              backgroundColor: 'rgba(255,255,255,0.95)',
            }}
          />
        ))}
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
