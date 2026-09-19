import React, { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { particleColors } from '../theme/colors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ParticleConfig {
  left: number;
  size: number;
  color: string;
  duration: number;
  delay: number;
}

function Particle({ config }: { config: ParticleConfig }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      config.delay,
      withRepeat(
        withTiming(1, { duration: config.duration, easing: Easing.linear }),
        -1,
        false
      )
    );
  }, [config]);

  const style = useAnimatedStyle(() => {
    const translateY = (1 - progress.value) * SCREEN_HEIGHT + config.size;
    // Fade in near the bottom, hold, fade out near the top.
    const opacity =
      progress.value < 0.1
        ? progress.value / 0.1
        : progress.value > 0.85
          ? (1 - progress.value) / 0.15
          : 1;

    return {
      transform: [{ translateY }],
      opacity: opacity * 0.6,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        style,
        {
          left: config.left,
          width: config.size,
          height: config.size,
          borderRadius: config.size / 2,
          backgroundColor: config.color,
        },
      ]}
    />
  );
}

/** Slow-drifting ember/spark particles used behind the auth screens. */
export function FloatingParticles({ count = 20 }: { count?: number }) {
  const particles = useMemo<ParticleConfig[]>(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        left: Math.random() * SCREEN_WIDTH,
        size: 3 + Math.random() * 5,
        color: particleColors[i % particleColors.length],
        duration: 6000 + Math.random() * 6000,
        delay: Math.random() * 6000,
      })),
    [count]
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((config, i) => (
        <Particle key={i} config={config} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
  },
});
