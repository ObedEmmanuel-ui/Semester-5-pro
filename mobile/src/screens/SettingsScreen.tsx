import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, ThemeMode } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';

const OPTIONS: { mode: ThemeMode; label: string; description: string; icon: string }[] = [
  { mode: 'light', label: 'Light', description: 'Always use the light theme', icon: '☀️' },
  { mode: 'dark', label: 'Dark', description: 'Always use the dark theme', icon: '🌙' },
  { mode: 'auto', label: 'Auto', description: "Match your phone's system setting", icon: '⚙️' },
];

export const SettingsScreen = ({ navigation }: any) => {
  const { mode, colors, isDark, setMode } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 16, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.optionList}>
          {OPTIONS.map((option, index) => {
            const active = mode === option.mode;
            return (
              <TouchableOpacity
                key={option.mode}
                style={[styles.optionRow, index < OPTIONS.length - 1 && styles.optionRowBorder]}
                onPress={() => setMode(option.mode)}
              >
                <Text style={styles.optionIcon}>{option.icon}</Text>
                <View style={styles.optionText}>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  <Text style={styles.optionDescription}>{option.description}</Text>
                </View>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Currently showing the {isDark ? 'dark' : 'light'} theme
          {mode === 'auto' ? ' (following your system setting)' : ''}.
        </Text>
      </ScrollView>
    </View>
  );
};

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      paddingTop: 60,
      backgroundColor: colors.surface,
    },
    backButton: {
      color: colors.primary,
      fontSize: 16,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '600',
    },
    content: {
      padding: 20,
    },
    sectionLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 10,
    },
    optionList: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      overflow: 'hidden',
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 16,
    },
    optionRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceAlt,
    },
    optionIcon: {
      fontSize: 22,
    },
    optionText: {
      flex: 1,
    },
    optionLabel: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
    optionDescription: {
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioActive: {
      borderColor: colors.primary,
    },
    radioDot: {
      width: 11,
      height: 11,
      borderRadius: 6,
      backgroundColor: colors.primary,
    },
    hint: {
      color: colors.textTertiary,
      fontSize: 12,
      marginTop: 14,
      textAlign: 'center',
    },
  });
