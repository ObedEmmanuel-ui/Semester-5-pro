import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationService } from '../services/api';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';

const LAST_SEEN_KEY = 'notifications_last_seen_id';

interface Announcement {
  id: number;
  title: string;
  body: string;
  created_at: string;
  author?: { name: string } | null;
}

interface PersonalNotification {
  id: number;
  type: string;
  data: {
    project_id: number;
    project_name: string;
    commenter_name: string;
    comment_preview: string;
  };
  read_at: string | null;
  created_at: string;
}

type FeedItem =
  | { kind: 'announcement'; id: string; created_at: string; announcement: Announcement }
  | { kind: 'personal'; id: string; created_at: string; notification: PersonalNotification };

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
  return new Date(dateString).toLocaleDateString();
}

export const NotificationsScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [announcementData, personalData] = await Promise.all([
        notificationService.list(),
        notificationService.personal().catch(() => ({ data: [] })),
      ]);
      const announcements: Announcement[] = announcementData.data || announcementData;
      const personal: PersonalNotification[] = personalData.data || personalData;

      const merged: FeedItem[] = [
        ...announcements.map((a): FeedItem => ({
          kind: 'announcement',
          id: `a-${a.id}`,
          created_at: a.created_at,
          announcement: a,
        })),
        ...personal.map((n): FeedItem => ({
          kind: 'personal',
          id: `p-${n.id}`,
          created_at: n.created_at,
          notification: n,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setFeed(merged);
      if (announcements.length > 0) {
        await AsyncStorage.setItem(LAST_SEEN_KEY, String(announcements[0].id));
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 16, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.primaryLight} />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primaryLight} />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={feed}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: 40 + insets.bottom, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryLight} />
          }
          renderItem={({ item }) =>
            item.kind === 'announcement' ? (
              <View style={styles.card}>
                <View style={styles.cardIcon}>
                  <Ionicons name="megaphone-outline" size={18} color={colors.primaryLight} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{item.announcement.title}</Text>
                  <Text style={styles.cardText}>{item.announcement.body}</Text>
                  <Text style={styles.cardMeta}>
                    {timeAgo(item.announcement.created_at)}
                    {item.announcement.author ? ` · ${item.announcement.author.name}` : ''}
                  </Text>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.card, !item.notification.read_at && styles.cardUnread]}
                onPress={() =>
                  navigation.navigate('ProjectComments', {
                    projectId: item.notification.data.project_id,
                    projectName: item.notification.data.project_name,
                  })
                }
              >
                <View style={styles.cardIcon}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primaryLight} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>
                    {item.notification.data.commenter_name} commented on your project
                  </Text>
                  <Text style={styles.cardText}>
                    "{item.notification.data.comment_preview}" — {item.notification.data.project_name}
                  </Text>
                  <Text style={styles.cardMeta}>{timeAgo(item.notification.created_at)}</Text>
                </View>
              </TouchableOpacity>
            )
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={44} color={colors.textTertiary} />
              <Text style={styles.emptyText}>No notifications yet</Text>
              <Text style={styles.emptySubtext}>Announcements from the MproWave team will show up here.</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

export async function hasUnreadNotifications(): Promise<boolean> {
  try {
    const [data, unread] = await Promise.all([
      notificationService.list(),
      notificationService.unreadCount().catch(() => ({ count: 0 })),
    ]);
    if (unread.count > 0) return true;

    const items: Announcement[] = data.data || data;
    if (items.length === 0) return false;
    const lastSeen = await AsyncStorage.getItem(LAST_SEEN_KEY);
    return String(items[0].id) !== lastSeen;
  } catch {
    return false;
  }
}

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
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 20,
      paddingTop: 56,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '700',
    },
    listContent: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    card: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
    },
    cardUnread: {
      borderWidth: 1,
      borderColor: colors.primary,
    },
    cardIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: {
      flex: 1,
    },
    cardTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 4,
    },
    cardText: {
      color: colors.textSecondary,
      fontSize: 13.5,
      lineHeight: 19,
      marginBottom: 8,
    },
    cardMeta: {
      color: colors.textTertiary,
      fontSize: 11.5,
    },
    emptyState: {
      alignItems: 'center',
      marginTop: 80,
      gap: 10,
      paddingHorizontal: 40,
    },
    emptyText: {
      fontSize: 16,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    emptySubtext: {
      fontSize: 13,
      color: colors.textTertiary,
      textAlign: 'center',
    },
  });
