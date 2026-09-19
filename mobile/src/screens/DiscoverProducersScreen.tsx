import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { producerService } from '../services/api';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';

interface Producer {
  id: number;
  name: string;
  role: string | null;
  avatar_url: string | null;
  followers_count: number;
  following_count: number;
  is_following: boolean;
}

interface ActivityComment {
  id: number;
  body: string;
  created_at: string;
  user: { id: number; name: string };
  project: { id: number; name: string; user: { id: number; name: string } };
}

function timeAgo(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const DiscoverProducersScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const [producers, setProducers] = useState<Producer[]>([]);
  const [activity, setActivity] = useState<ActivityComment[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [followingBusy, setFollowingBusy] = useState<number | null>(null);

  const load = useCallback(async (query?: string) => {
    setLoading(true);
    try {
      const data = await producerService.list(query);
      setProducers(data.data || data);
    } catch (error) {
      console.error('Failed to load producers:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    producerService
      .activity()
      .then((data) => setActivity(data.data || data))
      .catch((error) => console.error('Failed to load activity feed:', error));
  }, [load]);

  useEffect(() => {
    const timeout = setTimeout(() => load(search), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const toggleFollow = async (producer: Producer) => {
    setFollowingBusy(producer.id);
    const wasFollowing = producer.is_following;
    setProducers((prev) =>
      prev.map((p) =>
        p.id === producer.id
          ? { ...p, is_following: !wasFollowing, followers_count: p.followers_count + (wasFollowing ? -1 : 1) }
          : p
      )
    );
    try {
      if (wasFollowing) {
        await producerService.unfollow(producer.id);
      } else {
        await producerService.follow(producer.id);
      }
    } catch (error) {
      console.error('Failed to toggle follow:', error);
      setProducers((prev) =>
        prev.map((p) =>
          p.id === producer.id
            ? { ...p, is_following: wasFollowing, followers_count: p.followers_count + (wasFollowing ? 1 : -1) }
            : p
        )
      );
    } finally {
      setFollowingBusy(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Discover Producers</Text>
        <View style={{ width: 20 }} />
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search producers..."
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

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={producers}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 + insets.bottom }}
          ListHeaderComponent={
            activity.length > 0 ? (
              <View style={styles.activitySection}>
                <Text style={styles.activityTitle}>Recent Activity</Text>
                {activity.slice(0, 5).map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.activityRow}
                    onPress={() =>
                      navigation.navigate('ProjectComments', {
                        projectId: item.project.id,
                        projectName: item.project.name,
                      })
                    }
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primaryLight} />
                    <Text style={styles.activityText} numberOfLines={2}>
                      <Text style={styles.activityBold}>{item.user.name}</Text> commented on{' '}
                      <Text style={styles.activityBold}>{item.project.user.name}</Text>'s "{item.project.name}"
                    </Text>
                    <Text style={styles.activityTime}>{timeAgo(item.created_at)}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={styles.sectionLabel}>All Producers</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate('ProducerProfile', { userId: item.id })}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowMeta}>
                  {item.followers_count} follower{item.followers_count === 1 ? '' : 's'}
                  {item.role ? ` · ${item.role}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.followButton, item.is_following && styles.followButtonActive]}
                onPress={() => toggleFollow(item)}
                disabled={followingBusy === item.id}
              >
                {followingBusy === item.id ? (
                  <ActivityIndicator size="small" color={item.is_following ? colors.textSecondary : colors.onAccent} />
                ) : (
                  <Text style={[styles.followButtonText, item.is_following && styles.followButtonTextActive]}>
                    {item.is_following ? 'Following' : 'Follow'}
                  </Text>
                )}
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={44} color={colors.textTertiary} />
              <Text style={styles.emptyText}>{search ? 'No producers match your search' : 'No other producers yet'}</Text>
            </View>
          }
        />
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
    backButton: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
    title: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
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
    searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      marginBottom: 12,
      padding: 12,
      borderRadius: 16,
      gap: 12,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
    rowBody: { flex: 1 },
    rowName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
    rowMeta: { fontSize: 12, color: colors.textTertiary, textTransform: 'capitalize' },
    followButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.primary,
      minWidth: 92,
      alignItems: 'center',
    },
    followButtonActive: { backgroundColor: colors.surfaceAlt },
    followButtonText: { color: colors.onAccent, fontSize: 13, fontWeight: '700' },
    followButtonTextActive: { color: colors.textSecondary },
    emptyState: { alignItems: 'center', marginTop: 60, gap: 10, paddingHorizontal: 40 },
    emptyText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600', textAlign: 'center' },
    activitySection: { marginBottom: 8 },
    activityTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 10,
    },
    activityRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
    },
    activityText: {
      flex: 1,
      fontSize: 12.5,
      color: colors.textSecondary,
      lineHeight: 17,
    },
    activityBold: {
      fontWeight: '700',
      color: colors.textPrimary,
    },
    activityTime: {
      fontSize: 10,
      color: colors.textTertiary,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 12,
      marginBottom: 10,
    },
  });
