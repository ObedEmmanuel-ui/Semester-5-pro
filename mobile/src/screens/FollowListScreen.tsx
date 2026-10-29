import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { producerService } from '../services/api';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { BackButton } from '../components/BackButton';

interface ListedUser {
  id: number;
  name: string;
  role: string | null;
  is_following: boolean;
}

export const FollowListScreen = ({ navigation, route }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { userId, mode, name } = route.params as { userId: number; mode: 'followers' | 'following'; name: string };

  const [users, setUsers] = useState<ListedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetcher = mode === 'followers' ? producerService.followers : producerService.following;
    fetcher(userId)
      .then((data) => setUsers(data.data || data))
      .catch((error) => console.error(`Failed to load ${mode}:`, error))
      .finally(() => setLoading(false));
  }, [userId, mode]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title} numberOfLines={1}>
          {name === 'Your' ? 'Your' : `${name}'s`} {mode === 'followers' ? 'Followers' : 'Following'}
        </Text>
        <View style={{ width: 20 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 + insets.bottom }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.push('ProducerProfile', { userId: item.id })}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                {item.role && <Text style={styles.rowMeta}>{item.role}</Text>}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                {mode === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
              </Text>
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
    title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginHorizontal: 12 },
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
    rowName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    rowMeta: { fontSize: 12, color: colors.textTertiary, textTransform: 'capitalize', marginTop: 2 },
    emptyState: { alignItems: 'center', marginTop: 40, gap: 10, paddingHorizontal: 40 },
    emptyText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  });
