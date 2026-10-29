import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors, trackTypeColors } from '../theme/colors';
import { BackButton } from '../components/BackButton';
import {
  Instrument,
  playInstrumentNote,
  playPattern,
  playSampleNote,
  playSustainedNote,
  stopSustainedNote,
  REFERENCE_MIDI,
  SAMPLE_REFERENCE_MIDI,
} from '../services/instrumentSynth';
import { playDrum } from '../services/drumSynth';
import { midiToNoteName } from '../utils/notes';
import { useSampleStore } from '../store/sampleStore';
import { useProjectStore } from '../store/projectStore';
import { trackService } from '../services/api';

type HeldPlayer = ReturnType<typeof playSustainedNote>;

interface RecordedNote {
  note: string;
  start: number;
  duration: number;
  velocity: number;
}

// One recorded or preset-generated performance, kept as its own layer so
// several can be combined ("mixed") into one song instead of only ever
// having a single in-progress recording.
interface Take {
  id: string;
  name: string;
  voice: Instrument | string; // built-in instrument id, or a custom sample's URI
  icon: 'mic' | 'musical-notes' | 'albums';
  notes: RecordedNote[];
  muted: boolean;
  volume: number;
}

interface BeatPreset {
  id: string;
  label: string;
  hits: { beat: number; duration: number; velocity: number }[];
}

// Ready-made one-bar rhythms usable with whatever instrument/sample is
// currently selected — a quick way to lay down a beat without tapping it
// out by hand. Purely rhythmic (same pitch throughout, varied velocity and
// spacing); melody-making is what the keyboard itself is for.
const BEAT_PRESETS: BeatPreset[] = [
  {
    id: 'steady',
    label: 'Steady',
    hits: [0, 1, 2, 3].map((beat) => ({ beat, duration: 0.4, velocity: 100 })),
  },
  {
    id: 'groove',
    label: 'Groove',
    hits: [
      { beat: 0, duration: 0.35, velocity: 108 },
      { beat: 0.5, duration: 0.25, velocity: 60 },
      { beat: 1, duration: 0.35, velocity: 85 },
      { beat: 1.5, duration: 0.25, velocity: 60 },
      { beat: 2, duration: 0.35, velocity: 108 },
      { beat: 2.5, duration: 0.25, velocity: 60 },
      { beat: 3, duration: 0.35, velocity: 85 },
      { beat: 3.5, duration: 0.25, velocity: 60 },
    ],
  },
  {
    id: 'syncopated',
    label: 'Syncopated',
    hits: [
      { beat: 0, duration: 0.3, velocity: 105 },
      { beat: 0.75, duration: 0.25, velocity: 75 },
      { beat: 1.5, duration: 0.3, velocity: 95 },
      { beat: 2, duration: 0.3, velocity: 105 },
      { beat: 2.75, duration: 0.25, velocity: 75 },
      { beat: 3.5, duration: 0.3, velocity: 95 },
    ],
  },
  {
    id: 'sparse',
    label: 'Sparse',
    hits: [
      { beat: 0, duration: 0.6, velocity: 110 },
      { beat: 2, duration: 0.6, velocity: 95 },
    ],
  },
];

const INSTRUMENTS: { id: Instrument; label: string }[] = [
  { id: 'piano', label: 'Piano' },
  { id: 'bass', label: 'Bass' },
  { id: 'guitar', label: 'Guitar' },
  { id: 'synth', label: 'Synth' },
  { id: 'strings', label: 'Strings' },
];

// One octave, laid out like a real keyboard: 8 white keys (C..C) with 5
// black keys (sharps) sitting in the gaps between them. `boundary` is the
// white-key index each black key straddles (used to position it).
const WHITE_KEYS = [
  { offset: 0, label: 'C' },
  { offset: 2, label: 'D' },
  { offset: 4, label: 'E' },
  { offset: 5, label: 'F' },
  { offset: 7, label: 'G' },
  { offset: 9, label: 'A' },
  { offset: 11, label: 'B' },
  { offset: 12, label: 'C' },
];
const BLACK_KEYS = [
  { offset: 1, boundary: 1 },
  { offset: 3, boundary: 2 },
  { offset: 6, boundary: 4 },
  { offset: 8, boundary: 5 },
  { offset: 10, boundary: 6 },
];

// Fixed piano colors — deliberately not theme-reactive, the same way a
// real keyboard's keys don't change with the room's lighting. Only the
// screen chrome around it (background, chips, header) follows the theme.
const KEY_WHITE = '#FAF8F4';
const KEY_WHITE_PRESSED = '#E7DFD0';
const KEY_BLACK = '#1A1816';
const KEY_BLACK_PRESSED = '#3A332A';
const KEY_BORDER = '#00000030';

export const InstrumentScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const [instrument, setInstrument] = useState<Instrument>('piano');
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [pressedKeys, setPressedKeys] = useState<Record<string, boolean>>({});
  const [octave, setOctave] = useState(0); // -1, 0, or 1 full octave shift
  const [keyboardWidth, setKeyboardWidth] = useState(0);
  const { samples, removeSample } = useSampleStore();
  const { currentProject, addTrack } = useProjectStore();

  // Real Yamaha-style keyboard controls: the panel's own tempo (starts from
  // the open project's BPM but is independently adjustable, same reasoning
  // as the Drums tab's own tempo control), a semitone transpose separate
  // from the full-octave shift above, a master output level, a metronome
  // click, sustain/hold (loops a note until the same key is tapped again —
  // the practical equivalent of a sustain pedal for these one-shot
  // samples), and a second "Dual" voice layered under every key press.
  const [bpm, setBpm] = useState(currentProject?.bpm ?? 120);
  useEffect(() => {
    if (currentProject?.bpm) setBpm(currentProject.bpm);
  }, [currentProject?.id]);
  const [transpose, setTranspose] = useState(0);
  const [masterVolume, setMasterVolume] = useState(0.9);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [sustainOn, setSustainOn] = useState(false);
  const [dualVoiceOn, setDualVoiceOn] = useState(false);
  const [dualInstrument, setDualInstrument] = useState<Instrument>('strings');
  const heldPlayersRef = useRef<Record<string, HeldPlayer>>({});
  const metronomeStepRef = useRef(0);

  useEffect(() => {
    if (!metronomeOn) {
      metronomeStepRef.current = 0;
      return;
    }
    const beatMs = 60000 / bpm;
    const interval = setInterval(() => {
      const step = metronomeStepRef.current % 4;
      playDrum('hihat', step === 0 ? 1 : 0.55);
      metronomeStepRef.current += 1;
    }, beatMs);
    return () => clearInterval(interval);
  }, [metronomeOn, bpm]);

  // Sustained notes must stop when the screen unmounts — otherwise a held
  // chord would keep looping forever in the background.
  useEffect(() => {
    return () => {
      Object.values(heldPlayersRef.current).forEach(stopSustainedNote);
      heldPlayersRef.current = {};
    };
  }, []);

  // A recorded performance in progress: which key, at what beat offset
  // (relative to when Record was pressed). Kept in a ref while recording so
  // fast taps don't each trigger a re-render; turned into a new Take once
  // recording stops.
  const recordingRef = useRef<{ startedAt: number; notes: RecordedNote[] } | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // Every take laid down so far — recorded or preset-generated — each its
  // own layer with independent mute/volume, so several can be played
  // together as one mix instead of only ever holding one recording.
  const [takes, setTakes] = useState<Take[]>([]);
  const [previewingTakeId, setPreviewingTakeId] = useState<string | null>(null);
  const previewCancelRef = useRef<(() => void) | null>(null);
  const [isMixPlaying, setIsMixPlaying] = useState(false);
  const mixCancelRef = useRef<(() => void) | null>(null);

  const selectedSample = samples.find((s) => s.id === selectedSampleId) || null;
  const accent = trackTypeColors.instrument.accent;
  const whiteKeyWidth = keyboardWidth / WHITE_KEYS.length;
  const blackKeyWidth = whiteKeyWidth * 0.58;

  const stopPreview = () => {
    previewCancelRef.current?.();
    previewCancelRef.current = null;
    setPreviewingTakeId(null);
  };

  const stopMix = () => {
    mixCancelRef.current?.();
    mixCancelRef.current = null;
    setIsMixPlaying(false);
  };

  useEffect(() => {
    return () => {
      stopPreview();
      stopMix();
    };
  }, []);

  const selectInstrument = (id: Instrument) => {
    setInstrument(id);
    setSelectedSampleId(null);
  };

  const selectSample = (id: string) => {
    setSelectedSampleId(id);
  };

  const handleRemoveSample = (id: string) => {
    if (selectedSampleId === id) setSelectedSampleId(null);
    removeSample(id);
  };

  const playKey = (offset: number, id: string) => {
    const midi =
      (selectedSample ? SAMPLE_REFERENCE_MIDI : REFERENCE_MIDI[instrument]) + octave * 12 + transpose + offset;

    if (sustainOn && !selectedSample) {
      // Toggle-hold: tapping a key that's already ringing releases it,
      // tapping a silent one starts it looping — the same "held until you
      // let go" effect a real sustain pedal gives a one-shot sample.
      const held = heldPlayersRef.current[id];
      if (held) {
        stopSustainedNote(held);
        delete heldPlayersRef.current[id];
        setPressedKeys((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        return;
      }
      heldPlayersRef.current[id] = playSustainedNote(instrument, midi, masterVolume);
      if (dualVoiceOn) {
        heldPlayersRef.current[`${id}-dual`] = playSustainedNote(dualInstrument, midi, masterVolume * 0.75);
      }
      setPressedKeys((prev) => ({ ...prev, [id]: true }));
      return;
    }

    if (selectedSample) {
      playSampleNote(selectedSample.uri, midi, masterVolume);
    } else {
      playInstrumentNote(instrument, midi, masterVolume);
      if (dualVoiceOn) {
        playInstrumentNote(dualInstrument, midi, masterVolume * 0.75);
      }
    }

    setPressedKeys((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setPressedKeys((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 150);

    if (recordingRef.current) {
      const beatMs = 60000 / bpm;
      const startBeat = (Date.now() - recordingRef.current.startedAt) / beatMs;
      recordingRef.current.notes.push({
        note: midiToNoteName(midi),
        start: startBeat,
        duration: 0.25,
        velocity: 100,
      });
    }
  };

  const addTake = (notes: RecordedNote[], label: string, icon: Take['icon']) => {
    const voice: Instrument | string = selectedSample ? selectedSample.uri : instrument;
    const voiceLabel = selectedSample ? selectedSample.name : instrument.charAt(0).toUpperCase() + instrument.slice(1);
    const id = `take-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setTakes((prev) => [...prev, { id, name: `${label} · ${voiceLabel}`, voice, icon, notes, muted: false, volume: 0.85 }]);
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      const notes = recordingRef.current?.notes ?? [];
      recordingRef.current = null;
      if (notes.length > 0) {
        addTake(notes, 'Recorded', 'mic');
      }
      return;
    }
    stopPreview();
    stopMix();
    recordingRef.current = { startedAt: Date.now(), notes: [] };
    setIsRecording(true);
  };

  const addPresetTake = (preset: BeatPreset) => {
    const midi = (selectedSample ? SAMPLE_REFERENCE_MIDI : REFERENCE_MIDI[instrument]) + octave * 12;
    const noteName = midiToNoteName(midi);
    const notes: RecordedNote[] = preset.hits.map((h) => ({
      note: noteName,
      start: h.beat,
      duration: h.duration,
      velocity: h.velocity,
    }));
    addTake(notes, preset.label, 'musical-notes');
  };

  const previewTake = (take: Take) => {
    if (previewingTakeId === take.id) {
      stopPreview();
      return;
    }
    stopPreview();
    stopMix();
    const { cancel, totalMs } = playPattern(take.voice, take.notes, bpm);
    previewCancelRef.current = cancel;
    setPreviewingTakeId(take.id);
    setTimeout(() => {
      setPreviewingTakeId((current) => (current === take.id ? null : current));
    }, totalMs + 200);
  };

  const toggleMuteTake = (id: string) => {
    setTakes((prev) => prev.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t)));
  };

  const adjustTakeVolume = (id: string, delta: number) => {
    setTakes((prev) =>
      prev.map((t) => (t.id === id ? { ...t, volume: Math.max(0, Math.min(1, +(t.volume + delta).toFixed(2))) } : t))
    );
  };

  const deleteTake = (id: string) => {
    if (previewingTakeId === id) stopPreview();
    setTakes((prev) => prev.filter((t) => t.id !== id));
  };

  const playMix = () => {
    if (isMixPlaying) {
      stopMix();
      return;
    }
    const audible = takes.filter((t) => !t.muted && t.notes.length > 0);
    if (audible.length === 0) return;
    stopPreview();

    const cancels: Array<() => void> = [];
    let maxTotal = 0;
    audible.forEach((take) => {
      const scaledNotes = take.notes.map((n) => ({ ...n, velocity: Math.round((n.velocity ?? 100) * take.volume) }));
      const { cancel, totalMs } = playPattern(take.voice, scaledNotes, bpm);
      cancels.push(cancel);
      maxTotal = Math.max(maxTotal, totalMs);
    });

    const cancelAll = () => cancels.forEach((c) => c());
    mixCancelRef.current = cancelAll;
    setIsMixPlaying(true);
    setTimeout(() => {
      if (mixCancelRef.current === cancelAll) {
        mixCancelRef.current = null;
        setIsMixPlaying(false);
      }
    }, maxTotal + 200);
  };

  const handleClearAllTakes = () => {
    stopPreview();
    stopMix();
    setTakes([]);
  };

  const handleSaveAllTakes = async () => {
    if (!currentProject || takes.length === 0) {
      return;
    }
    try {
      const created = await Promise.all(
        takes.map((take) =>
          trackService.create(currentProject.id, {
            name: take.name,
            type: 'instrument',
            midi_data: take.notes,
            volume: take.volume,
            pan: 0,
          })
        )
      );
      created.forEach((track) => addTrack(track));
      Alert.alert('Saved', `${created.length} take${created.length === 1 ? '' : 's'} added to "${currentProject.name}".`);
      setTakes([]);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to save the mix as tracks.');
    }
  };

  const handleLayout = (e: LayoutChangeEvent) => {
    setKeyboardWidth(e.nativeEvent.layout.width);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: 24 + insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        {navigation?.canGoBack?.() && (
          <BackButton onPress={() => navigation.goBack()} style={styles.backButton} />
        )}
        <Text style={styles.title}>Instruments</Text>
        <Text style={styles.subtitle}>Play, layer takes, and mix them into a song</Text>
      </View>

      <View style={styles.controlPanel}>
        <View style={styles.lcd}>
          <Text style={styles.lcdText} numberOfLines={1}>
            {(selectedSample ? selectedSample.name : instrument.toUpperCase())}
            {dualVoiceOn ? ` + ${dualInstrument.toUpperCase()}` : ''}
          </Text>
          <View style={styles.lcdMetaRow}>
            <Text style={styles.lcdMeta}>OCT {octave > 0 ? `+${octave}` : octave}</Text>
            <Text style={styles.lcdMeta}>TR {transpose > 0 ? `+${transpose}` : transpose}</Text>
            <Text style={styles.lcdMeta}>{bpm} BPM</Text>
            <Text style={styles.lcdMeta}>VOL {Math.round(masterVolume * 100)}</Text>
          </View>
        </View>

        <View style={styles.panelRow}>
          <View style={styles.panelStepper}>
            <Text style={styles.panelStepperLabel}>Tempo</Text>
            <View style={styles.panelStepperControls}>
              <TouchableOpacity style={styles.panelStepperBtn} onPress={() => setBpm((b) => Math.max(40, b - 5))}>
                <Ionicons name="remove" size={13} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.panelStepperValue}>{bpm}</Text>
              <TouchableOpacity style={styles.panelStepperBtn} onPress={() => setBpm((b) => Math.min(240, b + 5))}>
                <Ionicons name="add" size={13} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.panelStepper}>
            <Text style={styles.panelStepperLabel}>Transpose</Text>
            <View style={styles.panelStepperControls}>
              <TouchableOpacity
                style={styles.panelStepperBtn}
                onPress={() => setTranspose((t) => Math.max(-12, t - 1))}
              >
                <Ionicons name="remove" size={13} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.panelStepperValue}>{transpose}</Text>
              <TouchableOpacity
                style={styles.panelStepperBtn}
                onPress={() => setTranspose((t) => Math.min(12, t + 1))}
              >
                <Ionicons name="add" size={13} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.panelStepper}>
            <Text style={styles.panelStepperLabel}>Volume</Text>
            <View style={styles.panelStepperControls}>
              <TouchableOpacity
                style={styles.panelStepperBtn}
                onPress={() => setMasterVolume((v) => Math.max(0, +(v - 0.1).toFixed(1)))}
              >
                <Ionicons name="remove" size={13} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.panelStepperValue}>{Math.round(masterVolume * 100)}</Text>
              <TouchableOpacity
                style={styles.panelStepperBtn}
                onPress={() => setMasterVolume((v) => Math.min(1, +(v + 0.1).toFixed(1)))}
              >
                <Ionicons name="add" size={13} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.panelToggleRow}>
          <TouchableOpacity
            style={[styles.panelToggle, metronomeOn && styles.panelToggleActive]}
            onPress={() => setMetronomeOn((v) => !v)}
          >
            <View style={[styles.panelToggleLight, metronomeOn && styles.panelToggleLightActive]} />
            <Ionicons name="timer-outline" size={15} color={metronomeOn ? accent : colors.textSecondary} />
            <Text style={[styles.panelToggleText, metronomeOn && { color: accent }]}>Metronome</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.panelToggle, sustainOn && styles.panelToggleActive]}
            onPress={() => setSustainOn((v) => !v)}
          >
            <View style={[styles.panelToggleLight, sustainOn && styles.panelToggleLightActive]} />
            <Ionicons name="infinite-outline" size={15} color={sustainOn ? accent : colors.textSecondary} />
            <Text style={[styles.panelToggleText, sustainOn && { color: accent }]}>Sustain</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.panelToggle, dualVoiceOn && styles.panelToggleActive]}
            onPress={() => setDualVoiceOn((v) => !v)}
          >
            <View style={[styles.panelToggleLight, dualVoiceOn && styles.panelToggleLightActive]} />
            <Ionicons name="layers-outline" size={15} color={dualVoiceOn ? accent : colors.textSecondary} />
            <Text style={[styles.panelToggleText, dualVoiceOn && { color: accent }]}>Dual</Text>
          </TouchableOpacity>
        </View>

        {dualVoiceOn && (
          <View style={styles.dualPickerRow}>
            <Text style={styles.dualPickerLabel}>Layer:</Text>
            {INSTRUMENTS.filter((i) => i.id !== instrument).map((inst) => (
              <TouchableOpacity
                key={inst.id}
                style={[styles.dualChip, dualInstrument === inst.id && { borderColor: accent }]}
                onPress={() => setDualInstrument(inst.id)}
              >
                <Text style={[styles.dualChipText, dualInstrument === inst.id && { color: accent }]}>
                  {inst.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.pickerRow}>
        {INSTRUMENTS.map((inst) => {
          const active = !selectedSample && instrument === inst.id;
          return (
            <TouchableOpacity
              key={inst.id}
              style={[
                styles.chip,
                active && { backgroundColor: trackTypeColors.instrument.tint, borderColor: accent },
              ]}
              onPress={() => selectInstrument(inst.id)}
            >
              <Text style={[styles.chipText, active && { color: accent }]}>{inst.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {samples.length > 0 && (
        <View style={styles.sampleSection}>
          <Text style={styles.sampleLabel}>Your Sounds</Text>
          <View style={styles.pickerRow}>
            {samples.map((sample) => {
              const active = selectedSampleId === sample.id;
              return (
                <TouchableOpacity
                  key={sample.id}
                  style={[
                    styles.chip,
                    styles.sampleChip,
                    active && { backgroundColor: trackTypeColors.instrument.tint, borderColor: accent },
                  ]}
                  onPress={() => selectSample(sample.id)}
                >
                  <Ionicons
                    name={sample.source === 'recording' ? 'mic' : 'albums'}
                    size={13}
                    color={active ? accent : colors.textSecondary}
                  />
                  <Text style={[styles.chipText, active && { color: accent }]} numberOfLines={1}>
                    {sample.name}
                  </Text>
                  <TouchableOpacity
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => handleRemoveSample(sample.id)}
                  >
                    <Ionicons name="close" size={13} color={colors.textTertiary} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.octaveRow}>
        <TouchableOpacity
          style={[styles.octaveButton, octave <= -1 && styles.octaveButtonDisabled]}
          onPress={() => setOctave((o) => Math.max(-1, o - 1))}
          disabled={octave <= -1}
        >
          <Text style={styles.octaveButtonText}>◀</Text>
        </TouchableOpacity>
        <Text style={styles.octaveLabel}>
          Octave {octave === 0 ? '(default)' : octave > 0 ? `+${octave}` : octave}
        </Text>
        <TouchableOpacity
          style={[styles.octaveButton, octave >= 1 && styles.octaveButtonDisabled]}
          onPress={() => setOctave((o) => Math.min(1, o + 1))}
          disabled={octave >= 1}
        >
          <Text style={styles.octaveButtonText}>▶</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.beatSection}>
        <View style={styles.beatSectionHeader}>
          <Text style={styles.sectionLabel}>Quick Beats</Text>
          <TouchableOpacity
            style={[styles.recordButton, isRecording && styles.recordButtonActive]}
            onPress={toggleRecording}
          >
            <Ionicons
              name={isRecording ? 'stop' : 'radio-button-on'}
              size={14}
              color={isRecording ? '#FFFFFF' : colors.danger}
            />
            <Text style={[styles.recordButtonText, !isRecording && { color: colors.textPrimary }]}>
              {isRecording ? 'Stop' : 'Record'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.pickerRow}>
          {BEAT_PRESETS.map((preset) => (
            <TouchableOpacity key={preset.id} style={styles.chip} onPress={() => addPresetTake(preset)}>
              <Text style={styles.chipText}>{preset.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {isRecording && (
          <Text style={styles.recordHint}>Recording — play the keys to tap out a beat, then Stop.</Text>
        )}
      </View>

      <View style={styles.mixSection}>
        <View style={styles.beatSectionHeader}>
          <Text style={styles.sectionLabel}>
            Your Mix {takes.length > 0 ? `(${takes.length})` : ''}
          </Text>
          {takes.length > 0 && (
            <View style={styles.mixTransport}>
              <TouchableOpacity style={styles.mixTransportButton} onPress={playMix}>
                <Ionicons name={isMixPlaying ? 'stop' : 'play'} size={15} color={accent} />
              </TouchableOpacity>
              {currentProject && (
                <TouchableOpacity style={styles.mixTransportButton} onPress={handleSaveAllTakes}>
                  <Ionicons name="save-outline" size={15} color={accent} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.mixTransportButton} onPress={handleClearAllTakes}>
                <Ionicons name="trash-outline" size={15} color={colors.danger} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {takes.length === 0 ? (
          <Text style={styles.mixEmptyHint}>
            Record a take or tap a Quick Beat above to start layering a song.
          </Text>
        ) : (
          <ScrollView style={styles.takesList} nestedScrollEnabled>
            {takes.map((take) => (
              <View key={take.id} style={[styles.takeCard, take.muted && styles.takeCardMuted]}>
                <View style={styles.takeHeader}>
                  <Ionicons name={take.icon} size={13} color={accent} />
                  <Text style={styles.takeName} numberOfLines={1}>
                    {take.name}
                  </Text>
                  <TouchableOpacity onPress={() => deleteTake(take.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="close" size={15} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.takeControls}>
                  <TouchableOpacity style={styles.takeIconButton} onPress={() => previewTake(take)}>
                    <Ionicons name={previewingTakeId === take.id ? 'stop' : 'play'} size={13} color={accent} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.takeIconButton} onPress={() => toggleMuteTake(take.id)}>
                    <Ionicons
                      name={take.muted ? 'volume-mute' : 'volume-high'}
                      size={13}
                      color={take.muted ? colors.textTertiary : colors.textPrimary}
                    />
                  </TouchableOpacity>
                  <View style={styles.volumeStepper}>
                    <TouchableOpacity onPress={() => adjustTakeVolume(take.id, -0.1)}>
                      <Text style={styles.volumeAdjust}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.volumeText}>{Math.round(take.volume * 100)}%</Text>
                    <TouchableOpacity onPress={() => adjustTakeVolume(take.id, 0.1)}>
                      <Text style={styles.volumeAdjust}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {takes.length > 0 && !currentProject && (
          <Text style={styles.mixEmptyHint}>Open a project from Home to save this mix as tracks.</Text>
        )}
      </View>

      <View style={styles.keyboardWrap}>
        <View style={styles.piano} onLayout={handleLayout}>
          <View style={styles.whiteRow}>
            {WHITE_KEYS.map((key, index) => {
              const id = `w${index}`;
              const pressed = !!pressedKeys[id];
              return (
                <TouchableOpacity
                  key={id}
                  style={[
                    styles.whiteKey,
                    index > 0 && styles.whiteKeyBorder,
                    pressed && styles.whiteKeyPressed,
                  ]}
                  onPress={() => playKey(key.offset, id)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.whiteKeyLabel}>{key.label}</Text>
                  {pressed && <View style={[styles.pressIndicator, { backgroundColor: accent }]} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {keyboardWidth > 0 &&
            BLACK_KEYS.map((key, index) => {
              const id = `b${index}`;
              const pressed = !!pressedKeys[id];
              return (
                <TouchableOpacity
                  key={id}
                  style={[
                    styles.blackKey,
                    {
                      left: key.boundary * whiteKeyWidth - blackKeyWidth / 2,
                      width: blackKeyWidth,
                    },
                    pressed && styles.blackKeyPressed,
                  ]}
                  onPress={() => playKey(key.offset, id)}
                  activeOpacity={0.85}
                >
                  {pressed && <View style={[styles.pressIndicator, { backgroundColor: accent }]} />}
                </TouchableOpacity>
              );
            })}
        </View>
      </View>

      <Text style={styles.hint}>
        {selectedSample
          ? `Playing "${selectedSample.name}" pitched to each key.`
          : 'Each instrument is a real synthesized sound — a Karplus-Strong plucked string for guitar, ' +
            'additive harmonics for piano/strings, and a sawtooth series for synth.'}
      </Text>
      </ScrollView>
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
      padding: 20,
      paddingTop: 60,
    },
    backButton: {
      marginBottom: 12,
      alignSelf: 'flex-start',
    },
    title: {
      color: colors.textPrimary,
      fontSize: 28,
      fontWeight: 'bold',
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 14,
      marginTop: 4,
    },
    controlPanel: {
      backgroundColor: '#15130F',
      borderRadius: 18,
      marginHorizontal: 20,
      marginBottom: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: '#2A261C',
    },
    lcd: {
      backgroundColor: '#0A1512',
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: '#1E3B33',
    },
    lcdText: {
      color: '#5FE0C7',
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    lcdMetaRow: {
      flexDirection: 'row',
      gap: 14,
      flexWrap: 'wrap',
    },
    lcdMeta: {
      color: '#3FA894',
      fontSize: 11,
      fontWeight: '600',
    },
    panelRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    panelStepper: {
      flex: 1,
      backgroundColor: '#231F17',
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 8,
      alignItems: 'center',
    },
    panelStepperLabel: {
      color: '#8A8271',
      fontSize: 9.5,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 6,
    },
    panelStepperControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    panelStepperBtn: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: '#332C1F',
      alignItems: 'center',
      justifyContent: 'center',
    },
    panelStepperValue: {
      color: '#F5EFE6',
      fontSize: 13,
      fontWeight: '700',
      minWidth: 30,
      textAlign: 'center',
    },
    panelToggleRow: {
      flexDirection: 'row',
      gap: 8,
    },
    panelToggle: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: '#231F17',
      borderRadius: 12,
      paddingVertical: 10,
    },
    panelToggleActive: {
      backgroundColor: 'rgba(217, 142, 74, 0.16)',
    },
    panelToggleLight: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#4A4232',
      position: 'absolute',
      top: 6,
      right: 8,
    },
    panelToggleLightActive: {
      backgroundColor: colors.danger,
    },
    panelToggleText: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
    },
    dualPickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    dualPickerLabel: {
      color: '#8A8271',
      fontSize: 11,
      fontWeight: '700',
    },
    dualChip: {
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: '#231F17',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    dualChipText: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
    },
    pickerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 20,
      marginBottom: 16,
    },
    chip: {
      paddingVertical: 9,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    chipText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      maxWidth: 110,
    },
    sampleSection: {
      marginBottom: 4,
    },
    sampleLabel: {
      color: colors.textTertiary,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      paddingHorizontal: 20,
      marginBottom: 8,
    },
    sampleChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    octaveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      marginBottom: 14,
    },
    octaveButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    octaveButtonDisabled: {
      opacity: 0.35,
    },
    octaveButtonText: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    octaveLabel: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      minWidth: 110,
      textAlign: 'center',
    },
    sectionLabel: {
      color: colors.textTertiary,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    beatSection: {
      marginBottom: 12,
    },
    beatSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      marginBottom: 10,
    },
    recordButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surface,
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 20,
    },
    recordButtonActive: {
      backgroundColor: colors.danger,
    },
    recordButtonText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    recordHint: {
      color: colors.textTertiary,
      fontSize: 11,
      textAlign: 'center',
      paddingHorizontal: 20,
    },
    mixSection: {
      marginBottom: 14,
    },
    mixTransport: {
      flexDirection: 'row',
      gap: 8,
    },
    mixTransportButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mixEmptyHint: {
      color: colors.textTertiary,
      fontSize: 12,
      textAlign: 'center',
      paddingHorizontal: 20,
      lineHeight: 17,
    },
    takesList: {
      maxHeight: 160,
      paddingHorizontal: 20,
    },
    takeCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 10,
      marginBottom: 8,
      gap: 8,
    },
    takeCardMuted: {
      opacity: 0.5,
    },
    takeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    takeName: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '600',
    },
    takeControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    takeIconButton: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    volumeStepper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 13,
      height: 26,
      paddingHorizontal: 10,
    },
    volumeAdjust: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: 'bold',
      paddingHorizontal: 4,
    },
    volumeText: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
    },
    keyboardWrap: {
      // Was `flex: 1` to fill the remaining space of a non-scrolling
      // container; now that the screen scrolls (so nothing gets clipped
      // in landscape), there's no bounded "remaining space" to fill, so
      // the keyboard needs an explicit height instead.
      height: 190,
      paddingHorizontal: 20,
    },
    piano: {
      flex: 1,
      position: 'relative',
      borderRadius: 10,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    whiteRow: {
      flex: 1,
      flexDirection: 'row',
    },
    whiteKey: {
      flex: 1,
      backgroundColor: KEY_WHITE,
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingBottom: 14,
    },
    whiteKeyBorder: {
      borderLeftWidth: 1,
      borderLeftColor: KEY_BORDER,
    },
    whiteKeyPressed: {
      backgroundColor: KEY_WHITE_PRESSED,
    },
    whiteKeyLabel: {
      color: '#3A342A',
      fontSize: 13,
      fontWeight: '700',
    },
    blackKey: {
      position: 'absolute',
      top: 0,
      height: '60%',
      backgroundColor: KEY_BLACK,
      borderBottomLeftRadius: 4,
      borderBottomRightRadius: 4,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: 8,
      zIndex: 2,
      elevation: 4,
    },
    blackKeyPressed: {
      backgroundColor: KEY_BLACK_PRESSED,
    },
    pressIndicator: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    hint: {
      color: colors.textTertiary,
      fontSize: 11,
      textAlign: 'center',
      padding: 20,
      lineHeight: 16,
    },
  });
