import { create } from 'zustand';

interface Track {
  id: number;
  name: string;
  type: 'audio' | 'midi' | 'instrument';
  audio_url?: string;
  audio_playback_url?: string | null;
  waveform_peaks?: number[] | null;
  midi_data?: any;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  favorite?: boolean;
  duration_seconds?: number | null;
  effects?: any[];
}

interface Project {
  id: number;
  name: string;
  bpm: number;
  key: string;
  time_signature: string;
  genre?: string | null;
  status?: 'active' | 'completed' | 'archived';
  is_public?: boolean;
  due_date?: string | null;
  tracks: Track[];
  created_at?: string;
  updated_at?: string;
}

interface ProjectState {
  currentProject: Project | null;
  projects: Project[];
  isPlaying: boolean;
  currentTime: number;
  selectedTrackId: number | null;
  
  setCurrentProject: (project: Project) => void;
  setProjects: (projects: Project[]) => void;
  addTrack: (track: Track) => void;
  updateTrack: (trackId: number, data: Partial<Track>, projectId?: number) => void;
  removeTrack: (trackId: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setSelectedTrackId: (id: number | null) => void;
  updateProjectSettings: (settings: Partial<Project>) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  projects: [],
  isPlaying: false,
  currentTime: 0,
  selectedTrackId: null,

  setCurrentProject: (project) => set({ currentProject: project }),
  
  setProjects: (projects) => set({ projects }),
  
  addTrack: (track) => set((state) => ({
    currentProject: state.currentProject
      ? { ...state.currentProject, tracks: [...state.currentProject.tracks, track] }
      : null,
  })),
  
  // Also updates the matching entry in `projects` (not just `currentProject`)
  // so a later setCurrentProject(fromProjectsList) — as the Library and
  // Projects screens do — doesn't silently revert this change, the same
  // staleness bug already fixed for addTrack.
  updateTrack: (trackId, data) => set((state) => {
    const applyToProject = <P extends Project>(project: P): P => ({
      ...project,
      tracks: project.tracks.map((track) => (track.id === trackId ? { ...track, ...data } : track)),
    });
    return {
      currentProject: state.currentProject ? applyToProject(state.currentProject) : null,
      projects: state.projects.map((project) =>
        project.tracks.some((t) => t.id === trackId) ? applyToProject(project) : project
      ),
    };
  }),
  
  removeTrack: (trackId) => set((state) => ({
    currentProject: state.currentProject
      ? {
          ...state.currentProject,
          tracks: state.currentProject.tracks.filter((track) => track.id !== trackId),
        }
      : null,
  })),
  
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  
  setCurrentTime: (time) => set({ currentTime: time }),
  
  setSelectedTrackId: (id) => set({ selectedTrackId: id }),
  
  // Same staleness fix as updateTrack — also applies to the matching entry
  // in `projects`, not just `currentProject`.
  updateProjectSettings: (settings) => set((state) => ({
    currentProject: state.currentProject
      ? { ...state.currentProject, ...settings }
      : null,
    projects: state.projects.map((project) =>
      project.id === state.currentProject?.id ? { ...project, ...settings } : project
    ),
  })),
}));
