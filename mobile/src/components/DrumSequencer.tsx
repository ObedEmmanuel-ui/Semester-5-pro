import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { DRUM_VOICES, DrumPattern, DrumVoice, playDrum } from '../services/drumSynth';

const VOICE_LABELS: Record<DrumVoice, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hihat: 'Hi-Hat',
  clap: 'Clap',
};

const VOICE_ICONS: Record<DrumVoice, React.ComponentProps<typeof Ionicons>['name']> = {
  kick: 'disc-outline',
  snare: 'grid-outline',
  hihat: 'pulse-outline',
  clap: 'sparkles-outline',
};

interface Props {
  pattern: DrumPattern;
  onChange: (pattern: DrumPattern) => void;
  activeStep?: number | null;
  accent?: string;
}

/**
 * A real, tappable 16-step drum grid — tapping a cell toggles it AND plays
 * that hit immediately, and the currently-playing column is highlighted
 * during playback. This is the "come to life" piece: previously drums were
 * a static block of AI-generated text with no sound and no interaction.
 */
export function DrumSequencer({ pattern, onChange, activeStep = null, accent }: Props) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const resolvedAccent = accent ?? colors.primaryLight;

  const toggleStep = (voice: DrumVoice, step: number) => {
    const nextValue = pattern[voice][step] ? 0 : 1;
    if (nextValue) {
      playDrum(voice);
    }
    const nextVoiceSteps = pattern[voice].map((v, i) => (i === step ? nextValue : v));
    onChange({ ...pattern, [voice]: nextVoiceSteps });
  };

  const clearVoice = (voice: DrumVoice) => {
    onChange({ ...pattern, [voice]: pattern[voice].map(() => 0) });
  };

  return (
    <View style={styles.grid}>
      {DRUM_VOICES.map((voice) => (
        <View key={voice} style={styles.row}>
          <TouchableOpacity style={styles.voiceLabelRow} onPress={() => playDrum(voice)}>
            <View style={styles.voiceIconWrap}>
              <Ionicons name={VOICE_ICONS[voice]} size={13} color={resolvedAccent} />
            </View>
            <Text style={styles.voiceLabelText}>{VOICE_LABELS[voice]}</Text>
          </TouchableOpacity>
          <View style={styles.steps}>
            {pattern[voice].map((on, step) => (
              <TouchableOpacity
                key={step}
                style={[
                  styles.cell,
                  step % 4 === 0 && styles.cellBeatStart,
                  !!on && { backgroundColor: resolvedAccent },
                  activeStep === step && styles.cellPlayhead,
                ]}
                onPress={() => toggleStep(voice, step)}
              />
            ))}
          </View>
          <TouchableOpacity style={styles.voiceMenu} onPress={() => clearVoice(voice)}>
            <Ionicons name="ellipsis-vertical" size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  grid: {
    backgroundColor: colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.surfaceAlt,
    padding: 14,
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceLabelRow: {
    width: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  voiceIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceLabelText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  steps: {
    flex: 1,
    flexDirection: 'row',
    gap: 5,
  },
  cell: {
    flex: 1,
    height: 30,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
  },
  cellBeatStart: {
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(245, 239, 230, 0.18)',
  },
  cellPlayhead: {
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
  voiceMenu: {
    width: 18,
    alignItems: 'center',
  },
});
