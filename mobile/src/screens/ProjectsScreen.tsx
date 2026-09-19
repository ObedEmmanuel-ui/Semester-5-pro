import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { projectService } from '../services/api';
import { useProjectStore } from '../store/projectStore';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors, coverGradients } from '../theme/colors';
import { CreateProjectModal } from '../components/CreateProjectModal';

function coverGradientFor(id: number) {
  return coverGradients[id % coverGradients.length];
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

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'archived', label: 'Archived' },
] as const;

function statusLabel(status?: string) {
  if (status === 'completed') return 'Completed';
  if (status === 'archived') return 'Archived';
  return 'Active';
}

function statusColor(colors: ThemeColors, status?: string) {
  if (status === 'completed') return colors.accentTeal;
  if (status === 'archived') return colors.textTertiary;
  return colors.primaryLight;
}

// Project.status is a real, persisted column (added alongside genre/due_date),
// so these filter chips reflect genuine data rather than a fabricated status.
export const ProjectsScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<(typeof STATUS_FILTERS)[number]['key']>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { projects, setProjects, setCurrentProject } = useProjectStore();

  useEffect(() => {
    loadProjects();
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

  const createNewProject = () => setShowCreateModal(true);

  const performCreateProject = async (name: string) => {
    try {
      const newProject = await projectService.create({
        name,
        bpm: 120,
        key: 'C',
        time_signature: '4/4',
      });
      setCurrentProject(newProject);
      setShowCreateModal(false);
      navigation.navigate('Editor', { projectId: newProject.id });
    } catch (error) {
      console.error('Failed to create project:', error);
      Alert.alert('Error', 'Failed to create project. Please try again.');
    }
  };

  const openProject = async (project: any) => {
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
    Alert.alert('Delete Project', `Delete "${project.name}"? This cannot be undone.`, [
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
    ]);
  };

  const sorted = useMemo(
    () =>
      [...projects].sort(
        (a: any, b: any) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
      ),
    [projects]
  );

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: sorted.length, active: 0, completed: 0, archived: 0 };
    sorted.forEach((p: any) => {
      const status = p.status || 'active';
      result[status] = (result[status] || 0) + 1;
    });
    return result;
  }, [sorted]);

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return sorted;
    return sorted.filter((p: any) => (p.status || 'active') === activeFilter);
  }, [sorted, activeFilter]);

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
        data={filtered}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{
          paddingBottom: 40 + insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryLight} />}
        ListHeaderComponent={
          <View>
            <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
              <Text style={styles.title}>My Projects</Text>
              <TouchableOpacity style={styles.newButton} onPress={createNewProject}>
                <Ionicons name="add" size={22} color={colors.onAccent} />
              </TouchableOpacity>
            </View>
            <View style={styles.filterRow}>
              {STATUS_FILTERS.map((filter) => {
                const active = activeFilter === filter.key;
                return (
                  <TouchableOpacity
                    key={filter.key}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setActiveFilter(filter.key)}
                  >
                    <Text style={active ? styles.filterChipTextActive : styles.filterChipText}>
                      {filter.label} ({counts[filter.key] || 0})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
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
              <Ionicons name="musical-notes" size={20} color="#FFFFFF" />
            </LinearGradient>
            <View style={styles.projectBody}>
              <View style={styles.projectNameRow}>
                <Text style={styles.projectName} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: `${statusColor(colors, item.status)}22` }]}>
                  <Text style={[styles.statusBadgeText, { color: statusColor(colors, item.status) }]}>
                    {statusLabel(item.status)}
                  </Text>
                </View>
              </View>
              <Text style={styles.projectInfo}>
                {item.bpm} BPM • {item.key}
                {item.genre ? ` • ${item.genre}` : ''}
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
            <Text style={styles.emptyText}>No projects yet</Text>
            <Text style={styles.emptySubtext}>Tap the + button to start your first track</Text>
          </View>
        }
      />

      <CreateProjectModal
        visible={showCreateModal}
        defaultName={`Project ${projects.length + 1}`}
        onCancel={() => setShowCreateModal(false)}
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
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    newButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 20,
      marginBottom: 16,
    },
    filterChip: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: colors.surface,
    },
    filterChipActive: {
      backgroundColor: colors.primary,
    },
    filterChipTextActive: {
      color: colors.onAccent,
      fontSize: 13,
      fontWeight: '700',
    },
    filterChipText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    projectNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 3,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
    },
    statusBadgeText: {
      fontSize: 10,
      fontWeight: '700',
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
      flexShrink: 1,
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
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
      marginTop: 60,
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
