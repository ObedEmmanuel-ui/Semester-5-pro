import React, { useState } from 'react';
import { StyleSheet, TextInput, TextInputProps } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

interface Props extends TextInputProps {
  /**
   * Explicit palette to render with, overriding the current app theme.
   * The auth screens (fixed to the dark brand hero regardless of the
   * user's theme setting) pass their fixed dark palette here; theme-aware
   * screens can omit this and it follows the current theme automatically.
   */
  themeColors?: ThemeColors;
}

/**
 * Text input with the project's signature amber-tinted glass fill.
 * The border stays invisible until the field is focused, so the accent
 * color reads as an active/typing state rather than a static outline.
 */
export function ThemedInput({ style, onFocus, onBlur, placeholderTextColor, themeColors, ...props }: Props) {
  const { colors: contextColors } = useTheme();
  const colors = themeColors ?? contextColors;
  const styles = getStyles(colors);
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      {...props}
      placeholderTextColor={placeholderTextColor ?? colors.textSecondary}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[styles.input, focused && styles.inputFocused, style]}
    />
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  input: {
    backgroundColor: 'rgba(217, 142, 74, 0.12)',
    color: colors.textPrimary,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: 14,
    fontSize: 16,
  },
  inputFocused: {
    backgroundColor: 'rgba(217, 142, 74, 0.2)',
    borderColor: colors.primaryLight,
  },
});
