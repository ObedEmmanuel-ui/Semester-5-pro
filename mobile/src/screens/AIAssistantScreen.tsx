import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { createAudioPlayer } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { aiService, authService, projectService, trackService, stemService } from '../services/api';
import { useProjectStore } from '../store/projectStore';
import { useSampleStore } from '../store/sampleStore';
import { useRecorder } from '../hooks/useRecorder';
import { onPlaybackFinished } from '../utils/audioPlayerEvents';
import { downloadAndShareAudio, safeFileName } from '../utils/downloadAudio';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemeColors, trackTypeColors, primaryGradient } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { ThemedInput } from '../components/ThemedInput';
import { RecordingMeter } from '../components/RecordingMeter';
import { PianoRoll } from '../components/PianoRoll';
import { WaveformMark } from '../components/WaveformMark';
import { DrumSequencer } from '../components/DrumSequencer';
import { DrumPattern, emptyDrumPattern, playDrumPattern, resizeDrumPattern } from '../services/drumSynth';
import { Instrument, playPattern } from '../services/instrumentSynth';
import { isLikelyAudioFile } from '../utils/audioFiles';

type Section = 'lyrics' | 'midi' | 'drums' | 'harmony' | 'stems';
type ScreenView = 'home' | Section;

// "Best Suggestions" has no distinct backend endpoint of its own — it opens
// the harmony tab, which already gives AI suggestions from a recorded clip,
// rather than inventing a separate feature with nothing behind it.
const QUICK_ACTIONS: { key: Section; label: string; sub: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'lyrics', label: 'Generate Song', sub: 'Lyrics + melody', icon: 'musical-notes' },
  { key: 'lyrics', label: 'Write Lyrics', sub: 'AI songwriting', icon: 'create-outline' },
  { key: 'midi', label: 'Music Theory', sub: 'Melody & MIDI', icon: 'school-outline' },
  { key: 'harmony', label: 'Best Suggestions', sub: 'From a recording', icon: 'bulb-outline' },
];

const STEM_LABELS: Record<string, string> = {
  vocals: 'Vocals',
  drums: 'Drums',
  bass: 'Bass',
  other: 'Other',
};

const DRUM_STYLES = ['rock', 'funk', 'trap', 'hiphop', 'afrobeats'];
const DRUM_STYLE_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  rock: 'grid',
  funk: 'musical-note',
  trap: 'flash',
  hiphop: 'headset',
  afrobeats: 'globe-outline',
};
const DRUM_STYLE_LABELS: Record<string, string> = {
  rock: 'Rock',
  funk: 'Funk',
  trap: 'Trap',
  hiphop: 'Hip-Hop',
  afrobeats: 'Afrobeats',
};

const STEP_COUNT_OPTIONS = [8, 16, 32];
const MUSIC_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const INSTRUMENT_CHOICES: { id: Instrument; label: string }[] = [
  { id: 'piano', label: 'Piano' },
  { id: 'bass', label: 'Bass' },
  { id: 'guitar', label: 'Guitar' },
  { id: 'synth', label: 'Synth' },
  { id: 'strings', label: 'Strings' },
];

// General MIDI-ish drum note mapping, used only so a drum pattern can be
// saved/replayed through the same 'midi' track pipeline as everything else.
const DRUM_NOTE: Record<string, string> = {
  kick: 'C2',
  snare: 'D2',
  hihat: 'F#2',
  clap: 'D#2',
};

function drumPatternToNotes(pattern: DrumPattern) {
  const notes: { note: string; start: number; duration: number; velocity: number }[] = [];
  (Object.keys(pattern) as (keyof DrumPattern)[]).forEach((voice) => {
    pattern[voice].forEach((on, step) => {
      if (on) {
        notes.push({ note: DRUM_NOTE[voice], start: step * 0.25, duration: 0.2, velocity: 100 });
      }
    });
  });
  return notes;
}

function playAudioPreview(url?: string) {
  if (!url) return;
  const player = createAudioPlayer(url);
  player.volume = 1;
  player.play();
  setTimeout(() => {
    try {
      player.remove();
    } catch {
      // already removed
    }
  }, 15000);
}

export const AIAssistantScreen = ({ navigation, route }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { currentProject, addTrack, updateTrack, updateProjectSettings } = useProjectStore();
  const { addSample } = useSampleStore();
  const { isRecording, durationMillis, meterLevel, startRecording, stopRecording } = useRecorder();
  const [layeringInstrument, setLayeringInstrument] = useState<Instrument | null>(null);
  const [view, setView] = useState<ScreenView>('home');
  const section: Section = view === 'home' ? 'lyrics' : view;
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    authService
      .getCurrentUser()
      .then((u: any) => setUserName(u?.name?.split(' ')[0] || null))
      .catch(() => setUserName(null));
  }, []);

  // Lyrics → song
  const [lyrics, setLyrics] = useState('');
  // Optional AI lyrics-writer for anyone who doesn't already have words —
  // a topic (required) plus mood/genre hints, filling the same lyrics box
  // above so the result is still fully editable before generating a song.
  const [lyricsTopic, setLyricsTopic] = useState('');
  const [lyricsMood, setLyricsMood] = useState('');
  const [lyricsGenre, setLyricsGenre] = useState('');
  const [lyricsGenLoading, setLyricsGenLoading] = useState(false);
  const [lyricsSource, setLyricsSource] = useState<'ai' | 'fallback' | null>(null);
  const [songResult, setSongResult] = useState<any>(null);
  const [songLoading, setSongLoading] = useState(false);
  const [songPlaying, setSongPlaying] = useState(false);
  const songPlaybackRef = useRef<{ cancelAll: () => void } | null>(null);
  // Real sung-vocal + beat audio rendered from songResult — a separate,
  // much slower step (word-by-word TTS) the user triggers explicitly once
  // they're happy with the melody/key/tempo from the fast text step above.
  const [songAudio, setSongAudio] = useState<{
    jobId: string;
    vocalsStemName: string;
    beatStemName: string;
    vocalsUrl: string;
    beatUrl: string;
    durationSeconds: number | null;
  } | null>(null);
  const [songAudioLoading, setSongAudioLoading] = useState(false);

  // Generate MIDI
  const [prompt, setPrompt] = useState('');
  const [midiResult, setMidiResult] = useState<any>(null);
  const [midiLoading, setMidiLoading] = useState(false);
  // Set when arriving here via a track's Edit button (EditorScreen) instead
  // of a fresh generation — routes "+ Add as Track" to update that track in
  // place rather than creating a duplicate one.
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);

  useEffect(() => {
    const incoming = route?.params?.editTrack;
    if (incoming) {
      setView('midi');
      setMidiResult({ midi_data: incoming.midi_data || [], source: 'existing' });
      setEditingTrackId(incoming.id);
      navigation.setParams({ editTrack: undefined });
    }
  }, [route?.params?.editTrack]);

  // Editor's "Edit" button on an audio track lands here primed with that
  // track — skips the file-picker step entirely since the audio is already
  // uploaded, going straight to "split this into stems".
  const [stemsSourceTrack, setStemsSourceTrack] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    const incoming = route?.params?.stemsFromTrack;
    if (incoming) {
      setView('stems');
      setStemsSourceTrack(incoming);
      setStemFile(null);
      setStemDownload(null);
      navigation.setParams({ stemsFromTrack: undefined });
    }
  }, [route?.params?.stemsFromTrack]);

  // Generate Drums
  const [style, setStyle] = useState('rock');
  // The step sequencer's own tempo — starts from the project's BPM but is
  // independently adjustable here (a real, working control), since previewing
  // a beat idea at a different tempo shouldn't retune the whole project.
  const [drumBpm, setDrumBpm] = useState(120);
  useEffect(() => {
    if (currentProject?.bpm) setDrumBpm(currentProject.bpm);
  }, [currentProject?.id]);
  const [drumSteps, setDrumSteps] = useState(16);
  const [stepsMenuOpen, setStepsMenuOpen] = useState(false);
  const [keyMenuOpen, setKeyMenuOpen] = useState(false);
  const [keySaving, setKeySaving] = useState(false);
  const [drumPattern, setDrumPattern] = useState<DrumPattern>(emptyDrumPattern());
  const [drumSource, setDrumSource] = useState<'ai' | 'fallback' | null>(null);
  const [drumLoading, setDrumLoading] = useState(false);
  const [drumPlayingStep, setDrumPlayingStep] = useState<number | null>(null);

  const changeStepCount = (steps: number) => {
    setDrumSteps(steps);
    setDrumPattern((prev) => resizeDrumPattern(prev, steps));
    setStepsMenuOpen(false);
  };

  const changeProjectKey = async (key: string) => {
    setKeyMenuOpen(false);
    if (!currentProject || key === currentProject.key) return;
    setKeySaving(true);
    try {
      const updated = await projectService.update(currentProject.id, { key });
      updateProjectSettings({ key: updated.key });
    } catch (err) {
      console.error('Failed to update project key:', err);
    } finally {
      setKeySaving(false);
    }
  };
  const drumCancelRef = useRef<(() => void) | null>(null);
  // Kept in sync with drumPattern so the looping sequencer always reads the
  // live grid — editing a cell mid-playback takes effect on the next step,
  // the same way it does in a real step sequencer, rather than playing a
  // frozen snapshot taken when you pressed Play.
  const drumPatternRef = useRef(drumPattern);
  useEffect(() => {
    drumPatternRef.current = drumPattern;
  }, [drumPattern]);

  // Harmony / Analysis
  const [harmonyResult, setHarmonyResult] = useState<any>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [harmonyLoading, setHarmonyLoading] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);

  // Stem separation
  const [stemFile, setStemFile] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [stemLoading, setStemLoading] = useState(false);
  const [stemDownload, setStemDownload] = useState<{
    jobId: string;
    stems: { name: string }[];
    download_urls: Record<string, string>;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);

  const handlePickStemFile = async () => {
    setError(null);
    try {
      // "audio/*" is unreliable on Android — some file providers report
      // audio under a generic MIME type, which that filter then hides
      // entirely. Ask for everything and validate afterward instead.
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) {
        return;
      }
      const asset = result.assets[0];
      const name = asset.name || `audio-${Date.now()}.mp3`;

      if (!isLikelyAudioFile(name, asset.mimeType)) {
        setError(`"${name}" doesn't look like an audio file. Please choose an MP3, WAV, or similar.`);
        return;
      }

      setStemFile({
        uri: asset.uri,
        name,
        mimeType: asset.mimeType || 'audio/mpeg',
      });
      setStemDownload(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to import audio file');
    }
  };

  const handleSplitStems = async () => {
    if (!stemFile) {
      return;
    }
    setError(null);
    setStemLoading(true);
    setStemDownload(null);
    try {
      const file = {
        uri: Platform.OS === 'android' ? stemFile.uri : stemFile.uri.replace('file://', ''),
        name: stemFile.name,
        type: stemFile.mimeType,
      };
      const separated = await stemService.separate(file);
      if (separated.status !== 'completed') {
        throw new Error(separated.message || 'Stem separation did not complete');
      }
      const downloaded = await stemService.download(separated.job_id);
      setStemDownload({ jobId: separated.job_id, ...downloaded });
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Stem separation failed');
    } finally {
      setStemLoading(false);
    }
  };

  const handleSplitStemsFromTrack = async () => {
    if (!stemsSourceTrack) {
      return;
    }
    setError(null);
    setStemLoading(true);
    setStemDownload(null);
    try {
      const separated = await stemService.separateFromTrack(stemsSourceTrack.id);
      if (separated.status !== 'completed') {
        throw new Error(separated.message || 'Stem separation did not complete');
      }
      const downloaded = await stemService.download(separated.job_id);
      setStemDownload({ jobId: separated.job_id, ...downloaded });
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Stem separation failed');
    } finally {
      setStemLoading(false);
    }
  };

  const handleAddStemTrack = async (stemFileName: string) => {
    if (!currentProject || !stemDownload) {
      return;
    }
    const key = stemFileName.replace('.wav', '');
    const label = STEM_LABELS[key] || key;
    try {
      const track = await stemService.addAsTrack(currentProject.id, {
        name: `${label} Stem`,
        job_id: stemDownload.jobId,
        stem_name: stemFileName,
      });
      addTrack(track);
      Alert.alert('Added', `${label} added as a new track in ${currentProject.name}.`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add stem as track');
    }
  };

  const handleUseStemAsInstrument = (stemFileName: string) => {
    if (!stemDownload) {
      return;
    }
    const key = stemFileName.replace('.wav', '');
    const label = STEM_LABELS[key] || key;
    const url = stemDownload.download_urls[stemFileName];
    if (!url) {
      return;
    }
    addSample({ id: `stem-${stemDownload.jobId}-${key}`, name: label, uri: url, source: 'stem' });
    Alert.alert('Added to Instruments', `"${label}" is now playable on the Instrument tab.`);
  };

  const handleLayerInstrument = async (inst: Instrument) => {
    if (!currentProject) {
      return;
    }
    setError(null);
    setLayeringInstrument(inst);
    try {
      const result = await aiService.generateInstrument({
        instrument: inst,
        bpm: currentProject.bpm,
        key: currentProject.key,
        duration: 8,
      });
      const label = inst.charAt(0).toUpperCase() + inst.slice(1);
      const track = await trackService.create(currentProject.id, {
        name: `${label} Part`,
        type: 'instrument',
        midi_data: result.midi_data,
        volume: 0.8,
        pan: 0,
      });
      addTrack(track);
      Alert.alert('Added', `${label} added as a new track in ${currentProject.name}.`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add instrument track');
    } finally {
      setLayeringInstrument(null);
    }
  };

  const handleGenerateLyrics = async () => {
    if (!lyricsTopic.trim()) {
      return;
    }
    setError(null);
    setLyricsGenLoading(true);
    try {
      const result = await aiService.generateLyrics({
        topic: lyricsTopic.trim(),
        mood: lyricsMood.trim() || undefined,
        genre: lyricsGenre.trim() || undefined,
      });
      setLyrics(result.lyrics);
      setLyricsSource(result.source);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate lyrics');
    } finally {
      setLyricsGenLoading(false);
    }
  };

  const handleGenerateSong = async () => {
    if (!lyrics.trim()) {
      return;
    }
    setError(null);
    stopSongPlayback();
    setSongAudio(null);
    setSongLoading(true);
    try {
      const result = await aiService.generateSong({ lyrics: lyrics.trim() });
      setSongResult(result);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate song');
    } finally {
      setSongLoading(false);
    }
  };

  // The fast text/melody step above always plays back as a synth preview.
  // This is the slow step (word-by-word TTS + per-word pitch/time fitting)
  // that turns it into a real sung-vocal + beat audio file, triggered
  // explicitly once the user is happy with the key/tempo/melody — a full
  // song can take a few minutes to render.
  const handleGenerateSongAudio = async () => {
    if (!songResult?.midi_data?.length) {
      return;
    }
    setError(null);
    stopSongPlayback();
    setSongAudioLoading(true);
    try {
      const result = await aiService.generateSongAudio({
        melody: songResult.midi_data,
        drum_pattern: songResult.drum_pattern,
        bpm: songResult.bpm,
      });
      setSongAudio({
        jobId: result.job_id,
        vocalsStemName: result.vocals_stem_name,
        beatStemName: result.beat_stem_name,
        vocalsUrl: result.vocals_url,
        beatUrl: result.beat_url,
        durationSeconds: result.duration_seconds ?? null,
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to render vocals & beat audio');
    } finally {
      setSongAudioLoading(false);
    }
  };

  // Guard on the ref (updates synchronously) rather than the songPlaying
  // state (updates async, on the next render) — a fast second tap could
  // otherwise read stale "not playing" state and start a second,
  // overlapping playback on top of one that's still actually running,
  // with no way to reach the first, now-orphaned one anymore.
  const handlePlaySong = () => {
    if (songPlaybackRef.current) {
      stopSongPlayback();
      return;
    }
    stopDrumPlayback();

    if (songAudio) {
      const vocalsPlayer = createAudioPlayer(songAudio.vocalsUrl);
      const beatPlayer = createAudioPlayer(songAudio.beatUrl);
      vocalsPlayer.volume = 1;
      beatPlayer.volume = 0.85;
      const cancelAll = () => {
        // pause() before remove() — remove() only detaches the JS handle
        // for eventual native disposal, it doesn't necessarily silence
        // playback immediately, so skipping pause() could leave audio
        // audibly running after the button says it's stopped.
        try {
          vocalsPlayer.pause();
        } catch {
          // ignore
        }
        try {
          beatPlayer.pause();
        } catch {
          // ignore
        }
        try {
          vocalsPlayer.remove();
        } catch {
          // already removed
        }
        try {
          beatPlayer.remove();
        } catch {
          // already removed
        }
      };
      // The vocals track carries the actual song length (the beat just
      // loops under it), so its own "finished" event — not a guessed
      // duration — is what ends playback for both.
      const subscription = onPlaybackFinished(vocalsPlayer, () => {
        if (songPlaybackRef.current?.cancelAll === cancelAll) {
          subscription.remove();
          cancelAll();
          songPlaybackRef.current = null;
          setSongPlaying(false);
        }
      });
      songPlaybackRef.current = { cancelAll };
      setSongPlaying(true);
      vocalsPlayer.play();
      beatPlayer.play();
      return;
    }

    if (!songResult?.midi_data?.length) {
      return;
    }
    const bpm = songResult.bpm ?? 100;
    const melody = playPattern('piano', songResult.midi_data, bpm);
    const beat = playDrumPattern(() => songResult.drum_pattern, bpm);
    const cancelAll = () => {
      melody.cancel();
      beat.cancel();
    };
    songPlaybackRef.current = { cancelAll };
    setSongPlaying(true);

    // This synth preview has no real player to listen for a "finished"
    // event on — it's just scheduled note triggers — so a timer sized off
    // its own precisely-known totalMs (not a guess) is the only option;
    // the melody plays once through, and the beat loops underneath it
    // (like the Drums tab's own transport) so it must be stopped
    // explicitly once the melody finishes rather than looping forever.
    setTimeout(() => {
      if (songPlaybackRef.current?.cancelAll === cancelAll) {
        cancelAll();
        songPlaybackRef.current = null;
        setSongPlaying(false);
      }
    }, melody.totalMs + 400);
  };

  const handleAddSongTracks = async () => {
    if (!currentProject || !songResult) {
      return;
    }
    try {
      if (songAudio) {
        const vocalsTrack = await stemService.addAsTrack(currentProject.id, {
          name: 'Song Vocals',
          job_id: songAudio.jobId,
          stem_name: songAudio.vocalsStemName,
        });
        addTrack(vocalsTrack);

        const beatTrack = await stemService.addAsTrack(currentProject.id, {
          name: `${songResult.style ?? 'Song'} Beat`,
          job_id: songAudio.jobId,
          stem_name: songAudio.beatStemName,
        });
        addTrack(beatTrack);

        Alert.alert('Added', `Vocals and beat added to "${currentProject.name}".`);
        return;
      }

      const melodyTrack = await trackService.create(currentProject.id, {
        name: 'Song Melody',
        type: 'midi',
        midi_data: songResult.midi_data,
        volume: 0.8,
        pan: 0,
      });
      addTrack(melodyTrack);

      const beatTrack = await trackService.create(currentProject.id, {
        name: `${songResult.style ?? 'Song'} Beat`,
        type: 'midi',
        midi_data: drumPatternToNotes(songResult.drum_pattern),
        volume: 0.8,
        pan: 0,
      });
      addTrack(beatTrack);

      Alert.alert('Added', `Melody and beat added to "${currentProject.name}".`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save the song as tracks');
    }
  };

  const handleDownloadVocals = () => {
    if (!songAudio) return;
    downloadAndShareAudio(songAudio.vocalsUrl, safeFileName('vocals', 'wav'), 'audio/wav');
  };

  const handleDownloadBeat = () => {
    if (!songAudio) return;
    downloadAndShareAudio(songAudio.beatUrl, safeFileName(`${songResult?.style ?? 'song'}-beat`, 'wav'), 'audio/wav');
  };

  const handleGenerateMidi = async () => {
    setError(null);
    setMidiLoading(true);
    try {
      const result = await aiService.generateMidi({
        prompt,
        key: currentProject?.key,
        duration: 8,
      });
      setMidiResult(result);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate MIDI');
    } finally {
      setMidiLoading(false);
    }
  };

  const handleAddMidiTrack = async () => {
    if (!currentProject || !midiResult) {
      return;
    }
    if (editingTrackId) {
      await trackService.update(editingTrackId, { midi_data: midiResult.midi_data });
      updateTrack(editingTrackId, { midi_data: midiResult.midi_data });
      setEditingTrackId(null);
      navigation.goBack();
      return;
    }
    const track = await trackService.create(currentProject.id, {
      name: 'AI Melody',
      type: 'midi',
      midi_data: midiResult.midi_data,
      volume: 0.8,
      pan: 0,
    });
    addTrack(track);
    navigation.goBack();
  };

  const handleGenerateDrums = async () => {
    setError(null);
    setDrumLoading(true);
    try {
      const result = await aiService.generateDrums(style, drumBpm, 1);
      // The backend always composes a 16-step pattern regardless of `bars` —
      // resize it to whatever step count is currently selected here so a
      // freshly-generated beat doesn't silently reset the grid size.
      setDrumPattern(resizeDrumPattern(result.pattern, drumSteps));
      setDrumSource(result.source);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate drums');
    } finally {
      setDrumLoading(false);
    }
  };

  const stopDrumPlayback = () => {
    drumCancelRef.current?.();
    drumCancelRef.current = null;
    setDrumPlayingStep(null);
  };

  const stopSongPlayback = () => {
    songPlaybackRef.current?.cancelAll();
    songPlaybackRef.current = null;
    setSongPlaying(false);
  };

  // Both the drum sequencer and the song preview's beat loop indefinitely
  // once started, so they must be stopped when this tab loses focus —
  // otherwise switching to Home/Instrument/Profile would leave audio
  // looping in the background forever, since tab screens stay mounted
  // rather than unmounting on blur.
  useFocusEffect(
    useCallback(() => {
      return () => {
        stopDrumPlayback();
        stopSongPlayback();
      };
    }, [])
  );

  const toggleDrumPlayback = () => {
    if (drumPlayingStep !== null) {
      stopDrumPlayback();
      return;
    }
    // Loops continuously until Stop is pressed, like a real drum machine's
    // transport, and reads drumPatternRef fresh each step so edits made
    // while it's playing are heard immediately.
    const { cancel } = playDrumPattern(() => drumPatternRef.current, drumBpm, setDrumPlayingStep);
    drumCancelRef.current = cancel;
  };

  useEffect(() => stopDrumPlayback, []);

  const handleClearDrums = () => {
    stopDrumPlayback();
    setDrumPattern(emptyDrumPattern(drumSteps));
    setDrumSource(null);
  };

  const handleAddDrumTrack = async () => {
    if (!currentProject) {
      return;
    }
    const track = await trackService.create(currentProject.id, {
      name: `${style} Drums`,
      type: 'midi',
      midi_data: drumPatternToNotes(drumPattern),
      volume: 0.8,
      pan: 0,
    });
    addTrack(track);
    navigation.goBack();
  };

  const toggleRecording = async () => {
    setError(null);
    try {
      if (isRecording) {
        const uri = await stopRecording();
        setRecordedUri(uri);
      } else {
        setHarmonyResult(null);
        setAnalysisResult(null);
        setRecordedUri(null);
        await startRecording();
      }
    } catch (err: any) {
      setError(err.message || 'Recording failed');
    }
  };

  const handleUseRecordingAsInstrument = () => {
    if (!recordedUri) {
      return;
    }
    const name = `Recording ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    addSample({ id: `rec-${Date.now()}`, name, uri: recordedUri, source: 'recording' });
    Alert.alert('Added to Instruments', `"${name}" is now playable on the Instrument tab.`);
  };

  const recordedFile = () => {
    if (!recordedUri) {
      return null;
    }
    const fileName = recordedUri.split('/').pop() || 'clip.m4a';
    return {
      uri: Platform.OS === 'android' ? recordedUri : recordedUri.replace('file://', ''),
      name: fileName,
      type: 'audio/m4a',
    };
  };

  const handleSuggestHarmony = async () => {
    const file = recordedFile();
    if (!file) {
      return;
    }
    setError(null);
    setHarmonyLoading(true);
    try {
      const result = await aiService.suggestHarmony(file);
      setHarmonyResult(result);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to suggest harmony');
    } finally {
      setHarmonyLoading(false);
    }
  };

  const handleAnalyzeAudio = async () => {
    const file = recordedFile();
    if (!file) {
      return;
    }
    setError(null);
    setHarmonyLoading(true);
    try {
      const result = await aiService.analyzeAudio(file);
      setAnalysisResult(result);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to analyze audio');
    } finally {
      setHarmonyLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.topNav,
          { paddingTop: insets.top + 12, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right },
        ]}
      >
        {view !== 'home' ? (
          <TouchableOpacity onPress={() => setView('home')}>
            <Text style={styles.backButton}>{'<'}</Text>
          </TouchableOpacity>
        ) : navigation.canGoBack() ? (
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>{'<'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
        <View style={styles.brandRow}>
          <WaveformMark size={22} />
          <Text style={styles.brandText}>MproWave</Text>
        </View>
        <TouchableOpacity style={styles.navAvatar} onPress={() => navigation.navigate('Profile')}>
          <Text style={styles.navAvatarText}>{(userName || '?').charAt(0).toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      <LinearGradient
        colors={primaryGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { marginLeft: 20 + insets.left, marginRight: 20 + insets.right }]}
      >
        <View style={styles.heroTextCol}>
          <Text style={styles.heroTitle}>AI Assistant</Text>
          <Text style={styles.heroSubtitle}>Create beats, lyrics &amp; full songs with the power of AI</Text>
        </View>
        <View style={styles.heroGraphic}>
          <Ionicons name="headset" size={26} color="rgba(255,255,255,0.95)" />
          <Ionicons name="musical-note" size={13} color="rgba(255,255,255,0.6)" style={styles.heroGraphicNoteA} />
          <Ionicons name="musical-notes" size={11} color="rgba(255,255,255,0.5)" style={styles.heroGraphicNoteB} />
        </View>
      </LinearGradient>

      {!currentProject && (
        <Text style={styles.noProjectHint}>
          Open a project from Home to save results as tracks.
        </Text>
      )}

      {view === 'home' && (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.homeGreeting}>Hey {userName || 'there'} 👋</Text>
          <Text style={styles.homeSubtitle}>What do you want to create today?</Text>
          <View style={styles.homeGrid}>
            {QUICK_ACTIONS.map((action, index) => (
              <TouchableOpacity
                key={`${action.key}-${index}`}
                style={styles.homeCard}
                onPress={() => setView(action.key)}
              >
                <View style={styles.homeCardIconWrap}>
                  <Ionicons name={action.icon} size={20} color={colors.primaryLight} />
                </View>
                <Text style={styles.homeCardLabel}>{action.label}</Text>
                <Text style={styles.homeCardSub}>{action.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {view !== 'home' && (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabs}
        contentContainerStyle={{ paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right, gap: 8 }}
      >
        {(['lyrics', 'midi', 'drums', 'harmony', 'stems'] as Section[]).map((s) => {
          const active = section === s;
          return (
            <TouchableOpacity key={s} onPress={() => setView(s)}>
              {active ? (
                <LinearGradient
                  colors={primaryGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.tabPill}
                >
                  <Text style={styles.tabPillTextActive}>{s}</Text>
                </LinearGradient>
              ) : (
                <View style={styles.tabPill}>
                  <Text style={styles.tabPillText}>{s}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      )}

      {view !== 'home' && (
      <ScrollView
        style={styles.content}
        contentContainerStyle={{
          paddingBottom: 40 + insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
        showsVerticalScrollIndicator={false}
      >
        {error && <Text style={styles.error}>{error}</Text>}

        {section === 'lyrics' && (
          <View>
            <View style={styles.lyricsGenBox}>
              <Text style={styles.label}>Don&apos;t have lyrics? Generate some</Text>
              <ThemedInput
                style={styles.inputSpacing}
                placeholder="Topic, e.g. 'chasing a dream in the city'"
                value={lyricsTopic}
                onChangeText={setLyricsTopic}
              />
              <View style={styles.lyricsGenRow}>
                <ThemedInput
                  style={[styles.inputSpacing, styles.lyricsGenHalf]}
                  placeholder="Mood (optional)"
                  value={lyricsMood}
                  onChangeText={setLyricsMood}
                />
                <ThemedInput
                  style={[styles.inputSpacing, styles.lyricsGenHalf]}
                  placeholder="Genre (optional)"
                  value={lyricsGenre}
                  onChangeText={setLyricsGenre}
                />
              </View>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleGenerateLyrics}
                disabled={lyricsGenLoading || !lyricsTopic.trim()}
              >
                {lyricsGenLoading ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.actionButtonText}>✨ Generate Lyrics</Text>
                )}
              </TouchableOpacity>
              {lyricsSource && (
                <Text style={styles.sourceCaption}>
                  {lyricsSource === 'ai'
                    ? 'Written by AI from your topic'
                    : "Written locally from your topic's mood — connect an AI provider in the backend for fully original lyrics"}
                </Text>
              )}
            </View>

            <Text style={styles.label}>Lyrics you want to sing</Text>
            <ThemedInput
              style={[styles.inputSpacing, styles.lyricsInput]}
              placeholder={'e.g.\nWalking home alone tonight\nThe streetlights fading out of sight'}
              value={lyrics}
              onChangeText={setLyrics}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
            {/* Song audio generation (melody planning + real vocals & beat
                rendering) is disabled until a paid provider for beat/song
                generation is set up — lyrics writing above stays enabled.
                Re-enable by uncommenting this whole block and removing the
                songDisabledBox notice below it.
            {(
              <>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleGenerateSong}
                  disabled={songLoading || !lyrics.trim()}
                >
                  {songLoading ? (
                    <ActivityIndicator color={colors.onAccent} />
                  ) : (
                    <Text style={styles.actionButtonText}>Generate Song</Text>
                  )}
                </TouchableOpacity>

                {songResult && (
                  <View style={styles.resultBox}>
                    <View style={styles.songInfoRow}>
                      <View style={styles.songInfoChip}>
                        <Text style={styles.songInfoLabel}>Key</Text>
                        <Text style={styles.songInfoValue}>{songResult.key} {songResult.scale}</Text>
                      </View>
                      <View style={styles.songInfoChip}>
                        <Text style={styles.songInfoLabel}>Tempo</Text>
                        <Text style={styles.songInfoValue}>{songResult.bpm} BPM</Text>
                      </View>
                      <View style={styles.songInfoChip}>
                        <Text style={styles.songInfoLabel}>Beat</Text>
                        <Text style={[styles.songInfoValue, { textTransform: 'capitalize' }]}>{songResult.style}</Text>
                      </View>
                      {!!songResult.duration_seconds && (
                        <View style={styles.songInfoChip}>
                          <Text style={styles.songInfoLabel}>Length</Text>
                          <Text style={styles.songInfoValue}>
                            {Math.floor(songResult.duration_seconds / 60)}:
                            {String(Math.round(songResult.duration_seconds % 60)).padStart(2, '0')}
                          </Text>
                        </View>
                      )}
                    </View>

                    {!!songResult.vocal_direction && (
                      <View style={styles.vocalDirectionBox}>
                        <View style={styles.vocalDirectionHeader}>
                          <Ionicons name="mic-outline" size={14} color={trackTypeColors.midi.accent} />
                          <Text style={[styles.vocalDirectionTitle, { color: trackTypeColors.midi.accent }]}>
                            How to sing it
                          </Text>
                        </View>
                        <Text style={styles.vocalDirectionText}>{songResult.vocal_direction}</Text>
                      </View>
                    )}

                    <PianoRoll notes={songResult.midi_data} accent={trackTypeColors.midi.accent} />

                    {!songAudio && (
                      <TouchableOpacity
                        style={[styles.actionButton, styles.inputSpacing]}
                        onPress={handleGenerateSongAudio}
                        disabled={songAudioLoading}
                      >
                        {songAudioLoading ? (
                          <View style={styles.songAudioLoadingRow}>
                            <ActivityIndicator color={colors.onAccent} />
                            <Text style={styles.actionButtonText}>Singing it — this can take a few minutes…</Text>
                          </View>
                        ) : (
                          <Text style={styles.actionButtonText}>🎤 Render Real Vocals &amp; Beat</Text>
                        )}
                      </TouchableOpacity>
                    )}

                    {songAudio && (
                      <View style={styles.songAudioReadyBox}>
                        <Ionicons name="checkmark-circle" size={14} color={trackTypeColors.midi.accent} />
                        <Text style={[styles.songAudioReadyText, { color: trackTypeColors.midi.accent }]}>
                          Real sung vocals &amp; beat rendered — Play Song now plays the actual audio.
                        </Text>
                      </View>
                    )}

                    <View style={styles.drumTransport}>
                      <TouchableOpacity style={styles.transportButton} onPress={handlePlaySong}>
                        <Text style={styles.transportButtonText}>
                          {songPlaying ? '■ Stop' : songAudio ? '▶ Play Song (real vocals)' : '▶ Preview Melody'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {songAudio && (
                      <View style={styles.stemActions}>
                        <TouchableOpacity onPress={handleDownloadVocals}>
                          <Text style={styles.stemActionText}>⬇ Vocals</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleDownloadBeat}>
                          <Text style={styles.stemActionText}>⬇ Beat</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <Text style={styles.sourceCaption}>
                      {songResult.source === 'ai'
                        ? 'Generated by AI from your lyrics'
                        : "Generated locally from your lyrics' mood — connect an AI provider in the backend for a fuller composition"}
                    </Text>

                    {currentProject && (
                      <TouchableOpacity style={styles.addButton} onPress={handleAddSongTracks}>
                        <Text style={styles.addButtonText}>
                          {songAudio ? '+ Add Vocals & Beat as Tracks' : '+ Add Melody & Beat as Tracks (preview only)'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </>
            )}
            */}

            <View style={styles.songDisabledBox}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.songDisabledText}>
                Song generation (beat + vocals) is temporarily disabled until a paid provider is set up. Lyrics
                writing above still works.
              </Text>
            </View>
          </View>
        )}

        {section === 'midi' && (
          <View>
            {editingTrackId && (
              <View style={styles.editingBanner}>
                <Ionicons name="create-outline" size={14} color={trackTypeColors.midi.accent} />
                <Text style={[styles.editingBannerText, { color: trackTypeColors.midi.accent }]}>
                  Editing an existing track — regenerate below, then save
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setEditingTrackId(null);
                    setMidiResult(null);
                  }}
                >
                  <Ionicons name="close" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.label}>Describe the melody you want</Text>
            <ThemedInput
              style={styles.inputSpacing}
              placeholder="e.g. A happy, upbeat melody"
              value={prompt}
              onChangeText={setPrompt}
            />
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleGenerateMidi}
              disabled={midiLoading || !prompt}
            >
              {midiLoading ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.actionButtonText}>Generate MIDI</Text>
              )}
            </TouchableOpacity>

            {midiResult && (
              <View style={styles.resultBox}>
                <PianoRoll notes={midiResult.midi_data} accent={trackTypeColors.midi.accent} />
                <Text style={styles.sourceCaption}>
                  {midiResult.source === 'ai'
                    ? 'Generated by AI'
                    : midiResult.source === 'existing'
                    ? 'Current track pattern'
                    : 'Generated locally — connect an AI provider in the backend to enable AI composition'}
                </Text>
                {currentProject && (
                  <TouchableOpacity style={styles.addButton} onPress={handleAddMidiTrack}>
                    <Text style={styles.addButtonText}>
                      {editingTrackId ? 'Save Changes' : '+ Add as Track'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {section === 'drums' && (
          <View>
            <View style={styles.drumStyleGrid}>
              {DRUM_STYLES.map((s) => {
                const active = style === s;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.drumStyleCard, active && styles.drumStyleCardActive]}
                    onPress={() => setStyle(s)}
                  >
                    <Ionicons
                      name={DRUM_STYLE_ICONS[s]}
                      size={22}
                      color={active ? colors.primaryLight : colors.textSecondary}
                    />
                    <Text style={[styles.drumStyleLabel, active && styles.drumStyleLabelActive]}>
                      {DRUM_STYLE_LABELS[s]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.beatBuilderCard}>
              <View style={styles.beatBuilderHeader}>
                <View style={styles.beatBuilderIconWrap}>
                  <Ionicons name="pulse" size={20} color={colors.primaryLight} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.beatBuilderTitle}>Beat Builder</Text>
                  <Text style={styles.beatBuilderSubtitle}>Customize your drum pattern</Text>
                </View>
              </View>

              <DrumSequencer pattern={drumPattern} onChange={setDrumPattern} activeStep={drumPlayingStep} />

              <View style={styles.beatBuilderFooter}>
                <View>
                  <TouchableOpacity
                    style={styles.footerChip}
                    onPress={() => {
                      setKeyMenuOpen(false);
                      setStepsMenuOpen((open) => !open);
                    }}
                  >
                    <Text style={styles.footerChipText}>{drumSteps} Steps</Text>
                    <Ionicons
                      name={stepsMenuOpen ? 'chevron-up' : 'chevron-down'}
                      size={12}
                      color={colors.textTertiary}
                    />
                  </TouchableOpacity>
                  {stepsMenuOpen && (
                    <View style={styles.dropdownMenu}>
                      {STEP_COUNT_OPTIONS.map((count) => (
                        <TouchableOpacity
                          key={count}
                          style={styles.dropdownItem}
                          onPress={() => changeStepCount(count)}
                        >
                          <Text
                            style={[styles.dropdownItemText, count === drumSteps && styles.dropdownItemTextActive]}
                          >
                            {count} Steps
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                <View style={styles.bpmStepper}>
                  <Ionicons name="musical-note" size={13} color={colors.primaryLight} />
                  <Text style={styles.bpmStepperText}>{drumBpm} BPM</Text>
                  <TouchableOpacity
                    style={styles.bpmStepperButton}
                    onPress={() => setDrumBpm((b) => Math.max(40, b - 5))}
                  >
                    <Ionicons name="remove" size={13} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.bpmStepperButton}
                    onPress={() => setDrumBpm((b) => Math.min(240, b + 5))}
                  >
                    <Ionicons name="add" size={13} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                <View>
                  <TouchableOpacity
                    style={styles.footerChip}
                    disabled={!currentProject || keySaving}
                    onPress={() => {
                      setStepsMenuOpen(false);
                      setKeyMenuOpen((open) => !open);
                    }}
                  >
                    {keySaving ? (
                      <ActivityIndicator size="small" color={colors.textSecondary} />
                    ) : (
                      <Ionicons name="key-outline" size={12} color={colors.textTertiary} />
                    )}
                    <Text style={styles.footerChipText}>{currentProject?.key ?? 'C'}</Text>
                  </TouchableOpacity>
                  {keyMenuOpen && (
                    <View style={[styles.dropdownMenu, styles.dropdownMenuRight]}>
                      {MUSIC_KEYS.map((k) => (
                        <TouchableOpacity key={k} style={styles.dropdownItem} onPress={() => changeProjectKey(k)}>
                          <Text
                            style={[
                              styles.dropdownItemText,
                              k === currentProject?.key && styles.dropdownItemTextActive,
                            ]}
                          >
                            {k}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>

              <Text style={styles.stemHint}>Tap any cell to toggle it on or off — it plays instantly.</Text>
            </View>

            <TouchableOpacity onPress={toggleDrumPlayback}>
              <LinearGradient
                colors={primaryGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.playBeatButton}
              >
                <Ionicons
                  name={drumPlayingStep !== null ? 'stop' : 'play'}
                  size={16}
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.playBeatButtonText}>
                  {drumPlayingStep !== null ? 'Stop' : 'Play Beat'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.drumTransport}>
              <TouchableOpacity style={styles.transportButtonSecondary} onPress={handleClearDrums}>
                <Text style={styles.transportButtonSecondaryText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.transportButtonSecondary, styles.generateBeatButton]}
                onPress={handleGenerateDrums}
                disabled={drumLoading}
              >
                {drumLoading ? (
                  <ActivityIndicator color={colors.primaryLight} />
                ) : (
                  <Text style={styles.generateBeatButtonText}>✨ Generate Beat</Text>
                )}
              </TouchableOpacity>
            </View>

            {drumSource && (
              <Text style={styles.sourceCaption}>
                {drumSource === 'ai'
                  ? 'Generated by AI'
                  : 'Generated locally — connect an AI provider in the backend to enable AI composition'}
              </Text>
            )}

            {currentProject && (
              <TouchableOpacity style={styles.addButton} onPress={handleAddDrumTrack}>
                <Text style={styles.addButtonText}>+ Add as Track</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {section === 'harmony' && (
          <View>
            <Text style={styles.label}>
              Record a short clip so the assistant can listen and suggest ideas
            </Text>
            <TouchableOpacity
              style={[styles.recordButton, isRecording && styles.recordButtonActive]}
              onPress={toggleRecording}
            >
              <Text style={styles.recordButtonText}>
                {isRecording ? '■ Stop Recording' : '● Record Clip'}
              </Text>
            </TouchableOpacity>

            {isRecording && <RecordingMeter durationMillis={durationMillis} meterLevel={meterLevel} />}

            {recordedUri && !isRecording && (
              <View style={styles.harmonyActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleSuggestHarmony}
                  disabled={harmonyLoading}
                >
                  <Text style={styles.actionButtonText}>Suggest Harmony</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleAnalyzeAudio}
                  disabled={harmonyLoading}
                >
                  <Text style={styles.actionButtonText}>Analyze Audio</Text>
                </TouchableOpacity>
              </View>
            )}

            {recordedUri && !isRecording && (
              <TouchableOpacity style={styles.sampleButton} onPress={handleUseRecordingAsInstrument}>
                <Ionicons name="musical-notes-outline" size={16} color={trackTypeColors.instrument.accent} />
                <Text style={[styles.sampleButtonText, { color: trackTypeColors.instrument.accent }]}>
                  Add to Instruments
                </Text>
              </TouchableOpacity>
            )}

            {harmonyLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 10 }} />}

            {harmonyResult && (
              <View style={styles.resultBox}>
                <Text style={styles.resultLabel}>Suggested chords</Text>
                <Text style={styles.resultText}>
                  {(Array.isArray(harmonyResult.chords) ? harmonyResult.chords : []).join(', ') || 'None detected'}
                </Text>
                <Text style={styles.resultLabel}>Detected key / tempo</Text>
                <Text style={styles.resultText}>
                  {harmonyResult.detected_key || '—'} · {harmonyResult.detected_tempo_bpm || '—'} BPM
                </Text>
                <Text style={styles.sourceCaption}>
                  {harmonyResult.source === 'ai'
                    ? 'Generated by AI from your recording'
                    : 'A safe default progression — full audio listening needs an AI provider key with balance and audio-to-MIDI support installed on the backend'}
                </Text>
              </View>
            )}

            {analysisResult && (
              <View style={styles.resultBox}>
                <Text style={styles.resultLabel}>Analysis</Text>
                <Text style={styles.resultText}>
                  {analysisResult.genre || 'Unknown genre'} · {analysisResult.bpm || '—'} BPM ·{' '}
                  {analysisResult.key || '—'}
                </Text>
                <Text style={styles.sourceCaption}>
                  {analysisResult.source === 'ai'
                    ? 'Generated by AI from your recording'
                    : 'A rough estimate — full audio listening needs an AI provider key with balance and audio-to-MIDI support installed on the backend'}
                </Text>
              </View>
            )}
          </View>
        )}

        {section === 'stems' && (
          <View>
            <Text style={styles.label}>Split a song into vocals, drums, bass, and other</Text>

            {stemsSourceTrack ? (
              <View style={styles.stemsSourceBanner}>
                <Ionicons name="musical-note" size={16} color={trackTypeColors.audio.accent} />
                <Text style={styles.stemsSourceText} numberOfLines={1}>
                  Splitting &quot;{stemsSourceTrack.name}&quot;
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setStemsSourceTrack(null);
                    setStemDownload(null);
                  }}
                  disabled={stemLoading}
                >
                  <Ionicons name="close" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.recordButton} onPress={handlePickStemFile} disabled={stemLoading}>
                <Text style={styles.recordButtonText} numberOfLines={1}>
                  {stemFile ? `🎵 ${stemFile.name}` : '+ Choose an audio file'}
                </Text>
              </TouchableOpacity>
            )}

            {(stemFile || stemsSourceTrack) && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={stemsSourceTrack ? handleSplitStemsFromTrack : handleSplitStems}
                disabled={stemLoading}
              >
                {stemLoading ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.actionButtonText}>Split into Stems</Text>
                )}
              </TouchableOpacity>
            )}

            {stemLoading && (
              <Text style={styles.stemHint}>
                This runs locally on CPU — a full song can genuinely take 10-20+ minutes. Keep the
                app open in the foreground; it's still working even though the wait is long.
              </Text>
            )}

            {stemDownload && (
              <View style={styles.resultBox}>
                <Text style={styles.resultLabel}>Separated stems</Text>
                {stemDownload.stems.map((stem) => {
                  const key = stem.name.replace('.wav', '');
                  const label = STEM_LABELS[key] || key;
                  return (
                    <View key={stem.name} style={styles.stemRow}>
                      <Text style={styles.stemName}>{label}</Text>
                      <View style={styles.stemActions}>
                        <TouchableOpacity onPress={() => playAudioPreview(stemDownload.download_urls[stem.name])}>
                          <Text style={styles.stemActionText}>▶ Play</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() =>
                            downloadAndShareAudio(
                              stemDownload.download_urls[stem.name],
                              safeFileName(label, 'wav'),
                              'audio/wav'
                            )
                          }
                        >
                          <Text style={styles.stemActionText}>⬇ Download</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleUseStemAsInstrument(stem.name)}>
                          <Text style={styles.stemActionText}>🎹 Instrument</Text>
                        </TouchableOpacity>
                        {currentProject && (
                          <TouchableOpacity onPress={() => handleAddStemTrack(stem.name)}>
                            <Text style={styles.stemActionText}>+ Add</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {currentProject && (
              <View style={styles.layerSection}>
                <Text style={styles.label}>Layer an instrument on this project</Text>
                <View style={styles.styleRow}>
                  {INSTRUMENT_CHOICES.map((inst) => (
                    <TouchableOpacity
                      key={inst.id}
                      style={[
                        styles.styleChip,
                        {
                          backgroundColor: trackTypeColors.instrument.tint,
                          borderColor: trackTypeColors.instrument.border,
                        },
                      ]}
                      onPress={() => handleLayerInstrument(inst.id)}
                      disabled={layeringInstrument !== null}
                    >
                      {layeringInstrument === inst.id ? (
                        <ActivityIndicator size="small" color={trackTypeColors.instrument.accent} />
                      ) : (
                        <Text style={[styles.styleChipText, { color: trackTypeColors.instrument.accent }]}>
                          {inst.label}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.stemHint}>
                  Adds a short AI-generated part as a new track, ready to edit alongside the stems above.
                </Text>
              </View>
            )}
          </View>
        )}

      </ScrollView>
      )}
    </View>
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
  },
  backButton: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    width: 24,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  navAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navAvatarText: {
    color: colors.onAccent,
    fontSize: 13,
    fontWeight: '700',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },
  heroTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 6,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    lineHeight: 17,
  },
  heroGraphic: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGraphicNoteA: {
    position: 'absolute',
    top: -4,
    right: -2,
  },
  heroGraphicNoteB: {
    position: 'absolute',
    bottom: -2,
    left: -2,
  },
  tabs: {
    flexGrow: 0,
    marginBottom: 16,
  },
  tabPill: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  tabPillText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  tabPillTextActive: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  label: {
    color: colors.textSecondary,
    marginBottom: 8,
  },
  inputSpacing: {
    marginBottom: 16,
  },
  actionButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  actionButtonText: {
    color: colors.onAccent,
    fontWeight: '600',
  },
  recordButton: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  recordButtonActive: {
    backgroundColor: colors.danger,
  },
  recordButtonText: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  stemsSourceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: trackTypeColors.audio.tint,
    borderRadius: 8,
    padding: 14,
  },
  stemsSourceText: {
    flex: 1,
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
  styleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  styleChip: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  styleChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  drumTransport: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  transportButton: {
    flex: 1,
    backgroundColor: trackTypeColors.midi.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  transportButtonText: {
    color: colors.onAccent,
    fontWeight: '700',
  },
  transportButtonSecondary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
  },
  transportButtonSecondaryText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  harmonyActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  resultBox: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    marginTop: 10,
  },
  resultLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 8,
  },
  resultText: {
    color: colors.textPrimary,
    marginTop: 4,
  },
  sourceCaption: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  addButtonText: {
    color: colors.onAccent,
    fontWeight: '600',
  },
  error: {
    color: colors.danger,
    marginBottom: 12,
    textAlign: 'center',
  },
  stemHint: {
    color: colors.textTertiary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  stemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceAlt,
  },
  stemName: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  stemActions: {
    flexDirection: 'row',
    gap: 16,
  },
  stemActionText: {
    color: trackTypeColors.audio.accent,
    fontWeight: '700',
    fontSize: 13,
  },
  noProjectHint: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  sampleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    padding: 10,
  },
  sampleButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  layerSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceAlt,
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: trackTypeColors.midi.tint,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  editingBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  lyricsInput: {
    height: 130,
  },
  lyricsGenBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  lyricsGenRow: {
    flexDirection: 'row',
    gap: 10,
  },
  lyricsGenHalf: {
    flex: 1,
  },
  songInfoRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  songInfoChip: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  songInfoLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  songInfoValue: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  vocalDirectionBox: {
    backgroundColor: trackTypeColors.midi.tint,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  vocalDirectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  vocalDirectionTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  vocalDirectionText: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
  },
  songAudioLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  songAudioReadyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: trackTypeColors.midi.tint,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  songAudioReadyText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  songDisabledBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
  },
  songDisabledText: {
    flex: 1,
    color: colors.textTertiary,
    fontSize: 12,
    lineHeight: 17,
  },
  homeGreeting: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  homeSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  homeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  homeCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  homeCardIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeCardLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  homeCardSub: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: -4,
  },
  drumSectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  drumStyleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  drumStyleCard: {
    flexBasis: '17%',
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  drumStyleCardActive: {
    backgroundColor: trackTypeColors.midi.tint,
    borderColor: colors.primaryLight,
  },
  drumStyleLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  drumStyleLabelActive: {
    color: colors.textPrimary,
  },
  beatBuilderCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 18,
  },
  beatBuilderHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 18,
  },
  beatBuilderIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: trackTypeColors.midi.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beatBuilderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  beatBuilderSubtitle: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  beatBuilderFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 14,
  },
  footerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  footerChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingVertical: 4,
    minWidth: 90,
    zIndex: 20,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  dropdownMenuRight: {
    left: undefined,
    right: 0,
  },
  dropdownItem: {
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  dropdownItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  dropdownItemTextActive: {
    color: colors.primaryLight,
  },
  bpmStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  bpmStepperText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  bpmStepperButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBeatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 17,
    marginBottom: 14,
  },
  playBeatButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  generateBeatButton: {
    backgroundColor: trackTypeColors.midi.tint,
  },
  generateBeatButtonText: {
    color: colors.primaryLight,
    fontWeight: '700',
  },
});
