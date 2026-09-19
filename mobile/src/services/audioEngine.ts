import { createAudioPlayer, setIsAudioActiveAsync, type AudioPlayer } from 'expo-audio';

interface Track {
  id: number;
  name: string;
  audio_url?: string;
  audio_playback_url?: string | null;
  volume: number;
  muted: boolean;
}

type AudioPlayerHandle = AudioPlayer;

// One player per track so tracks play back in sync, like a DAW mixer,
// rather than one after another like a playlist.
let players: Record<number, AudioPlayerHandle> = {};

function releaseAllPlayers() {
  Object.values(players).forEach((player) => {
    try {
      player.remove();
    } catch {
      // already removed
    }
  });
  players = {};
}

export const audioEngine = {
  async setupPlayer() {
    await setIsAudioActiveAsync(true);
  },

  async loadProjectTracks(tracks: Track[]) {
    releaseAllPlayers();

    // audio_url is the raw relative storage path ("tracks/xyz.wav") — not
    // a playable URI on its own. audio_playback_url is the same file
    // resolved to an absolute, host-correct URL by the backend.
    tracks
      .filter((track) => !!track.audio_playback_url)
      .forEach((track) => {
        const player = createAudioPlayer(track.audio_playback_url as string);
        player.volume = track.muted ? 0 : track.volume;
        players[track.id] = player;
      });
  },

  async play() {
    Object.values(players).forEach((player) => player.play());
  },

  async pause() {
    Object.values(players).forEach((player) => player.pause());
  },

  async seekTo(seconds: number) {
    Object.values(players).forEach((player) => player.seekTo(seconds));
  },

  setTrackVolume(trackId: number, volume: number) {
    const player = players[trackId];
    if (player) {
      player.volume = volume;
    }
  },

  setTrackMuted(trackId: number, muted: boolean, volume: number) {
    const player = players[trackId];
    if (player) {
      player.volume = muted ? 0 : volume;
    }
  },

  release() {
    releaseAllPlayers();
  },
};
