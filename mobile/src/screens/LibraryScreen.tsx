import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProjectStore } from '../store/projectStore';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors, coverGradients } from '../theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { onPlaybackFinished } from '../utils/audioPlayerEvents';
import { trackService } from '../services/api';

// The "Beat Library" is every real audio track across all of the user's
// projects, flattened into one browsable/searchable list — there's no
// separate "beats" concept in the backend, and building on real, persisted
// track data (rather than the in-memory recording/stem sample store, which
// resets on every app restart) is what makes this survive a reload.
interface LibraryEntry {
  key: string;
  trackId: number;
  name: string;
  projectId: number;
  projectName: string;
  bpm: number;
  musicKey: string;
  genre: string | null;
  favorite: boolean;
  durationSeconds: number | null;
  audioUrl?: string | null;
}

export const LibraryScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { projects, setCurrentProject, updateTrack } = useProjectStore();
  const [search, setSearch] = useState('');
  const [activeGenre, setActiveGenre] = useState('All');
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const playerRef = React.useRef<ReturnType<typeof createAudioPlayer> | null>(null);

  useEffect(() => stopPlayback, []);

  const entries: LibraryEntry[] = useMemo(() => {
    const list: LibraryEntry[] = [];
    for (const project of projects as any[]) {
      for (const track of project.tracks || []) {
        if (track.type !== 'audio') continue;
        list.push({
          key: `${project.id}-${track.id}`,
          trackId: track.id,
          name: track.name,
          projectId: project.id,
          projectName: project.name,
          bpm: project.bpm,
          musicKey: project.key,
          genre: project.genre || null,
          favorite: !!track.favorite,
          durationSeconds: track.duration_seconds ?? null,
          audioUrl: track.audio_playback_url || track.audio_url,
        });
      }
    }
    return list;
  }, [projects]);

  // Only genres that actually exist on a real project show up as chips —
  // no fabricated Afrobeats/Hip Hop/R&B options if the user never set them.
  const genres = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => e.genre && set.add(e.genre));
    return ['All', ...Array.from(set)];
  }, [entries]);

  const filtered = useMemo(() => {
    let list = entries;
    if (activeGenre !== 'All') {
      list = list.filter((e) => e.genre === activeGenre);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q) || e.projectName.toLowerCase().includes(q));
    }
    return list;
  }, [entries, search, activeGenre]);

  function stopPlayback() {
    try {
      playerRef.current?.pause();
      playerRef.current?.remove();
    } catch {
      // already removed
    }
    playerRef.current = null;
    setPlayingKey(null);
  }

  const togglePlay = (entry: LibraryEntry) => {
    if (playingKey === entry.key) {
      stopPlayback();
      return;
    }
    stopPlayback();
    if (!entry.audioUrl) return;
    const player = createAudioPlayer(entry.audioUrl);
    player.volume = 1;
    const subscription = onPlaybackFinished(player, () => {
      if (playerRef.current === player) {
        subscription.remove();
        stopPlayback();
      }
    });
    playerRef.current = player;
    setPlayingKey(entry.key);
    player.play();
  };

  const toggleFavorite = async (entry: LibraryEntry) => {
    try {
      const updated = await trackService.update(entry.trackId, { favorite: !entry.favorite });
      updateTrack(entry.trackId, updated);
    } catch (error) {
      console.error('Failed to update favorite:', error);
    }
  };

  const openEntry = async (entry: LibraryEntry) => {
    const project = (projects as any[]).find((p) => p.id === entry.projectId);
    if (project) {
      setCurrentProject(project);
      navigation.navigate('Player', { projectId: project.id, trackId: entry.trackId });
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.title}>Beat Library</Text>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search beats..."
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

      {genres.length > 1 && (
        <FlatList
          horizontal
          data={genres}
          keyExtractor={(g) => g}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item }) => {
            const active = activeGenre === item;
            return (
              <TouchableOpacity
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setActiveGenre(item)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <FlatList
          data={filtered}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{
            paddingBottom: 40 + insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          }}
          renderItem={({ item }) => {
            const isPlaying = playingKey === item.key;
            return (
              <TouchableOpacity style={styles.row} onPress={() => openEntry(item)}>
                <LinearGradient
                  colors={coverGradients[item.trackId % coverGradients.length]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cover}
                >
                  <Ionicons name="musical-notes" size={16} color="#FFFFFF" />
                </LinearGradient>
                <View style={styles.rowBody}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {item.projectName} • {item.bpm} BPM • {item.musicKey}
                  </Text>
                </View>
                <TouchableOpacity style={styles.heartButton} onPress={() => toggleFavorite(item)}>
                  <Ionicons
                    name={item.favorite ? 'heart' : 'heart-outline'}
                    size={18}
                    color={item.favorite ? colors.danger : colors.textTertiary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={() => togglePlay(item)}
                  disabled={!item.audioUrl}
                >
                  <Ionicons
                    name={isPlaying ? 'stop' : 'play'}
                    size={16}
                    color={item.audioUrl ? colors.primaryLight : colors.textTertiary}
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="musical-notes-outline" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                {search || activeGenre !== 'All' ? 'No beats match' : 'No beats yet'}
              </Text>
              {!search && activeGenre === 'All' && (
                <Text style={styles.emptySubtext}>Audio tracks you add to any project show up here</Text>
              )}
            </View>
          }
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
    header: {
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 14,
      marginHorizontal: 20,
      marginBottom: 14,
      height: 46,
    },
    searchInput: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 14,
    },
    chipRow: {
      paddingHorizontal: 20,
      gap: 8,
      paddingBottom: 14,
    },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surface,
      marginRight: 8,
    },
    chipActive: {
      backgroundColor: colors.primary,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    chipTextActive: {
      color: colors.onAccent,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      marginHorizontal: 20,
      marginBottom: 12,
      padding: 12,
      borderRadius: 16,
      gap: 10,
    },
    cover: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: {
      flex: 1,
    },
    rowName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 3,
    },
    rowMeta: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    heartButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    playButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
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
