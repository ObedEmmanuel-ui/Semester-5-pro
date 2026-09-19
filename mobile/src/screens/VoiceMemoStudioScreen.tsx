import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRecorder } from '../hooks/useRecorder';
import { voiceMemoService } from '../services/api';
import { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { onPlaybackFinished } from '../utils/audioPlayerEvents';

interface VoiceMemo {
  id: number;
  name: string;
  audio_url: string | null;
  duration_seconds: number | null;
  favorite: boolean;
  created_at: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || !Number.isFinite(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const VoiceMemoStudioScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { isRecording, durationMillis, startRecording, stopRecording } = useRecorder();
  const [memos, setMemos] = useState<VoiceMemo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);

  const loadMemos = async () => {
    try {
      const data = await voiceMemoService.list();
      setMemos(data);
    } catch (e) {
      console.error('Failed to load voice memos:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMemos();
    return stopPlayback;
  }, []);

  function stopPlayback() {
    try {
      playerRef.current?.pause();
      playerRef.current?.remove();
    } catch {
      // already removed
    }
    playerRef.current = null;
    setPlayingId(null);
  }

  const togglePlay = (memo: VoiceMemo) => {
    if (playingId === memo.id) {
      stopPlayback();
      return;
    }
    stopPlayback();
    if (!memo.audio_url) return;
    const player = createAudioPlayer(memo.audio_url);
    const subscription = onPlaybackFinished(player, () => {
      if (playerRef.current === player) {
        subscription.remove();
        stopPlayback();
      }
    });
    playerRef.current = player;
    setPlayingId(memo.id);
    player.play();
  };

  const handleRecordToggle = async () => {
    setError(null);
    try {
      if (isRecording) {
        const uri = await stopRecording();
        setSaving(true);
        const file = {
          uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
          name: `memo-${Date.now()}.m4a`,
          type: 'audio/m4a',
        };
        const memo = await voiceMemoService.create(`Voice Memo ${memos.length + 1}`, file);
        setMemos((prev) => [memo, ...prev]);
        setSaving(false);
      } else {
        await startRecording();
      }
    } catch (e: any) {
      setError(e.message || 'Recording failed');
      setSaving(false);
    }
  };

  const toggleFavorite = async (memo: VoiceMemo) => {
    try {
      const updated = await voiceMemoService.update(memo.id, { favorite: !memo.favorite });
      setMemos((prev) => prev.map((m) => (m.id === memo.id ? updated : m)));
    } catch (e) {
      console.error('Failed to update favorite:', e);
    }
  };

  const deleteMemo = async (memo: VoiceMemo) => {
    if (playingId === memo.id) stopPlayback();
    // Remove from the list immediately — a second tap on the same row (or a
    // fast double-tap) before this resolves would otherwise send a second
    // delete for an id that's already gone, surfacing a confusing 404.
    setMemos((prev) => prev.filter((m) => m.id !== memo.id));
    try {
      await voiceMemoService.delete(memo.id);
    } catch (e: any) {
      if (e.response?.status !== 404) {
        console.error('Failed to delete voice memo:', e);
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Voice Memo Studio</Text>
        <View style={{ width: 20 }} />
      </View>

      <View style={styles.recordSection}>
        <TouchableOpacity
          style={[styles.recordButton, isRecording && styles.recordButtonActive]}
          onPress={handleRecordToggle}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Ionicons name={isRecording ? 'stop' : 'mic'} size={32} color={colors.onAccent} />
          )}
        </TouchableOpacity>
        <Text style={styles.recordLabel}>
          {isRecording ? `Recording... ${Math.floor(durationMillis / 1000)}s` : saving ? 'Saving...' : 'Tap to record'}
        </Text>
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>

      <Text style={styles.sectionTitle}>Your Memos</Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={memos}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom, paddingHorizontal: 20 }}
          renderItem={({ item }) => {
            const isPlaying = playingId === item.id;
            return (
              <View style={styles.row}>
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={() => togglePlay(item)}
                  disabled={!item.audio_url}
                >
                  <Ionicons
                    name={isPlaying ? 'stop' : 'play'}
                    size={16}
                    color={item.audio_url ? colors.primaryLight : colors.textTertiary}
                  />
                </TouchableOpacity>
                <View style={styles.rowBody}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowMeta}>{formatDuration(item.duration_seconds)}</Text>
                </View>
                <TouchableOpacity style={styles.iconButton} onPress={() => toggleFavorite(item)}>
                  <Ionicons
                    name={item.favorite ? 'heart' : 'heart-outline'}
                    size={18}
                    color={item.favorite ? colors.danger : colors.textTertiary}
                  />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={() => deleteMemo(item)}>
                  <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="mic-outline" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyText}>No voice memos yet</Text>
              <Text style={styles.emptySubtext}>Record an idea and it'll show up here</Text>
            </View>
          }
        />
      )}
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
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    backButton: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    recordSection: {
      alignItems: 'center',
      paddingVertical: 24,
      gap: 10,
    },
    recordButton: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recordButtonActive: {
      backgroundColor: colors.danger,
    },
    recordLabel: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    errorText: {
      fontSize: 12,
      color: colors.danger,
      textAlign: 'center',
      paddingHorizontal: 30,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      marginBottom: 10,
      padding: 12,
      borderRadius: 14,
      gap: 10,
    },
    playButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: {
      flex: 1,
    },
    rowName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 2,
    },
    rowMeta: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    iconButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyState: {
      alignItems: 'center',
      marginTop: 40,
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
