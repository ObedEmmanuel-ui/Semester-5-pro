import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authService } from '../services/api';
import { ThemedInput } from '../components/ThemedInput';
import { BackButton } from '../components/BackButton';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';

export const PrivacyScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDiscoverable, setIsDiscoverable] = useState(true);
  const [allowComments, setAllowComments] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    authService
      .getCurrentUser()
      .then((user) => {
        setIsDiscoverable(user.is_discoverable ?? true);
        setAllowComments(user.allow_project_comments ?? true);
      })
      .catch((error) => console.error('Failed to load privacy settings:', error))
      .finally(() => setLoading(false));
  }, []);

  const persist = async (next: { is_discoverable: boolean; allow_project_comments: boolean }) => {
    setSaving(true);
    try {
      await authService.updatePrivacy(next);
    } catch (error) {
      console.error('Failed to update privacy settings:', error);
      Alert.alert('Error', 'Failed to save this setting. Please try again.');
      // Revert on failure
      setIsDiscoverable((prev) => (next.is_discoverable !== prev ? !next.is_discoverable : prev));
    } finally {
      setSaving(false);
    }
  };

  const toggleDiscoverable = (value: boolean) => {
    setIsDiscoverable(value);
    persist({ is_discoverable: value, allow_project_comments: allowComments });
  };

  const toggleAllowComments = (value: boolean) => {
    setAllowComments(value);
    persist({ is_discoverable: isDiscoverable, allow_project_comments: value });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await authService.exportData();
      const fileName = `mprowave-data-export-${Date.now()}.json`;
      const file = new File(Paths.cache, fileName);
      file.create({ overwrite: true });
      file.write(JSON.stringify(data, null, 2));

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing Unavailable', 'Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your MproWave data' });
    } catch (error) {
      console.error('Failed to export data:', error);
      Alert.alert('Export Failed', 'Failed to export your data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      Alert.alert('Error', 'Please enter your password to confirm.');
      return;
    }
    setDeleting(true);
    try {
      await authService.deleteAccount(deletePassword);
      setDeleteVisible(false);
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch (error: any) {
      const message = error.response?.data?.errors?.password?.[0] || 'Failed to delete account. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account, projects, tracks, voice memos, and comments. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: () => setDeleteVisible(true) },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Privacy & Data</Text>
        <View style={{ width: 34 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}>
          <Text style={styles.sectionLabel}>Discover Producers</Text>
          <View style={styles.row}>
            <View style={styles.rowIconWrap}>
              <Ionicons name="people-outline" size={18} color={colors.primaryLight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Show my profile in Discover</Text>
              <Text style={styles.rowSubtitle}>
                Turn off to hide yourself from the producer list and public activity feed. People who already follow
                you keep following you.
              </Text>
            </View>
            <Switch
              value={isDiscoverable}
              onValueChange={toggleDiscoverable}
              disabled={saving}
              trackColor={{ false: colors.surfaceAlt, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <Text style={styles.sectionLabel}>Comments</Text>
          <View style={styles.row}>
            <View style={styles.rowIconWrap}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primaryLight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Allow comments on my projects</Text>
              <Text style={styles.rowSubtitle}>
                Turn off to stop other producers from commenting on your public projects.
              </Text>
            </View>
            <Switch
              value={allowComments}
              onValueChange={toggleAllowComments}
              disabled={saving}
              trackColor={{ false: colors.surfaceAlt, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <Text style={styles.sectionLabel}>Your data</Text>
          <TouchableOpacity style={styles.actionRow} onPress={handleExport} disabled={exporting}>
            <View style={styles.rowIconWrap}>
              <Ionicons name="download-outline" size={18} color={colors.primaryLight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Download my data</Text>
              <Text style={styles.rowSubtitle}>
                Export your profile, projects, tracks, voice memos and notifications as a JSON file.
              </Text>
            </View>
            {exporting ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            )}
          </TouchableOpacity>

          <Text style={[styles.sectionLabel, { color: colors.danger }]}>Danger zone</Text>
          {!deleteVisible ? (
            <TouchableOpacity style={styles.actionRow} onPress={confirmDelete}>
              <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.danger }]}>Delete my account</Text>
                <Text style={styles.rowSubtitle}>Permanently deletes your account and all your data.</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.deleteBox}>
              <Text style={styles.rowSubtitle}>Enter your password to confirm permanent deletion.</Text>
              <ThemedInput
                style={{ marginTop: 12, marginBottom: 12 }}
                placeholder="Password"
                value={deletePassword}
                onChangeText={setDeletePassword}
                secureTextEntry
                autoCapitalize="none"
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.deleteButton, { backgroundColor: colors.surfaceAlt, flex: 1 }]}
                  onPress={() => {
                    setDeleteVisible(false);
                    setDeletePassword('');
                  }}
                  disabled={deleting}
                >
                  <Text style={[styles.deleteButtonText, { color: colors.textPrimary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deleteButton, { backgroundColor: colors.danger, flex: 1 }]}
                  onPress={handleDeleteAccount}
                  disabled={deleting}
                >
                  {deleting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.deleteButtonText}>Delete Forever</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    title: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
    sectionLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginBottom: 12,
      marginTop: 20,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
    },
    rowIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 11,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowLabel: {
      color: colors.textPrimary,
      fontSize: 14.5,
      fontWeight: '600',
      marginBottom: 3,
    },
    rowSubtitle: {
      color: colors.textTertiary,
      fontSize: 12,
      lineHeight: 17,
    },
    deleteBox: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    deleteButton: {
      height: 46,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
  });
