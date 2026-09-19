import axios from 'axios';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// A physical phone running Expo Go can't reach "localhost" (that's the phone
// itself), so we derive the dev machine's LAN IP from the same host Expo used
// to serve the JS bundle — it's already reachable, since the app just loaded
// from it. Falls back to a fixed IP for standalone/production builds where
// hostUri isn't available.
function resolveApiUrl(): string {
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  const devHost = hostUri?.split(':')?.[0];

  if (__DEV__ && devHost) {
    return `http://${devHost}:8000/api`;
  }

  return 'http://172.26.110.130:8000/api';
}

const API_URL = resolveApiUrl();

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('auth_token');
      // Navigate to login screen
    }
    return Promise.reject(error);
  }
);

export const authService = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    if (response.data.token) {
      await AsyncStorage.setItem('auth_token', response.data.token);
    }
    return response.data;
  },

  register: async (name: string, email: string, password: string, password_confirmation: string) => {
    const response = await api.post('/auth/register', { 
      name, 
      email, 
      password, 
      password_confirmation 
    });
    if (response.data.token) {
      await AsyncStorage.setItem('auth_token', response.data.token);
    }
    return response.data;
  },

  loginWithGoogle: async (idToken: string) => {
    const response = await api.post('/auth/google', { id_token: idToken });
    if (response.data.token) {
      await AsyncStorage.setItem('auth_token', response.data.token);
    }
    return response.data;
  },

  logout: async () => {
    await api.post('/auth/logout');
    await AsyncStorage.removeItem('auth_token');
  },

  forgotPassword: async (email: string) => {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },

  resetPassword: async (params: {
    email: string;
    code: string;
    password: string;
    password_confirmation: string;
  }) => {
    const response = await api.post('/auth/reset-password', params);
    if (response.data.token) {
      await AsyncStorage.setItem('auth_token', response.data.token);
    }
    return response.data;
  },

  getCurrentUser: async () => {
    const response = await api.get('/auth/user');
    return response.data;
  },

  updateProfile: async (name: string) => {
    const response = await api.put('/auth/profile', { name });
    return response.data;
  },

  uploadAvatar: async (file: { uri: string; name: string; type: string }) => {
    const formData = new FormData();
    formData.append('avatar', file as any);
    const response = await api.post('/auth/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};

export const projectService = {
  list: async () => {
    const response = await api.get('/projects');
    return response.data;
  },

  create: async (data: { name: string; bpm?: number; key?: string; time_signature?: string }) => {
    const response = await api.post('/projects', data);
    return response.data;
  },

  get: async (id: number) => {
    const response = await api.get(`/projects/${id}`);
    return response.data;
  },

  update: async (id: number, data: any) => {
    const response = await api.put(`/projects/${id}`, data);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await api.delete(`/projects/${id}`);
    return response.data;
  },

  duplicate: async (id: number) => {
    const response = await api.post(`/projects/${id}/duplicate`);
    return response.data;
  },

  export: async (id: number) => {
    // Re-synthesizing every instrument/midi track plus mixing any audio
    // tracks is as slow as the other heavy audio jobs.
    const response = await api.post(`/projects/${id}/export`, {}, { timeout: 1800000 });
    return response.data;
  },
};

export const trackService = {
  create: async (projectId: number, data: any) => {
    const response = await api.post(`/projects/${projectId}/tracks`, data);
    return response.data;
  },

  update: async (trackId: number, data: any) => {
    const response = await api.put(`/tracks/${trackId}`, data);
    return response.data;
  },

  delete: async (trackId: number) => {
    const response = await api.delete(`/tracks/${trackId}`);
    return response.data;
  },

  uploadAudio: async (trackId: number, audioFile: any) => {
    const formData = new FormData();
    formData.append('audio_file', audioFile);

    const response = await api.post(`/tracks/${trackId}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

export const aiService = {
  generateMidi: async (params: { prompt: string; duration?: number; key?: string; scale?: string }) => {
    const response = await api.post('/ai/generate-midi', params);
    return response.data;
  },

  generateInstrument: async (params: {
    instrument: 'piano' | 'bass' | 'guitar' | 'synth' | 'strings';
    bpm?: number;
    key?: string;
    scale?: string;
    duration?: number;
  }) => {
    const response = await api.post('/ai/generate-instrument', params);
    return response.data;
  },

  suggestHarmony: async (audioFile: any, context?: string) => {
    const formData = new FormData();
    formData.append('audio_file', audioFile);
    if (context) {
      formData.append('context', context);
    }

    const response = await api.post('/ai/suggest-harmony', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  generateDrums: async (style: string, bpm: number, bars?: number) => {
    const response = await api.post('/ai/generate-drums', { style, bpm, bars });
    return response.data;
  },

  analyzeAudio: async (audioFile: any) => {
    const formData = new FormData();
    formData.append('audio_file', audioFile);

    const response = await api.post('/ai/analyze-audio', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  generateLyrics: async (params: { topic: string; mood?: string; genre?: string }) => {
    const response = await api.post('/ai/generate-lyrics', params);
    return response.data;
  },

  generateSong: async (params: { lyrics: string }) => {
    const response = await api.post('/ai/generate-song', params);
    return response.data;
  },

  generateSongAudio: async (params: { melody: any[]; drum_pattern: any; bpm: number }) => {
    // Word-by-word TTS + per-word pitch/time fitting for a full song is as
    // slow as stem separation — the default axios timeout would abort it.
    const response = await api.post('/ai/generate-song-audio', params, { timeout: 1800000 });
    return response.data;
  },
};

export const stemService = {
  separate: async (audioFile: any, stems?: string[]) => {
    const formData = new FormData();
    formData.append('audio_file', audioFile);
    if (stems) {
      stems.forEach(stem => formData.append('stems[]', stem));
    }

    const response = await api.post('/stems/separate', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  checkStatus: async (jobId: string) => {
    const response = await api.get(`/stems/${jobId}/status`);
    return response.data;
  },

  download: async (jobId: string) => {
    const response = await api.get(`/stems/${jobId}/download`);
    return response.data;
  },

  addAsTrack: async (projectId: number, data: { name: string; job_id: string; stem_name: string }) => {
    const response = await api.post(`/projects/${projectId}/tracks/from-stem`, data);
    return response.data;
  },

  separateFromTrack: async (trackId: number, stems?: string[]) => {
    // Splits a track that's already been uploaded, with no re-upload
    // needed — as slow as the upload-based separation above.
    const response = await api.post(
      `/tracks/${trackId}/separate-stems`,
      stems ? { stems } : {},
      { timeout: 1800000 }
    );
    return response.data;
  },
};

export const notificationService = {
  list: async () => {
    const response = await api.get('/notifications');
    return response.data;
  },

  personal: async () => {
    const response = await api.get('/notifications/personal');
    return response.data;
  },

  unreadCount: async () => {
    const response = await api.get('/notifications/unread-count');
    return response.data;
  },
};

export const voiceMemoService = {
  list: async () => {
    const response = await api.get('/voice-memos');
    return response.data;
  },

  create: async (name: string, audioFile: { uri: string; name: string; type: string }) => {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('audio_file', audioFile as any);
    const response = await api.post('/voice-memos', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  update: async (id: number, data: { name?: string; favorite?: boolean }) => {
    const response = await api.put(`/voice-memos/${id}`, data);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await api.delete(`/voice-memos/${id}`);
    return response.data;
  },
};

export const projectMessageService = {
  list: async (projectId: number) => {
    const response = await api.get(`/projects/${projectId}/messages`);
    return response.data;
  },

  send: async (projectId: number, data: { body?: string; voiceFile?: { uri: string; name: string; type: string } }) => {
    const formData = new FormData();
    if (data.body) formData.append('body', data.body);
    if (data.voiceFile) formData.append('voice_file', data.voiceFile as any);
    const response = await api.post(`/projects/${projectId}/messages`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  delete: async (projectId: number, messageId: number) => {
    const response = await api.delete(`/projects/${projectId}/messages/${messageId}`);
    return response.data;
  },

  askAI: async (projectId: number, message: string) => {
    // Talking to the AI can take a few seconds (it's a real model call),
    // longer than the default timeout would tolerate.
    const response = await api.post(
      `/projects/${projectId}/messages/ai-reply`,
      { message },
      { timeout: 60000 }
    );
    return response.data;
  },
};

export const producerService = {
  list: async (search?: string, page = 1) => {
    const response = await api.get('/producers', { params: { q: search || undefined, page } });
    return response.data;
  },

  show: async (userId: number) => {
    const response = await api.get(`/producers/${userId}`);
    return response.data;
  },

  activity: async () => {
    const response = await api.get('/producers/activity');
    return response.data;
  },

  follow: async (userId: number) => {
    const response = await api.post(`/producers/${userId}/follow`);
    return response.data;
  },

  unfollow: async (userId: number) => {
    const response = await api.delete(`/producers/${userId}/follow`);
    return response.data;
  },

  followers: async (userId: number) => {
    const response = await api.get(`/producers/${userId}/followers`);
    return response.data;
  },

  following: async (userId: number) => {
    const response = await api.get(`/producers/${userId}/following`);
    return response.data;
  },
};

export const projectCommentService = {
  list: async (projectId: number) => {
    const response = await api.get(`/projects/${projectId}/comments`);
    return response.data;
  },

  send: async (projectId: number, body: string) => {
    const response = await api.post(`/projects/${projectId}/comments`, { body });
    return response.data;
  },

  delete: async (projectId: number, commentId: number) => {
    const response = await api.delete(`/projects/${projectId}/comments/${commentId}`);
    return response.data;
  },
};

export default api;
