import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { trackService, aiService } from '../services/api';
import { useProjectStore } from '../store/projectStore';
import { useRecorder } from '../hooks/useRecorder';
import { ThemeColors, trackTypeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { ThemedInput } from '../components/ThemedInput';
import { RecordingMeter } from '../components/RecordingMeter';
import { PianoRoll } from '../components/PianoRoll';
import { playInstrumentNote, playPattern } from '../services/instrumentSynth';
import { isLikelyAudioFile } from '../utils/audioFiles';

type TrackType = 'audio' | 'midi' | 'instrument';
type Instrument = 'piano' | 'bass' | 'guitar' | 'synth' | 'strings';

interface GeneratedPattern {
  notes: any[];
  source: 'ai' | 'fallback';
}

interface AudioFile {
  uri: string;
  name: string;
  mimeType: string;
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^./]+$/, '');
}

const INSTRUMENTS: { id: Instrument; label: string }[] = [
  { id: 'piano', label: 'Piano' },
  { id: 'bass', label: 'Bass' },
  { id: 'guitar', label: 'Guitar' },
  { id: 'synth', label: 'Synth' },
  { id: 'strings', label: 'Strings' },
];

export const AddTrackScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { currentProject, addTrack } = useProjectStore();
  const { isRecording, durationMillis, meterLevel, startRecording, stopRecording } = useRecorder();

  const [name, setName] = useState('');
  const [type, setType] = useState<TrackType>('audio');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Audio
  const [audioFile, setAudioFile] = useState<AudioFile | null>(null);

  // MIDI
  const [prompt, setPrompt] = useState('');
  const [midiResult, setMidiResult] = useState<GeneratedPattern | null>(null);
  const [midiLoading, setMidiLoading] = useState(false);

  // Instrument
  const [instrument, setInstrument] = useState<Instrument>('bass');
  const [instrumentResult, setInstrumentResult] = useState<GeneratedPattern | null>(null);
  const [instrumentLoading, setInstrumentLoading] = useState(false);

  // Playback preview (shared by the MIDI and Instrument sections)
  const [previewingType, setPreviewingType] = useState<TrackType | null>(null);
  const previewCancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => previewCancelRef.current?.();
  }, []);

  const stopPreview = () => {
    previewCancelRef.current?.();
    previewCancelRef.current = null;
    setPreviewingType(null);
  };

  const togglePreview = (voice: Instrument, notes: any[], key: TrackType) => {
    if (previewingType === key) {
      stopPreview();
      return;
    }
    stopPreview();
    const { cancel, totalMs } = playPattern(voice, notes, currentProject?.bpm ?? 120);
    previewCancelRef.current = cancel;
    setPreviewingType(key);
    setTimeout(() => {
      setPreviewingType((current) => (current === key ? null : current));
    }, totalMs + 300);
  };

  const selectInstrument = (id: Instrument) => {
    setInstrument(id);
    playInstrumentNote(id);
  };

  const selectType = (t: TrackType) => {
    stopPreview();
    setType(t);
    setError(null);
  };

  const toggleRecording = async () => {
    setError(null);
    try {
      if (isRecording) {
        const uri = await stopRecording();
        setAudioFile({ uri, name: `recording-${Date.now()}.m4a`, mimeType: 'audio/m4a' });
      } else {
        setAudioFile(null);
        await startRecording();
      }
    } catch (err: any) {
      setError(err.message || 'Recording failed');
    }
  };

  const handleImportAudio = async () => {
    setError(null);
    try {
      // "audio/*" is unreliable on Android — some file providers report
      // audio under a generic MIME type, which that filter then hides
      // entirely. Ask for everything and validate afterward instead.
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) {
        return;
      }
      const asset = result.assets[0];
      const name = asset.name || `imported-${Date.now()}.mp3`;

      if (!isLikelyAudioFile(name, asset.mimeType)) {
        setError(`"${name}" doesn't look like an audio file. Please choose an MP3, WAV, or similar.`);
        return;
      }

      setAudioFile({
        uri: asset.uri,
        name,
        mimeType: asset.mimeType || 'audio/mpeg',
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to import audio file');
    }
  };

  const handleGenerateMidi = async () => {
    setError(null);
    setMidiLoading(true);
    try {
      const result = await aiService.generateMidi({
        prompt: prompt || 'a simple, catchy melody',
        key: currentProject?.key,
        duration: 8,
      });
      setMidiResult({ notes: result.midi_data, source: result.source });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate melody');
    } finally {
      setMidiLoading(false);
    }
  };

  const handleGenerateInstrument = async () => {
    setError(null);
    setInstrumentLoading(true);
    try {
      const result = await aiService.generateInstrument({
        instrument,
        bpm: currentProject?.bpm,
        key: currentProject?.key,
        duration: 8,
      });
      setInstrumentResult({ notes: result.midi_data, source: result.source });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate part');
    } finally {
      setInstrumentLoading(false);
    }
  };

  const canSave =
    !saving &&
    !isRecording &&
    (type !== 'midi' || !!midiResult) &&
    (type !== 'instrument' || !!instrumentResult);

  const defaultTrackName = () => {
    if (type === 'midi') return 'AI Melody';
    if (type === 'instrument') return `AI ${INSTRUMENTS.find((i) => i.id === instrument)?.label}`;
    if (audioFile && !audioFile.name.startsWith('recording-')) return stripExtension(audioFile.name);
    return `Track ${(currentProject?.tracks.length ?? 0) + 1}`;
  };

  const handleSave = async () => {
    if (!currentProject) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const trackName = name || defaultTrackName();

      if (type === 'midi' && midiResult) {
        const track = await trackService.create(currentProject.id, {
          name: trackName,
          type: 'midi',
          midi_data: midiResult.notes,
          volume: 0.8,
          pan: 0,
        });
        addTrack(track);
        navigation.goBack();
        return;
      }

      if (type === 'instrument' && instrumentResult) {
        const track = await trackService.create(currentProject.id, {
          name: trackName,
          type: 'instrument',
          midi_data: instrumentResult.notes,
          volume: 0.8,
          pan: 0,
        });
        addTrack(track);
        navigation.goBack();
        return;
      }

      const track = await trackService.create(currentProject.id, {
        name: trackName,
        type: 'audio',
        volume: 0.8,
        pan: 0,
      });

      if (audioFile) {
        await trackService.uploadAudio(track.id, {
          uri: Platform.OS === 'android' ? audioFile.uri : audioFile.uri.replace('file://', ''),
          name: audioFile.name,
          type: audioFile.mimeType,
        });
      }

      addTrack(track);
      navigation.goBack();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create track');
    } finally {
      setSaving(false);
    }
  };

  const sourceCaption = (source: 'ai' | 'fallback') =>
    source === 'ai'
      ? 'Generated by AI'
      : 'Generated locally — connect an AI provider in the backend to enable AI composition';

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 16, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Add Track</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 40 + insets.bottom, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ThemedInput
          style={styles.inputSpacing}
          placeholder={`Track name (default: ${defaultTrackName()})`}
          value={name}
          onChangeText={setName}
        />

        <View style={styles.typeRow}>
          {(['audio', 'midi', 'instrument'] as TrackType[]).map((t) => {
            const active = type === t;
            const tc = trackTypeColors[t];
            return (
              <TouchableOpacity
                key={t}
                style={[
                  styles.typeButton,
                  active && { backgroundColor: tc.tint, borderColor: tc.accent },
                ]}
                onPress={() => selectType(t)}
              >
                <View style={[styles.typeDot, { backgroundColor: tc.accent }]} />
                <Text style={[styles.typeButtonText, active && { color: tc.accent }]}>{t}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {type === 'audio' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Record, or bring in a file from your phone</Text>
            <View style={styles.recordSection}>
              <View style={styles.audioSourceRow}>
                <TouchableOpacity
                  style={[styles.recordButton, isRecording && styles.recordButtonActive]}
                  onPress={toggleRecording}
                >
                  <Text style={styles.recordButtonText}>
                    {isRecording ? '■ Stop Recording' : '● Record Audio'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.importButton, isRecording && styles.importButtonDisabled]}
                  onPress={handleImportAudio}
                  disabled={isRecording}
                >
                  <Text style={styles.importButtonPlus}>+</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.importHint}>Tap + to import an MP3, WAV, or other audio file</Text>

              {isRecording && <RecordingMeter durationMillis={durationMillis} meterLevel={meterLevel} />}
              {audioFile && !isRecording && (
                <Text style={styles.recordedText} numberOfLines={1}>
                  🎵 {audioFile.name} ready to upload
                </Text>
              )}
            </View>
          </View>
        )}

        {type === 'midi' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Describe the melody you want</Text>
            <ThemedInput
              style={styles.inputSpacing}
              placeholder="e.g. a happy, upbeat melody"
              value={prompt}
              onChangeText={setPrompt}
            />
            <TouchableOpacity
              style={[styles.generateButton, { backgroundColor: trackTypeColors.midi.accent }]}
              onPress={handleGenerateMidi}
              disabled={midiLoading}
            >
              {midiLoading ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.generateButtonText}>
                  {midiResult ? 'Regenerate' : 'Generate Melody'}
                </Text>
              )}
            </TouchableOpacity>

            {midiResult && (
              <View style={[styles.previewBox, { borderLeftColor: trackTypeColors.midi.accent }]}>
                <PianoRoll notes={midiResult.notes} accent={trackTypeColors.midi.accent} />
                <View style={styles.previewFooter}>
                  <TouchableOpacity onPress={() => togglePreview('piano', midiResult.notes, 'midi')}>
                    <Text style={[styles.previewButtonText, { color: trackTypeColors.midi.accent }]}>
                      {previewingType === 'midi' ? '■ Stop' : '▶ Preview'}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.sourceCaption}>{sourceCaption(midiResult.source)}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {type === 'instrument' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Choose an instrument</Text>
            <View style={styles.instrumentRow}>
              {INSTRUMENTS.map((inst) => {
                const active = instrument === inst.id;
                return (
                  <TouchableOpacity
                    key={inst.id}
                    style={[
                      styles.instrumentChip,
                      active && {
                        backgroundColor: trackTypeColors.instrument.tint,
                        borderColor: trackTypeColors.instrument.accent,
                      },
                    ]}
                    onPress={() => selectInstrument(inst.id)}
                  >
                    <Text
                      style={[
                        styles.instrumentChipText,
                        active && { color: trackTypeColors.instrument.accent },
                      ]}
                    >
                      {inst.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.generateButton, { backgroundColor: trackTypeColors.instrument.accent }]}
              onPress={handleGenerateInstrument}
              disabled={instrumentLoading}
            >
              {instrumentLoading ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.generateButtonText}>
                  {instrumentResult ? 'Regenerate' : 'Generate Part'}
                </Text>
              )}
            </TouchableOpacity>

            {instrumentResult && (
              <View style={[styles.previewBox, { borderLeftColor: trackTypeColors.instrument.accent }]}>
                <PianoRoll notes={instrumentResult.notes} accent={trackTypeColors.instrument.accent} />
                <View style={styles.previewFooter}>
                  <TouchableOpacity onPress={() => togglePreview(instrument, instrumentResult.notes, 'instrument')}>
                    <Text style={[styles.previewButtonText, { color: trackTypeColors.instrument.accent }]}>
                      {previewingType === 'instrument' ? '■ Stop' : '▶ Preview'}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.sourceCaption}>{sourceCaption(instrumentResult.source)}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={[styles.saveButton, !canSave && styles.saveButtonDisabled]} onPress={handleSave} disabled={!canSave}>
          {saving ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.saveButtonText}>Add Track</Text>
          )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 10,
  },
  backButton: {
    color: colors.primary,
    fontSize: 16,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  inputSpacing: {
    marginBottom: 20,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.surface,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  typeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  typeButtonText: {
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  section: {
    marginBottom: 8,
  },
  sectionLabel: {
    color: colors.textSecondary,
    marginBottom: 10,
    fontSize: 13,
  },
  recordSection: {
    alignItems: 'center',
  },
  audioSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recordButton: {
    backgroundColor: colors.surface,
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  recordButtonActive: {
    backgroundColor: colors.danger,
  },
  recordButtonText: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  importButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: trackTypeColors.audio.tint,
    borderWidth: 1.5,
    borderColor: trackTypeColors.audio.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importButtonDisabled: {
    opacity: 0.4,
  },
  importButtonPlus: {
    color: trackTypeColors.audio.accent,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 26,
  },
  importHint: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 8,
  },
  recordedText: {
    color: colors.textSecondary,
    marginTop: 14,
    maxWidth: 260,
  },
  instrumentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  instrumentChip: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  instrumentChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  generateButton: {
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  generateButtonText: {
    color: colors.onAccent,
    fontWeight: '600',
  },
  previewBox: {
    marginTop: 16,
    borderLeftWidth: 3,
    paddingLeft: 12,
  },
  previewFooter: {
    alignItems: 'center',
    marginTop: 4,
  },
  previewButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sourceCaption: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
  error: {
    color: colors.danger,
    marginTop: 16,
    textAlign: 'center',
  },
  bottomBar: {
    padding: 20,
    paddingTop: 12,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
});
