import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { createAudioPlayer } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useProjectStore } from '../store/projectStore';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors, coverGradients } from '../theme/colors';
import { onPlaybackStatus } from '../utils/audioPlayerEvents';
import { trackService } from '../services/api';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// "Now Playing" for a single audio track. There's no real playlist/queue
// concept in the backend, so "Up Next" is honestly just this project's
// other audio tracks in order, not a fabricated multi-song queue.
export const PlayerScreen = ({ navigation, route }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { projectId, trackId } = route.params;
  const { projects, updateTrack } = useProjectStore();

  const project = useMemo(() => (projects as any[]).find((p) => p.id === projectId), [projects, projectId]);
  const audioTracks = useMemo(
    () => (project?.tracks || []).filter((t: any) => t.type === 'audio'),
    [project]
  );
  const [activeTrackId, setActiveTrackId] = useState<number>(trackId);
  const track = useMemo(
    () => audioTracks.find((t: any) => t.id === activeTrackId) || audioTracks[0],
    [audioTracks, activeTrackId]
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);

  const stop = () => {
    try {
      playerRef.current?.pause();
      playerRef.current?.remove();
    } catch {
      // already removed
    }
    playerRef.current = null;
    setIsPlaying(false);
    setPosition(0);
    setDuration(0);
  };

  useEffect(() => {
    stop();
    const audioUrl = track?.audio_playback_url || track?.audio_url;
    if (!audioUrl) return;
    const player = createAudioPlayer(audioUrl);
    playerRef.current = player;
    const subscription = onPlaybackStatus(player, (status) => {
      if (!seeking) setPosition(status.currentTime || 0);
      setDuration(status.duration || 0);
      setIsPlaying(status.playing);
      if (status.didJustFinish) {
        stop();
      }
    });
    player.play();
    return () => {
      subscription.remove();
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrackId]);

  const togglePlayPause = () => {
    const player = playerRef.current;
    if (!player) return;
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const skip = (direction: 1 | -1) => {
    const idx = audioTracks.findIndex((t: any) => t.id === activeTrackId);
    const next = audioTracks[idx + direction];
    if (next) setActiveTrackId(next.id);
  };

  const toggleFavorite = async () => {
    if (!track) return;
    try {
      const updated = await trackService.update(track.id, { favorite: !track.favorite });
      updateTrack(track.id, updated);
    } catch (error) {
      console.error('Failed to update favorite:', error);
    }
  };

  if (!track) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>No audio track to play</Text>
        <TouchableOpacity style={styles.closeButtonInline} onPress={() => navigation.goBack()}>
          <Text style={styles.closeButtonInlineText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-down" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {project?.name}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <LinearGradient
        colors={coverGradients[track.id % coverGradients.length]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cover}
      >
        <Ionicons name="musical-notes" size={64} color="rgba(255,255,255,0.85)" />
      </LinearGradient>

      <View style={styles.trackInfo}>
        <Text style={styles.trackName} numberOfLines={1}>
          {track.name}
        </Text>
        <Text style={styles.trackMeta}>
          {project?.bpm} BPM • {project?.key}
        </Text>
      </View>

      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={duration || 1}
        value={position}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.surfaceAlt}
        thumbTintColor={colors.primaryLight}
        onSlidingStart={() => setSeeking(true)}
        onSlidingComplete={(value) => {
          setSeeking(false);
          playerRef.current?.seekTo(value);
          setPosition(value);
        }}
      />
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(position)}</Text>
        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>

      <View style={styles.transport}>
        <TouchableOpacity onPress={() => skip(-1)} disabled={audioTracks.length < 2}>
          <Ionicons
            name="play-skip-back"
            size={28}
            color={audioTracks.length < 2 ? colors.textTertiary : colors.textPrimary}
          />
        </TouchableOpacity>
        <TouchableOpacity style={styles.playPauseButton} onPress={togglePlayPause}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={30} color={colors.onAccent} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => skip(1)} disabled={audioTracks.length < 2}>
          <Ionicons
            name="play-skip-forward"
            size={28}
            color={audioTracks.length < 2 ? colors.textTertiary : colors.textPrimary}
          />
        </TouchableOpacity>
        <TouchableOpacity style={styles.heartButton} onPress={toggleFavorite}>
          <Ionicons
            name={track.favorite ? 'heart' : 'heart-outline'}
            size={24}
            color={track.favorite ? colors.danger : colors.textTertiary}
          />
        </TouchableOpacity>
      </View>

      {audioTracks.length > 1 && (
        <View style={styles.queueSection}>
          <Text style={styles.queueTitle}>Up Next</Text>
          <FlatList
            data={audioTracks}
            keyExtractor={(t: any) => String(t.id)}
            renderItem={({ item }: any) => (
              <TouchableOpacity
                style={[styles.queueRow, item.id === activeTrackId && styles.queueRowActive]}
                onPress={() => setActiveTrackId(item.id)}
              >
                <Ionicons
                  name="musical-note"
                  size={14}
                  color={item.id === activeTrackId ? colors.primaryLight : colors.textTertiary}
                />
                <Text
                  style={[styles.queueRowText, item.id === activeTrackId && styles.queueRowTextActive]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
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
    centered: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginHorizontal: 12,
    },
    cover: {
      width: '78%',
      aspectRatio: 1,
      alignSelf: 'center',
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 12,
      marginBottom: 28,
    },
    trackInfo: {
      alignItems: 'center',
      paddingHorizontal: 30,
      marginBottom: 20,
    },
    trackName: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6,
    },
    trackMeta: {
      fontSize: 13,
      color: colors.textTertiary,
    },
    slider: {
      width: '100%',
      paddingHorizontal: 20,
      height: 32,
    },
    timeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      marginTop: -4,
      marginBottom: 24,
    },
    timeText: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    transport: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 28,
      marginBottom: 24,
    },
    playPauseButton: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heartButton: {
      position: 'absolute',
      right: 20,
    },
    queueSection: {
      flex: 1,
      paddingHorizontal: 20,
    },
    queueTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 10,
    },
    queueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
    },
    queueRowActive: {},
    queueRowText: {
      fontSize: 14,
      color: colors.textTertiary,
    },
    queueRowTextActive: {
      color: colors.textPrimary,
      fontWeight: '600',
    },
    emptyText: {
      fontSize: 15,
      color: colors.textSecondary,
    },
    closeButtonInline: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderRadius: 12,
    },
    closeButtonInlineText: {
      color: colors.textPrimary,
      fontWeight: '600',
    },
  });
