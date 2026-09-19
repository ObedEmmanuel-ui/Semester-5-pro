import { useCallback } from 'react';
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
} from 'expo-audio';

const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

/**
 * Wraps expo-audio's recorder hooks with the start/stop shape the screens use.
 * `meterLevel` is in dBFS (roughly -160 silence to 0 clipping) — handy for a
 * live input-level indicator while recording.
 */
export function useRecorder() {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, 100);

  const startRecording = useCallback(async () => {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      throw new Error('Microphone permission is required to record audio.');
    }

    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }, [recorder]);

  const stopRecording = useCallback(async (): Promise<string> => {
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });

    if (!recorder.uri) {
      throw new Error('Recording finished but no audio file was produced.');
    }
    return recorder.uri;
  }, [recorder]);

  return {
    isRecording: state.isRecording,
    durationMillis: state.durationMillis ?? 0,
    meterLevel: state.metering ?? -160,
    startRecording,
    stopRecording,
  };
}
