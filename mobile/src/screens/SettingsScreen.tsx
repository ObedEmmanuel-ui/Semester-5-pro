import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, ThemeMode } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';

const OPTIONS: {
  mode: ThemeMode;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { mode: 'light', label: 'Light', description: 'Always use the light theme', icon: 'sunny' },
  { mode: 'dark', label: 'Dark', description: 'Always use the dark theme', icon: 'moon' },
  { mode: 'auto', label: 'Auto', description: "Match your phone's system setting", icon: 'settings-sharp' },
];

export const SettingsScreen = ({ navigation }: any) => {
  const { mode, colors, isDark, setMode } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();

  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null);
  const showInfo = (title: string, message: string) => setInfoModal({ title, message });

  // These four don't all have a real dedicated screen yet — where one
  // doesn't exist, the row is honest about that (a plain message) instead
  // of opening a fake settings page with toggles that don't do anything.
  const MORE_LINKS: {
    key: string;
    label: string;
    subtitle: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    color: string;
    onPress: () => void;
  }[] = [
    {
      key: 'account',
      label: 'Account',
      subtitle: 'Manage your profile & security',
      icon: 'person-outline',
      color: '#9B7BFF',
      onPress: () => navigation.navigate('ChangePassword'),
    },
    {
      key: 'notifications',
      label: 'Notifications',
      subtitle: 'Control your alerts',
      icon: 'notifications-outline',
      color: '#F2A6E0',
      onPress: () => navigation.navigate('Notifications'),
    },
    {
      key: 'privacy',
      label: 'Privacy',
      subtitle: 'Data & permissions',
      icon: 'lock-closed-outline',
      color: '#4F8CFF',
      onPress: () => navigation.navigate('Privacy'),
    },
    {
      key: 'help',
      label: 'Help & Support',
      subtitle: 'Get help or contact us',
      icon: 'help-circle-outline',
      color: '#34D399',
      onPress: () => showInfo('Help & Support', "Support isn't set up yet — check back soon."),
    },
  ];

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 16, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backCircle}>
          <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.headerSubtitle}>Customize your experience</Text>
        </View>
        <View style={{ width: 32 }} />
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
        {OPTIONS.map((option) => {
          const active = mode === option.mode;
          return (
            <TouchableOpacity
              key={option.mode}
              style={[styles.optionCard, active && styles.optionCardActive]}
              onPress={() => setMode(option.mode)}
            >
              <View style={[styles.optionIconWrap, active && styles.optionIconWrapActive]}>
                <Ionicons name={option.icon} size={22} color={active ? colors.primaryLight : colors.textSecondary} />
              </View>
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
        <Text style={styles.hint}>
          Currently showing the {isDark ? 'dark' : 'light'} theme
          {mode === 'auto' ? ' (following your system setting)' : ''}.
        </Text>

        <View style={styles.moreMenu}>
          {MORE_LINKS.map((link, index) => (
            <TouchableOpacity
              key={link.key}
              style={[styles.moreRow, index < MORE_LINKS.length - 1 && styles.moreRowBorder]}
              onPress={link.onPress}
            >
              <View style={[styles.moreIconWrap, { backgroundColor: `${link.color}22` }]}>
                <Ionicons name={link.icon} size={18} color={link.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionLabel}>{link.label}</Text>
                <Text style={styles.moreSubtitle}>{link.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={!!infoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconBox}>
              <Ionicons name="sparkles" size={22} color={colors.primaryLight} />
            </View>
            <Text style={styles.modalTitle}>{infoModal?.title}</Text>
            <Text style={styles.modalMessage}>{infoModal?.message}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setInfoModal(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    backCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '700',
      textAlign: 'center',
    },
    headerSubtitle: {
      color: colors.textTertiary,
      fontSize: 11.5,
      textAlign: 'center',
      marginTop: 2,
    },
    content: {
      padding: 20,
    },
    sectionLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginBottom: 14,
    },
    optionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    optionCardActive: {
      borderColor: colors.primary,
      backgroundColor: colors.surfaceAlt,
      shadowColor: colors.primary,
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4,
    },
    optionIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionIconWrapActive: {
      backgroundColor: 'rgba(124, 92, 252, 0.18)',
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
      marginTop: 6,
      marginBottom: 24,
      textAlign: 'center',
    },
    moreMenu: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      overflow: 'hidden',
    },
    moreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 16,
    },
    moreRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceAlt,
    },
    moreIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    moreSubtitle: {
      color: colors.textTertiary,
      fontSize: 11.5,
      marginTop: 2,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    modalCard: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalIconBox: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 10,
    },
    modalMessage: {
      fontSize: 14,
      lineHeight: 22,
      color: colors.textSecondary,
      marginBottom: 20,
    },
    modalButton: {
      height: 48,
      borderRadius: 12,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalButtonText: {
      color: colors.onAccent,
      fontSize: 15,
      fontWeight: '600',
    },
  });
