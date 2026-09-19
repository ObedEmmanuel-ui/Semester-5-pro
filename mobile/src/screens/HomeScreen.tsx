import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authService, projectService } from '../services/api';
import { useProjectStore } from '../store/projectStore';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors, quickActionColors, coverGradients } from '../theme/colors';
import { hasUnreadNotifications } from './NotificationsScreen';
import { CreateProjectModal } from '../components/CreateProjectModal';

function greetingForHour(hour: number) {
  if (hour < 5) return 'Working Late';
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function timeAgo(dateString?: string) {
  if (!dateString) return '';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// Deterministic (by id) so a project's card color stays stable across
// reloads instead of reshuffling every time the list re-renders.
function coverGradientFor(id: number) {
  return coverGradients[id % coverGradients.length];
}

interface QuickAction {
  key: string;
  label: string;
  sub: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: { icon: string; tint: string };
  onPress: () => void;
}

export const HomeScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [hasUnread, setHasUnread] = useState(false);
  const [createModalIntent, setCreateModalIntent] = useState<'editor' | 'addTrack' | null>(null);
  const { projects, setProjects, setCurrentProject } = useProjectStore();

  useEffect(() => {
    loadProjects();
    authService
      .getCurrentUser()
      .then((u: any) => {
        setUserName(u?.name?.split(' ')[0] || null);
        setAvatarUrl(u?.avatar_url || null);
      })
      .catch(() => {
        setUserName(null);
        setAvatarUrl(null);
      });
    hasUnreadNotifications().then(setHasUnread);
  }, []);

  const loadProjects = async () => {
    try {
      const data = await projectService.list();
      setProjects(data.data || data);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProjects();
    setRefreshing(false);
  };

  // AddTrackScreen silently no-ops without a currentProject (it has no
  // fallback UI for "no project selected"), so "Upload Beat" also creates a
  // fresh project first, same as "Create Project" — just with a different
  // destination once it's named and created.
  const createNewProject = () => setCreateModalIntent('editor');
  const handleUploadBeat = () => setCreateModalIntent('addTrack');

  const performCreateProject = async (name: string) => {
    try {
      const newProject = await projectService.create({
        name,
        bpm: 120,
        key: 'C',
        time_signature: '4/4',
      });
      setCurrentProject(newProject);
      setCreateModalIntent(null);
      if (createModalIntent === 'addTrack') {
        navigation.navigate('AddTrack');
      } else {
        navigation.navigate('Editor', { projectId: newProject.id });
      }
    } catch (error) {
      console.error('Failed to create project:', error);
      Alert.alert('Error', 'Failed to create project. Please try again.');
    }
  };

  const openProject = async (project: any) => {
    // `project` here is whatever the last loadProjects() call cached in the
    // list — if a track was added last time this project was open, that
    // list entry is now stale (addTrack only updates currentProject, not
    // the matching entry in `projects`). Fetching fresh here is what makes
    // "leave and come back" show the real current state instead of
    // reverting to whatever the list happened to have.
    navigation.navigate('Editor', { projectId: project.id });
    setCurrentProject(project);
    try {
      const fresh = await projectService.get(project.id);
      setCurrentProject(fresh);
    } catch (error) {
      console.error('Failed to load latest project data:', error);
    }
  };

  const confirmDeleteProject = (project: any) => {
    Alert.alert(
      'Delete Project',
      `Delete "${project.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await projectService.delete(project.id);
              setProjects(projects.filter((p: any) => p.id !== project.id));
            } catch (error) {
              console.error('Failed to delete project:', error);
              Alert.alert('Error', 'Failed to delete project. Please try again.');
            }
          },
        },
      ]
    );
  };

  const totalTracks = useMemo(
    () => projects.reduce((sum: number, p: any) => sum + (p.tracks?.length || 0), 0),
    [projects]
  );

  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.trim().toLowerCase();
    return projects.filter((p: any) => p.name?.toLowerCase().includes(q));
  }, [projects, search]);

  // "Collaborators" has no real backend concept yet (no multi-user/sharing
  // feature) — shown honestly as 0 rather than a fabricated number, purely
  // to match the reference layout's 3-stat row.
  const quickActions: QuickAction[] = [
    {
      key: 'generate-song',
      label: 'Generate Song',
      sub: 'With AI',
      icon: 'musical-notes',
      color: quickActionColors.generateSong,
      onPress: () => navigation.navigate('AIAssistant'),
    },
    {
      key: 'upload-beat',
      label: 'Upload Beat',
      sub: 'From file',
      icon: 'cloud-upload-outline',
      color: quickActionColors.uploadBeat,
      onPress: handleUploadBeat,
    },
    {
      key: 'voice-memo',
      label: 'Voice Memo',
      sub: 'Record idea',
      icon: 'mic-outline',
      color: quickActionColors.voiceMemo,
      onPress: () => navigation.navigate('VoiceMemoStudio'),
    },
    {
      key: 'create-project',
      label: 'Create Project',
      sub: 'Start fresh',
      icon: 'add-circle-outline',
      color: quickActionColors.createProject,
      onPress: createNewProject,
    },
  ];

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primaryLight} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        data={filteredProjects}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: 40 + insets.bottom, paddingLeft: insets.left, paddingRight: insets.right },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryLight} />
        }
        ListHeaderComponent={
          <View>
            <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
              <View style={styles.headerText}>
                <Text style={styles.greeting}>{greetingForHour(new Date().getHours())},</Text>
                <Text style={styles.greetingName}>{userName || 'there'}</Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.bellButton}
                  onPress={() => {
                    setHasUnread(false);
                    navigation.getParent()?.navigate('Notifications');
                  }}
                >
                  <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
                  {hasUnread && <View style={styles.unreadDot} />}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarInitial}>{(userName || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.searchBar}>
              <Ionicons name="search" size={16} color={colors.textTertiary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search beats, projects..."
                placeholderTextColor={colors.textTertiary}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{totalTracks}</Text>
                <Text style={styles.statLabel}>Total Beats</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{projects.length}</Text>
                <Text style={styles.statLabel}>Active Projects</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>0</Text>
                <Text style={styles.statLabel}>Collaborators</Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Quick Actions</Text>
            <View style={styles.quickGrid}>
              {quickActions.map((action) => (
                <TouchableOpacity key={action.key} style={styles.quickCard} onPress={action.onPress}>
                  <View style={[styles.quickIconWrap, { backgroundColor: action.color.tint }]}>
                    <Ionicons name={action.icon} size={20} color={action.color.icon} />
                  </View>
                  <Text style={styles.quickLabel}>{action.label}</Text>
                  <Text style={styles.quickSub}>{action.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {projects.length > 0 && (
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionLabel, { paddingHorizontal: 0, marginBottom: 0 }]}>
                  {search ? `Results (${filteredProjects.length})` : 'Recent Projects'}
                </Text>
                {!search && (
                  <TouchableOpacity onPress={createNewProject}>
                    <Text style={styles.seeAllText}>+ New</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.projectCard}
            onPress={() => openProject(item)}
            onLongPress={() => confirmDeleteProject(item)}
          >
            <LinearGradient
              colors={coverGradientFor(item.id)}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.projectCover}
            >
              <Ionicons name="musical-notes" size={18} color="#FFFFFF" />
            </LinearGradient>
            <View style={styles.projectBody}>
              <Text style={styles.projectName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.projectInfo}>
                {item.bpm} BPM • {item.key}
              </Text>
              <View style={styles.projectMetaRow}>
                <Ionicons name="layers-outline" size={12} color={colors.textTertiary} />
                <Text style={styles.projectMetaText}>
                  {item.tracks?.length || 0} track{item.tracks?.length === 1 ? '' : 's'}
                </Text>
                {item.updated_at && (
                  <>
                    <Text style={styles.projectMetaDot}>•</Text>
                    <Text style={styles.projectMetaText}>{timeAgo(item.updated_at)}</Text>
                  </>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="musical-notes-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyText}>
              {search ? 'No projects match your search' : 'No projects yet'}
            </Text>
            {!search && (
              <Text style={styles.emptySubtext}>Tap a Quick Action above to start your first track</Text>
            )}
          </View>
        }
      />

      <CreateProjectModal
        visible={createModalIntent !== null}
        defaultName={`Project ${projects.length + 1}`}
        onCancel={() => setCreateModalIntent(null)}
        onCreate={performCreateProject}
      />
    </View>
  );
};

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    listContent: {
      paddingBottom: 40,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingHorizontal: 20,
      paddingBottom: 18,
    },
    headerText: {
      flexShrink: 1,
    },
    greeting: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    greetingName: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 2,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    bellButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unreadDot: {
      position: 'absolute',
      top: 8,
      right: 9,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#FF3B30',
    },
    avatarImage: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceAlt,
    },
    avatarPlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      color: colors.onAccent,
      fontSize: 16,
      fontWeight: '700',
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 14,
      marginHorizontal: 20,
      marginBottom: 16,
      height: 46,
    },
    searchInput: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 14,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 20,
      marginBottom: 22,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 10,
      alignItems: 'center',
      gap: 4,
    },
    statValue: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    statLabel: {
      fontSize: 10,
      color: colors.textSecondary,
      fontWeight: '600',
      textAlign: 'center',
    },
    sectionLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      paddingHorizontal: 20,
      marginBottom: 10,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      marginBottom: 10,
    },
    seeAllText: {
      color: colors.primaryLight,
      fontSize: 12,
      fontWeight: '700',
    },
    quickGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 20,
      gap: 12,
      marginBottom: 24,
    },
    quickCard: {
      flexBasis: '47%',
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
      gap: 8,
    },
    quickIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    quickSub: {
      fontSize: 11,
      color: colors.textTertiary,
      marginTop: -4,
    },
    projectCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      marginHorizontal: 20,
      marginBottom: 12,
      padding: 14,
      borderRadius: 16,
      gap: 12,
    },
    projectCover: {
      width: 46,
      height: 46,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    projectBody: {
      flex: 1,
    },
    projectName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 3,
    },
    projectInfo: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    projectMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    projectMetaText: {
      fontSize: 11,
      color: colors.textTertiary,
    },
    projectMetaDot: {
      fontSize: 11,
      color: colors.textTertiary,
      marginHorizontal: 2,
    },
    emptyState: {
      alignItems: 'center',
      marginTop: 40,
      gap: 10,
      paddingHorizontal: 40,
    },
    emptyText: {
      fontSize: 17,
      color: colors.textSecondary,
      fontWeight: '600',
      textAlign: 'center',
    },
    emptySubtext: {
      fontSize: 13,
      color: colors.textTertiary,
      textAlign: 'center',
    },
  });
