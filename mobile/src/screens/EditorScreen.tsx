import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createAudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { onPlaybackFinished } from '../utils/audioPlayerEvents';
import { useProjectStore } from '../store/projectStore';
import { trackService, projectService } from '../services/api';
import { audioEngine } from '../services/audioEngine';
import { trackTypeColors, ThemeColors } from '../theme/colors';
import { BackButton } from '../components/BackButton';
import { useTheme } from '../theme/ThemeContext';
import { PianoRoll } from '../components/PianoRoll';
import { Waveform } from '../components/Waveform';
import { playPattern, guessInstrumentFromName } from '../services/instrumentSynth';

// Only volume/mute/solo tweaks are undoable — they're always safe to
// reverse. Deleting a track (especially an audio one, whose recorded file
// is permanently removed from storage on delete) stays a deliberate,
// confirmed, non-undoable action rather than pretending to restore
// something that can't fully come back.
type UndoAction =
  | { type: 'volume'; trackId: number; from: number; to: number }
  | { type: 'mute'; trackId: number; from: boolean; to: boolean }
  | { type: 'solo'; trackId: number; from: boolean; to: boolean };

export const EditorScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const {
    currentProject,
    isPlaying,
    setIsPlaying,
    updateTrack,
    removeTrack,
    updateProjectSettings,
  } = useProjectStore();
  const [togglingPublic, setTogglingPublic] = useState(false);

  const toggleProjectPublic = async () => {
    if (!currentProject || togglingPublic) return;
    setTogglingPublic(true);
    const nextPublic = !currentProject.is_public;
    try {
      const updated = await projectService.update(currentProject.id, { is_public: nextPublic });
      updateProjectSettings({ is_public: updated.is_public });
    } catch (error) {
      console.error('Failed to update project visibility:', error);
      Alert.alert('Error', 'Failed to update sharing setting. Please try again.');
    } finally {
      setTogglingPublic(false);
    }
  };

  const [previewingTrackId, setPreviewingTrackId] = useState<number | null>(null);
  const previewCancelRef = useRef<(() => void) | null>(null);

  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction[]>([]);

  const [exportLoading, setExportLoading] = useState(false);
  const [exportResult, setExportResult] = useState<{ downloadUrl: string; durationSeconds: number | null } | null>(
    null
  );
  const [exportPlaying, setExportPlaying] = useState(false);
  const exportPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);

  const [audioPreviewTrackId, setAudioPreviewTrackId] = useState<number | null>(null);
  const audioPreviewPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);

  useEffect(() => {
    return () => previewCancelRef.current?.();
  }, []);

  const togglePatternPreview = (track: { id: number; type: string; name: string; midi_data?: any }) => {
    if (previewingTrackId === track.id) {
      previewCancelRef.current?.();
      previewCancelRef.current = null;
      setPreviewingTrackId(null);
      return;
    }
    previewCancelRef.current?.();
    const voice = track.type === 'midi' ? 'piano' : guessInstrumentFromName(track.name);
    const { cancel, totalMs } = playPattern(voice, track.midi_data || [], currentProject?.bpm ?? 120);
    previewCancelRef.current = cancel;
    setPreviewingTrackId(track.id);
    setTimeout(() => {
      setPreviewingTrackId((current) => (current === track.id ? null : current));
    }, totalMs + 300);
  };

  useEffect(() => {
    if (!currentProject) {
      return;
    }
    audioEngine.setupPlayer().then(() => {
      audioEngine.loadProjectTracks(currentProject.tracks || []);
    });
  }, [currentProject?.id]);

  const togglePlayback = async () => {
    if (isPlaying) {
      await audioEngine.pause();
    } else {
      await audioEngine.play();
    }
    setIsPlaying(!isPlaying);
  };

  const pushUndo = (action: UndoAction) => {
    setUndoStack((s) => [...s, action]);
    setRedoStack([]);
  };

  const toggleMute = async (trackId: number, muted: boolean, volume: number) => {
    pushUndo({ type: 'mute', trackId, from: muted, to: !muted });
    updateTrack(trackId, { muted: !muted });
    audioEngine.setTrackMuted(trackId, !muted, volume);
    await trackService.update(trackId, { muted: !muted });
  };

  const toggleSolo = async (trackId: number, solo: boolean) => {
    pushUndo({ type: 'solo', trackId, from: solo, to: !solo });
    updateTrack(trackId, { solo: !solo });
    await trackService.update(trackId, { solo: !solo });
  };

  const adjustVolume = async (trackId: number, currentVolume: number, delta: number) => {
    const volume = Math.max(0, Math.min(1, +(currentVolume + delta).toFixed(2)));
    pushUndo({ type: 'volume', trackId, from: currentVolume, to: volume });
    updateTrack(trackId, { volume });
    audioEngine.setTrackVolume(trackId, volume);
    await trackService.update(trackId, { volume });
  };

  const applyUndoAction = async (action: UndoAction, direction: 'from' | 'to') => {
    const value = action[direction];
    switch (action.type) {
      case 'volume':
        updateTrack(action.trackId, { volume: value as number });
        audioEngine.setTrackVolume(action.trackId, value as number);
        await trackService.update(action.trackId, { volume: value as number });
        break;
      case 'mute': {
        const track = currentProject?.tracks?.find((t) => t.id === action.trackId);
        updateTrack(action.trackId, { muted: value as boolean });
        audioEngine.setTrackMuted(action.trackId, value as boolean, track?.volume ?? 0.8);
        await trackService.update(action.trackId, { muted: value as boolean });
        break;
      }
      case 'solo':
        updateTrack(action.trackId, { solo: value as boolean });
        await trackService.update(action.trackId, { solo: value as boolean });
        break;
    }
  };

  const handleUndo = async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, last]);
    await applyUndoAction(last, 'from');
  };

  const handleRedo = async () => {
    const last = redoStack[redoStack.length - 1];
    if (!last) return;
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, last]);
    await applyUndoAction(last, 'to');
  };

  const handleDeleteTrack = (track: { id: number; name: string }) => {
    Alert.alert('Delete Track', `Delete "${track.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await trackService.delete(track.id);
            removeTrack(track.id);
          } catch (error) {
            console.error('Failed to delete track:', error);
            Alert.alert('Error', 'Failed to delete track. Please try again.');
          }
        },
      },
    ]);
  };

  // Melody/instrument tracks are both note-pattern data (midi_data), which
  // the AI Assistant's MIDI tab already knows how to display and regenerate
  // — so editing hands the pattern to that screen instead of building a
  // second piano-roll editor here.
  const handleEditTrack = (track: { id: number; type: string; name: string; midi_data?: any }) => {
    navigation.navigate('Main', {
      screen: 'AIAssistant',
      params: {
        editTrack: { id: track.id, type: track.type, name: track.name, midi_data: track.midi_data },
      },
    });
  };

  // "Editing" an audio clip means splitting it into vocals/drums/bass/other
  // — the AI Assistant's Stems tab already does exactly that, primed here
  // with this track so the user drops straight into separating it instead
  // of having to pick a file from their device (it's already uploaded).
  const handleEditAudioTrack = (track: { id: number; name: string }) => {
    stopAudioTrackPreview();
    navigation.navigate('Main', {
      screen: 'AIAssistant',
      params: {
        stemsFromTrack: { id: track.id, name: track.name },
      },
    });
  };

  const stopAudioTrackPreview = () => {
    const player = audioPreviewPlayerRef.current;
    audioPreviewPlayerRef.current = null;
    setAudioPreviewTrackId(null);
    if (!player) return;
    try {
      player.pause();
    } catch {
      // ignore
    }
    try {
      player.remove();
    } catch {
      // already removed
    }
  };

  const toggleAudioTrackPreview = (track: { id: number; audio_playback_url?: string | null }) => {
    const isThisTrackPlaying = audioPreviewPlayerRef.current && audioPreviewTrackId === track.id;
    if (audioPreviewPlayerRef.current) {
      stopAudioTrackPreview();
      if (isThisTrackPlaying) return;
    }
    if (!track.audio_playback_url) return;

    const player = createAudioPlayer(track.audio_playback_url);
    player.volume = 1;
    const subscription = onPlaybackFinished(player, () => {
      if (audioPreviewPlayerRef.current === player) {
        subscription.remove();
        stopAudioTrackPreview();
      }
    });
    audioPreviewPlayerRef.current = player;
    setAudioPreviewTrackId(track.id);
    player.play();
  };

  // A previous version guarded "is something playing" with React state and
  // auto-stopped via a setTimeout sized off the export's *reported*
  // duration. Both were unreliable: state updates are async, so a fast
  // second tap could read stale state and create a second overlapping
  // player before the first one's stop had "landed" — and if the reported
  // duration undershot the real file length even slightly, the timer
  // flipped the UI back to "Play" while the first player kept audibly
  // running, making a second tap create real overlapping audio with no
  // way to reach the orphaned first player again. Both are fixed by
  // guarding on the player ref itself (updates synchronously) and by
  // ending playback from the player's own real "finished" event instead
  // of a guessed timer.
  const stopExportPlayback = () => {
    const player = exportPlayerRef.current;
    exportPlayerRef.current = null;
    setExportPlaying(false);
    if (!player) return;
    try {
      player.pause();
    } catch {
      // ignore
    }
    try {
      player.remove();
    } catch {
      // already removed
    }
  };

  const handleExportProject = async () => {
    if (!currentProject) return;
    setExportResult(null);
    stopExportPlayback();
    setExportLoading(true);
    try {
      const result = await projectService.export(currentProject.id);
      setExportResult({ downloadUrl: result.download_url, durationSeconds: result.duration_seconds ?? null });
    } catch (error: any) {
      Alert.alert('Export Failed', error.response?.data?.message || 'Failed to export this project. Please try again.');
    } finally {
      setExportLoading(false);
    }
  };

  const handlePlayExport = () => {
    if (exportPlayerRef.current) {
      stopExportPlayback();
      return;
    }
    if (!exportResult) return;
    const player = createAudioPlayer(exportResult.downloadUrl);
    player.volume = 1;
    const subscription = onPlaybackFinished(player, () => {
      if (exportPlayerRef.current === player) {
        subscription.remove();
        stopExportPlayback();
      }
    });
    exportPlayerRef.current = player;
    setExportPlaying(true);
    player.play();
  };

  const handleShareExport = async () => {
    if (!exportResult) return;
    try {
      const fileName = `${currentProject?.name.replace(/[^a-z0-9]+/gi, '-') || 'mix'}.wav`;
      const destination = new File(Paths.cache, fileName);
      const file = await File.downloadFileAsync(exportResult.downloadUrl, destination, { idempotent: true });

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing Unavailable', 'Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(file.uri, { mimeType: 'audio/wav', dialogTitle: `Share "${currentProject?.name}"` });
    } catch (error) {
      console.error('Failed to share export:', error);
      Alert.alert('Error', 'Failed to prepare the file for sharing.');
    }
  };

  useEffect(() => stopExportPlayback, []);
  useEffect(() => stopAudioTrackPreview, []);

  if (!currentProject) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>No project loaded</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 16, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right },
        ]}
      >
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.projectTitle} numberOfLines={1}>{currentProject.name}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate('ProjectChat', { projectId: currentProject.id })}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.primaryLight} />
          </TouchableOpacity>
          {currentProject.is_public && (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('ProjectComments', { projectId: currentProject.id, projectName: currentProject.name })
              }
            >
              <Ionicons name="people-outline" size={20} color={colors.primaryLight} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleExportProject} disabled={exportLoading}>
            {exportLoading ? (
              <ActivityIndicator size="small" color={colors.primaryLight} />
            ) : (
              <Ionicons name="download-outline" size={20} color={colors.primaryLight} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.aiButton}
            onPress={() => navigation.navigate('Main', { screen: 'AIAssistant' })}
          >
            <Ionicons name="sparkles" size={16} color={colors.primaryLight} />
            <Text style={styles.aiButtonText}>AI</Text>
          </TouchableOpacity>
        </View>
      </View>

      {exportResult && (
        <View style={styles.exportResultBar}>
          <Ionicons name="checkmark-circle" size={16} color={trackTypeColors.midi.accent} />
          <Text style={styles.exportResultText} numberOfLines={1}>
            Export ready{exportResult.durationSeconds ? ` · ${Math.round(exportResult.durationSeconds)}s` : ''}
          </Text>
          <TouchableOpacity onPress={handlePlayExport} style={styles.exportResultButton}>
            <Ionicons name={exportPlaying ? 'stop' : 'play'} size={16} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShareExport} style={styles.exportResultButton}>
            <Ionicons name="share-outline" size={16} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setExportResult(null)} style={styles.exportResultButton}>
            <Ionicons name="close" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Timeline Controls */}
      <View style={styles.controls}>
        <View style={styles.projectInfo}>
          <Text style={styles.infoText}>{currentProject.bpm} BPM</Text>
          <Text style={styles.infoText}>{currentProject.key}</Text>
          <Text style={styles.infoText}>
            {currentProject.tracks.length} track{currentProject.tracks.length === 1 ? '' : 's'}
          </Text>
          <TouchableOpacity
            style={[styles.visibilityChip, currentProject.is_public && styles.visibilityChipPublic]}
            onPress={toggleProjectPublic}
            disabled={togglingPublic}
          >
            {togglingPublic ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <>
                <Ionicons
                  name={currentProject.is_public ? 'globe-outline' : 'lock-closed-outline'}
                  size={12}
                  color={currentProject.is_public ? trackTypeColors.midi.accent : colors.textTertiary}
                />
                <Text
                  style={[
                    styles.visibilityChipText,
                    currentProject.is_public && { color: trackTypeColors.midi.accent },
                  ]}
                >
                  {currentProject.is_public ? 'Public' : 'Private'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.historyButtons}>
          <TouchableOpacity
            style={[styles.historyButton, undoStack.length === 0 && styles.historyButtonDisabled]}
            onPress={handleUndo}
            disabled={undoStack.length === 0}
          >
            <Ionicons name="arrow-undo" size={16} color={undoStack.length === 0 ? colors.textTertiary : colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.historyButton, redoStack.length === 0 && styles.historyButtonDisabled]}
            onPress={handleRedo}
            disabled={redoStack.length === 0}
          >
            <Ionicons name="arrow-redo" size={16} color={redoStack.length === 0 ? colors.textTertiary : colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.playButton} onPress={togglePlayback}>
          <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
        </TouchableOpacity>
      </View>

      {/* Track List */}
      <ScrollView
        style={styles.trackList}
        contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {(currentProject.tracks || []).map((track) => (
          <View key={track.id} style={styles.track}>
            <View style={styles.trackHeader}>
              <View style={styles.trackTitleGroup}>
                <Text style={styles.trackName} numberOfLines={1}>
                  {track.name}
                </Text>
                <View style={[styles.trackTypeBadge, { backgroundColor: trackTypeColors[track.type].tint }]}>
                  <View style={[styles.trackTypeDot, { backgroundColor: trackTypeColors[track.type].accent }]} />
                  <Text style={[styles.trackType, { color: trackTypeColors[track.type].accent }]}>
                    {track.type}
                  </Text>
                </View>
              </View>
              <View style={styles.trackActions}>
                <TouchableOpacity
                  style={styles.trackActionButton}
                  onPress={() => (track.type === 'audio' ? handleEditAudioTrack(track) : handleEditTrack(track))}
                >
                  <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.trackActionButton}
                  onPress={() => handleDeleteTrack(track)}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.trackControls}>
              <TouchableOpacity
                style={[styles.muteButton, track.muted && styles.muteButtonActive]}
                onPress={() => toggleMute(track.id, track.muted, track.volume)}
              >
                <Text style={styles.buttonText}>M</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.soloButton, track.solo && styles.soloButtonActive]}
                onPress={() => toggleSolo(track.id, track.solo)}
              >
                <Text style={styles.buttonText}>S</Text>
              </TouchableOpacity>
              <View style={styles.volumeContainer}>
                <TouchableOpacity onPress={() => adjustVolume(track.id, track.volume, -0.1)}>
                  <Text style={styles.volumeAdjust}>−</Text>
                </TouchableOpacity>
                <Text style={styles.volumeText}>
                  {Math.round(track.volume * 100)}%
                </Text>
                <TouchableOpacity onPress={() => adjustVolume(track.id, track.volume, 0.1)}>
                  <Text style={styles.volumeAdjust}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {(track.type === 'midi' || track.type === 'instrument') && (
              <View style={styles.trackPreview}>
                <PianoRoll notes={track.midi_data} height={64} accent={trackTypeColors[track.type].accent} />
                <TouchableOpacity
                  style={styles.previewPlayButton}
                  onPress={() => togglePatternPreview(track)}
                >
                  <Text style={[styles.previewPlayText, { color: trackTypeColors[track.type].accent }]}>
                    {previewingTrackId === track.id ? '■ Stop' : '▶ Play back'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {track.type === 'audio' && track.audio_url && track.waveform_peaks && (
              <Waveform
                peaks={track.waveform_peaks}
                height={36}
                color={trackTypeColors.audio.accent}
                backgroundColor={trackTypeColors.audio.tint}
              />
            )}

            {track.type === 'audio' && (!track.audio_url || !track.waveform_peaks) && (
              <View style={[styles.audioBadge, { backgroundColor: trackTypeColors.audio.tint }]}>
                <View style={[styles.trackTypeDot, { backgroundColor: trackTypeColors.audio.accent }]} />
                <Text style={[styles.audioBadgeText, { color: trackTypeColors.audio.accent }]}>
                  {track.audio_url ? 'Audio clip recorded' : 'No audio recorded yet'}
                </Text>
              </View>
            )}

            {track.type === 'audio' && !!track.audio_playback_url && (
              <TouchableOpacity
                style={styles.previewPlayButton}
                onPress={() => toggleAudioTrackPreview(track)}
              >
                <Text style={[styles.previewPlayText, { color: trackTypeColors.audio.accent }]}>
                  {audioPreviewTrackId === track.id ? '■ Stop' : '▶ Play back'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        
        {(currentProject.tracks || []).length === 0 && (
          <View style={styles.emptyTracks}>
            <Text style={styles.emptyText}>No tracks yet</Text>
            <Text style={styles.emptySubtext}>
              Tap + to add your first track
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom Actions */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: 20 + insets.bottom, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right },
        ]}
      >
        <TouchableOpacity
          style={styles.addTrackButton}
          onPress={() => navigation.navigate('AddTrack')}
        >
          <Text style={styles.addTrackText}>+ Add Track</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
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
    padding: 20,
    paddingTop: 60,
    backgroundColor: colors.surface,
  },
  projectTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    marginHorizontal: 12,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  aiButtonText: {
    color: colors.primaryLight,
    fontSize: 15,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  exportResultBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  exportResultText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  exportResultButton: {
    padding: 4,
  },
  historyButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  historyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyButtonDisabled: {
    opacity: 0.4,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.surface,
  },
  projectInfo: {
    flexDirection: 'row',
    gap: 15,
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  visibilityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
  },
  visibilityChipPublic: {
    backgroundColor: trackTypeColors.midi.tint,
  },
  visibilityChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textTertiary,
  },
  playButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    color: colors.onAccent,
    fontSize: 20,
  },
  trackList: {
    flex: 1,
  },
  track: {
    backgroundColor: colors.surface,
    marginHorizontal: 10,
    marginVertical: 5,
    padding: 15,
    borderRadius: 8,
  },
  trackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  trackTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  trackActions: {
    flexDirection: 'row',
    gap: 4,
  },
  trackActionButton: {
    padding: 6,
    borderRadius: 8,
  },
  trackName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  trackTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  trackTypeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  trackType: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  trackControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  muteButton: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  muteButtonActive: {
    backgroundColor: colors.danger,
  },
  soloButton: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  soloButtonActive: {
    backgroundColor: colors.accentTeal,
  },
  buttonText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  volumeContainer: {
    flex: 1,
    height: 30,
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 4,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  volumeText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  volumeAdjust: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: 'bold',
    paddingHorizontal: 8,
  },
  trackPreview: {
    marginTop: 12,
  },
  previewPlayButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  previewPlayText: {
    fontSize: 12,
    fontWeight: '700',
  },
  audioBadge: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  audioBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyTracks: {
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 18,
    marginBottom: 5,
  },
  emptySubtext: {
    color: colors.textTertiary,
    fontSize: 14,
  },
  bottomBar: {
    padding: 20,
    backgroundColor: colors.surface,
  },
  addTrackButton: {
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  addTrackText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
});
