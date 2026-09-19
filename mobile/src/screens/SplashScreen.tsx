import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { WaveformMark } from '../components/WaveformMark';
import { colors } from '../theme/colors';

// The app's true launch splash — brand mark + tagline over a dark gradient
// with a soft layered wave graphic at the bottom, shown briefly on every
// cold start before the onboarding carousel. Auto-advances; nothing to tap.
export const SplashScreen = ({ navigation }: any) => {
  useEffect(() => {
    const timer = setTimeout(() => navigation.replace('Onboarding'), 1800);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <LinearGradient colors={['#0B0A12', '#0B0A12']} style={styles.container}>
      <View style={styles.center}>
        <WaveformMark size={96} />
        <Text style={styles.title}>MproWave</Text>
        <Text style={styles.tagline}>Your Sound. Our AI.</Text>
      </View>

      <Svg style={styles.waves} viewBox="0 0 400 220" preserveAspectRatio="none">
        <Path
          d="M0,140 C80,190 160,90 240,130 C300,160 350,120 400,150 L400,220 L0,220 Z"
          fill="#3ED9C7"
          opacity={0.28}
        />
        <Path
          d="M0,160 C90,110 170,200 260,150 C320,115 360,170 400,140 L400,220 L0,220 Z"
          fill="#4F8CFF"
          opacity={0.32}
        />
        <Path
          d="M0,190 C100,150 200,210 300,170 C340,155 370,185 400,175 L400,220 L0,220 Z"
          fill="#7C5CFC"
          opacity={0.4}
        />
      </Svg>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  tagline: {
    fontSize: 13,
    color: colors.textSecondary,
    letterSpacing: 0.4,
  },
  waves: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 220,
  },
});
