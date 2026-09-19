import React, { useEffect, useMemo, useState } from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  View,
  Image,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { authService, projectService, producerService } from '../services/api';
import { useProjectStore } from '../store/projectStore';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { ThemedInput } from '../components/ThemedInput';

const QUICK_LINKS: { label: string; icon: string; set: 'ion' | 'mci'; tab: string }[] = [
  { label: 'Home', icon: 'home-outline', set: 'ion', tab: 'Home' },
  { label: 'Projects', icon: 'folder-outline', set: 'ion', tab: 'Projects' },
  { label: 'Library', icon: 'library-outline', set: 'ion', tab: 'Library' },
  { label: 'AI Assistant', icon: 'sparkles-outline', set: 'ion', tab: 'AIAssistant' },
  { label: 'Instrument', icon: 'piano', set: 'mci', tab: 'Instrument' },
  { label: 'Discover Producers', icon: 'people-outline', set: 'ion', tab: 'DiscoverProducers' },
];

interface ProfileUser {
  id: number;
  name: string;
  email: string;
  avatar_url?: string | null;
  role?: string | null;
}

export const ProfileScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const { projects, setProjects } = useProjectStore();

  const totalBeats = useMemo(
    () => projects.reduce((sum: number, p: any) => sum + (p.tracks?.filter((t: any) => t.type === 'audio').length || 0), 0),
    [projects]
  );

  useEffect(() => {
    if (projects.length === 0) {
      projectService
        .list()
        .then((data) => setProjects(data.data || data))
        .catch((error) => console.error('Failed to load projects for stats:', error));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadUser = () => {
    return authService
      .getCurrentUser()
      .then((u) => {
        setUser(u);
        setNameDraft(u?.name || '');
        if (u?.id) {
          producerService
            .show(u.id)
            .then((data) =>
              setFollowCounts({ followers: data.user.followers_count, following: data.user.following_count })
            )
            .catch((error) => console.error('Failed to load follow counts:', error));
        }
      })
      .catch(() => setUser(null));
  };

  useEffect(() => {
    loadUser().finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await authService.logout();
    } catch {
      // token may already be invalid; log out locally regardless
    } finally {
      navigation.getParent()?.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  };

  const handleSaveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }
    setSavingName(true);
    try {
      const updated = await authService.updateProfile(trimmed);
      setUser(updated);
      setEditingName(false);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to update name');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangeAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to change your profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) {
      return;
    }

    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      const fileName = asset.fileName || `avatar-${Date.now()}.jpg`;
      const updated = await authService.uploadAvatar({
        uri: asset.uri,
        name: fileName,
        type: asset.mimeType || 'image/jpeg',
      });
      setUser(updated);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to update profile picture');
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 30,
          paddingLeft: 24 + insets.left,
          paddingRight: 24 + insets.right,
          paddingBottom: 40 + insets.bottom,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Profile</Text>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primaryLight} />
      ) : (
        <View style={styles.userCard}>
          <TouchableOpacity style={styles.avatarWrap} onPress={handleChangeAvatar} disabled={uploadingAvatar}>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>{(user?.name || '?').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color={colors.onAccent} />
              ) : (
                <Ionicons name="camera" size={14} color={colors.onAccent} />
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.identityBlock}>
            {editingName ? (
              <View style={styles.nameEditRow}>
                <ThemedInput
                  style={styles.nameInput}
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  autoFocus
                  maxLength={255}
                />
                <TouchableOpacity onPress={handleSaveName} disabled={savingName} style={styles.nameEditButton}>
                  {savingName ? (
                    <ActivityIndicator size="small" color={colors.primaryLight} />
                  ) : (
                    <Ionicons name="checkmark" size={20} color={colors.primaryLight} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setNameDraft(user?.name || '');
                    setEditingName(false);
                  }}
                  disabled={savingName}
                  style={styles.nameEditButton}
                >
                  <Ionicons name="close" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.nameRow}>
                <Text style={styles.name}>{user?.name || 'Unknown user'}</Text>
                <TouchableOpacity onPress={() => setEditingName(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="pencil" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            )}
            <Text style={styles.email}>{user?.email || ''}</Text>
            {user?.role && (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{user.role}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalBeats}</Text>
          <Text style={styles.statLabel}>Beats</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{projects.length}</Text>
          <Text style={styles.statLabel}>Projects</Text>
        </View>
        <TouchableOpacity
          style={styles.statCard}
          onPress={() =>
            user?.id && navigation.navigate('FollowList', { userId: user.id, mode: 'followers', name: 'Your' })
          }
        >
          <Text style={styles.statValue}>{followCounts.followers}</Text>
          <Text style={styles.statLabel}>Followers</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.statCard}
          onPress={() =>
            user?.id && navigation.navigate('FollowList', { userId: user.id, mode: 'following', name: 'Your' })
          }
        >
          <Text style={styles.statValue}>{followCounts.following}</Text>
          <Text style={styles.statLabel}>Following</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Quick Links</Text>
      <View style={styles.menu}>
        {QUICK_LINKS.map((link, index) => (
          <TouchableOpacity
            key={link.tab}
            style={[styles.menuRow, index < QUICK_LINKS.length - 1 && styles.menuRowBorder]}
            onPress={() => navigation.navigate(link.tab)}
          >
            {link.set === 'mci' ? (
              <MaterialCommunityIcons name={link.icon as any} size={20} color={colors.textSecondary} />
            ) : (
              <Ionicons name={link.icon as any} size={20} color={colors.textSecondary} />
            )}
            <Text style={styles.menuLabel}>{link.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Preferences</Text>
      <View style={styles.menu}>
        <TouchableOpacity style={[styles.menuRow, styles.menuRowBorder]} onPress={() => setEditingName(true)}>
          <Ionicons name="person-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.menuLabel}>Edit Profile</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.menuRow, styles.menuRowBorder]}
          onPress={() =>
            Alert.alert('Free Plan', 'You are on the Free Plan. Paid plans are not available yet.')
          }
        >
          <Ionicons name="card-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.menuLabel}>Subscription</Text>
          <Text style={styles.menuValue}>Free Plan</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.menuRow, styles.menuRowBorder]}
          onPress={() => navigation.getParent()?.navigate('Notifications')}
        >
          <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.menuLabel}>Notifications</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.menuRow, styles.menuRowBorder]}
          onPress={() => navigation.getParent()?.navigate('Settings')}
        >
          <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.menuLabel}>Settings</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => Alert.alert('Help & Support', 'Support isn\'t set up yet — check back soon.')}
        >
          <Ionicons name="help-circle-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.menuLabel}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={loggingOut}>
        {loggingOut ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.logoutText}>Log Out</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

const AVATAR_SIZE = 72;

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingTop: 70,
      paddingHorizontal: 24,
      paddingBottom: 40,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginBottom: 20,
    },
    userCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 18,
      marginBottom: 28,
    },
    avatarWrap: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
    },
    avatarImage: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      backgroundColor: colors.surfaceAlt,
    },
    avatarPlaceholder: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      color: colors.onAccent,
      fontSize: 28,
      fontWeight: '700',
    },
    avatarEditBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.surface,
    },
    identityBlock: {
      flex: 1,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    name: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.textPrimary,
      flexShrink: 1,
    },
    nameEditRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    nameInput: {
      flex: 1,
      paddingVertical: 6,
      fontSize: 16,
    },
    nameEditButton: {
      padding: 4,
    },
    email: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    roleBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 2,
      marginTop: 6,
    },
    roleBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primaryLight,
      textTransform: 'capitalize',
    },
    statsRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 28,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      gap: 4,
    },
    statValue: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    statLabel: {
      fontSize: 10,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    menuValue: {
      fontSize: 13,
      color: colors.textTertiary,
      marginRight: 4,
    },
    sectionLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 10,
    },
    menu: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 28,
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 16,
    },
    menuRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceAlt,
    },
    menuLabel: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    logoutButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 14,
      alignItems: 'center',
    },
    logoutText: {
      color: colors.onAccent,
      fontSize: 16,
      fontWeight: '600',
    },
  });
