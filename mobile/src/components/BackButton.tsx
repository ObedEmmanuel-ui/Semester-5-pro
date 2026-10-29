import React from 'react';
import { StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  onPress: () => void;
  style?: ViewStyle;
}

/**
 * The app's one standard back button — a circular dark button with a
 * chevron, used in place of every screen's old plain "<" text so navigation
 * reads the same everywhere instead of each screen styling its own.
 */
export function BackButton({ onPress, style }: Props) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.circle, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }, style]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
