import { create } from 'zustand';

export interface CustomSample {
  id: string;
  name: string;
  uri: string;
  source: 'recording' | 'stem';
}

interface SampleState {
  samples: CustomSample[];
  addSample: (sample: CustomSample) => void;
  removeSample: (id: string) => void;
}

// Recorded clips (Harmony tab) and split stems can be sent here so they show
// up as playable, pitch-shiftable sounds on the Instrument keyboard —
// in-memory only for now, so it resets on app restart (the recording/stem
// files themselves live in cache/remote storage, not anywhere durable this
// store could safely point to across sessions).
export const useSampleStore = create<SampleState>((set) => ({
  samples: [],

  addSample: (sample) =>
    set((state) => ({
      samples: [...state.samples.filter((s) => s.id !== sample.id), sample],
    })),

  removeSample: (id) =>
    set((state) => ({
      samples: state.samples.filter((s) => s.id !== id),
    })),
}));
