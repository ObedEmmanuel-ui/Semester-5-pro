import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FloatingParticles } from '../components/FloatingParticles';
import { WaveformMark } from '../components/WaveformMark';
import { colors, heroGradient } from '../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Slide {
  key: string;
}

const SLIDES: Slide[] = [{ key: 'brand' }, { key: 'pitch' }];

export const OnboardingScreen = ({ navigation }: any) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const finishOnboarding = async (destination: 'Register' | 'Login') => {
    // The splash + this carousel always play on every cold launch (by
    // design, not a bug) — but an already-signed-in user tapping through
    // should land back in the app, not get routed into a fresh
    // Register/Login form they don't need.
    try {
      const token = await AsyncStorage.getItem('auth_token');
      navigation.replace(token ? 'Main' : destination);
    } catch {
      navigation.replace(destination);
    }
  };

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(index);
  };

  const goToSlide = (index: number) => {
    listRef.current?.scrollToIndex({ index, animated: true });
  };

  return (
    <LinearGradient colors={heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
      <FloatingParticles count={16} />

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        renderItem={({ item }) =>
          item.key === 'brand' ? (
            <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
              <View style={styles.brandCenter}>
                <WaveformMark size={110} />
                <Text style={styles.brandTitle}>MproWave</Text>
                <Text style={styles.brandTagline}>Create · Collaborate · Produce</Text>
              </View>
            </View>
          ) : (
            <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
              <View style={styles.pitchHero}>
                <Ionicons name="headset" size={72} color="rgba(255,255,255,0.9)" />
              </View>
              <Text style={styles.pitchTitle}>Turn Your Ideas{'\n'}Into Real Music</Text>
              <Text style={styles.pitchBody}>
                Use AI to generate beats, vocals and complete songs. Collaborate with artists, manage your
                projects and more.
              </Text>
            </View>
          )
        }
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <TouchableOpacity key={slide.key} onPress={() => goToSlide(i)} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}>
              <View style={[styles.dot, i === activeIndex && styles.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>

        {activeIndex === SLIDES.length - 1 ? (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={() => finishOnboarding('Register')}>
              <Text style={styles.primaryButtonText}>Get Started</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryLink} onPress={() => finishOnboarding('Login')}>
              <Text style={styles.secondaryLinkText}>I already have an account</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.primaryButton} onPress={() => goToSlide(activeIndex + 1)}>
            <Text style={styles.primaryButtonText}>Next</Text>
          </TouchableOpacity>
        )}
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  brandCenter: {
    alignItems: 'center',
    gap: 14,
  },
  brandTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  brandTagline: {
    fontSize: 14,
    color: colors.textSecondary,
    letterSpacing: 0.4,
  },
  pitchHero: {
    width: 160,
    height: 160,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  pitchTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 14,
  },
  pitchBody: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  footer: {
    paddingHorizontal: 30,
    paddingBottom: 44,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    width: 22,
    backgroundColor: colors.primaryLight,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryLink: {
    marginTop: 16,
  },
  secondaryLinkText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
});
