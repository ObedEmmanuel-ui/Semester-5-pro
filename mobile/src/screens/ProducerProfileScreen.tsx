import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { producerService } from '../services/api';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors, coverGradients } from '../theme/colors';
import { BackButton } from '../components/BackButton';

interface PublicProject {
  id: number;
  name: string;
  genre: string | null;
  bpm: number;
  key: string;
  tracks_count: number;
  comments_count: number;
}

interface ProducerDetail {
  id: number;
  name: string;
  role: string | null;
  avatar_url: string | null;
  followers_count: number;
  following_count: number;
  is_following: boolean;
}

export const ProducerProfileScreen = ({ navigation, route }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { userId } = route.params;

  const [producer, setProducer] = useState<ProducerDetail | null>(null);
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);

  const load = async () => {
    try {
      const data = await producerService.show(userId);
      setProducer(data.user);
      setProjects(data.projects);
    } catch (error) {
      console.error('Failed to load producer profile:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const toggleFollow = async () => {
    if (!producer) return;
    setFollowBusy(true);
    const wasFollowing = producer.is_following;
    setProducer({
      ...producer,
      is_following: !wasFollowing,
      followers_count: producer.followers_count + (wasFollowing ? -1 : 1),
    });
    try {
      if (wasFollowing) {
        await producerService.unfollow(producer.id);
      } else {
        await producerService.follow(producer.id);
      }
    } catch (error) {
      console.error('Failed to toggle follow:', error);
      setProducer({
        ...producer,
        is_following: wasFollowing,
        followers_count: producer.followers_count + (wasFollowing ? 1 : -1),
      });
    } finally {
      setFollowBusy(false);
    }
  };

  if (loading || !producer) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title} numberOfLines={1}>
          {producer.name}
        </Text>
        <View style={{ width: 20 }} />
      </View>

      <FlatList
        data={projects}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 + insets.bottom }}
        ListHeaderComponent={
          <View>
            <View style={styles.identityRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{producer.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{producer.name}</Text>
                {producer.role && <Text style={styles.role}>{producer.role}</Text>}
              </View>
            </View>

            <View style={styles.statsRow}>
              <TouchableOpacity
                style={styles.statCard}
                onPress={() => navigation.navigate('FollowList', { userId: producer.id, mode: 'followers', name: producer.name })}
              >
                <Text style={styles.statValue}>{producer.followers_count}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.statCard}
                onPress={() => navigation.navigate('FollowList', { userId: producer.id, mode: 'following', name: producer.name })}
              >
                <Text style={styles.statValue}>{producer.following_count}</Text>
                <Text style={styles.statLabel}>Following</Text>
              </TouchableOpacity>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{projects.length}</Text>
                <Text style={styles.statLabel}>Shared</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.followButton, producer.is_following && styles.followButtonActive]}
              onPress={toggleFollow}
              disabled={followBusy}
            >
              {followBusy ? (
                <ActivityIndicator color={producer.is_following ? colors.textSecondary : colors.onAccent} />
              ) : (
                <Text style={[styles.followButtonText, producer.is_following && styles.followButtonTextActive]}>
                  {producer.is_following ? 'Following' : 'Follow'}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.sectionLabel}>Shared Projects</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.projectCard}
            onPress={() => navigation.navigate('ProjectComments', { projectId: item.id, projectName: item.name })}
          >
            <LinearGradient
              colors={coverGradients[item.id % coverGradients.length]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.projectCover}
            >
              <Ionicons name="musical-notes" size={18} color="#FFFFFF" />
            </LinearGradient>
            <View style={styles.rowBody}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rowMeta}>
                {item.bpm} BPM · {item.key}
                {item.genre ? ` · ${item.genre}` : ''} · {item.tracks_count} track{item.tracks_count === 1 ? '' : 's'}
              </Text>
            </View>
            <View style={styles.commentBadge}>
              <Ionicons name="chatbubble-outline" size={13} color={colors.textTertiary} />
              <Text style={styles.commentBadgeText}>{item.comments_count}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="musical-notes-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No shared projects yet</Text>
          </View>
        }
      />
    </View>
  );
};

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginHorizontal: 12 },
    identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: colors.onAccent, fontWeight: '700', fontSize: 24 },
    name: { fontSize: 19, fontWeight: '700', color: colors.textPrimary },
    role: { fontSize: 12, color: colors.textTertiary, textTransform: 'capitalize', marginTop: 2 },
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      gap: 4,
    },
    statValue: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    statLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },
    followButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
      marginBottom: 24,
    },
    followButtonActive: { backgroundColor: colors.surfaceAlt },
    followButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 14 },
    followButtonTextActive: { color: colors.textSecondary },
    sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
    projectCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      marginBottom: 12,
      padding: 12,
      borderRadius: 16,
      gap: 12,
    },
    projectCover: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    rowBody: { flex: 1 },
    rowName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 3 },
    rowMeta: { fontSize: 11, color: colors.textTertiary },
    commentBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    commentBadgeText: { fontSize: 12, color: colors.textTertiary, fontWeight: '600' },
    emptyState: { alignItems: 'center', marginTop: 30, gap: 10, paddingHorizontal: 40 },
    emptyText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  });
