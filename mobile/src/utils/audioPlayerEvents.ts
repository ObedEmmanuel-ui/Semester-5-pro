import type { AudioPlayer } from 'expo-audio';

/**
 * expo-audio's AudioPlayer genuinely has `addListener('playbackStatusUpdate', ...)`
 * at runtime — it's inherited from expo-modules-core's SharedObject/EventEmitter,
 * and is documented public API. But in this project's node_modules layout,
 * expo-audio's own .d.ts can't resolve expo-modules-core via plain module
 * resolution, so TypeScript silently loses that inherited method's typing
 * (skipLibCheck masks the underlying resolution failure). Asserted here, in
 * one place, rather than at every call site.
 *
 * Registers a one-shot callback for when a player finishes its current
 * playback — the correct way to know audio has ended, instead of guessing a
 * duration and using a timer (which breaks the moment the guess is wrong).
 */
export function onPlaybackFinished(player: AudioPlayer, callback: () => void): { remove: () => void } {
  const withListener = player as unknown as {
    addListener: (
      event: 'playbackStatusUpdate',
      listener: (status: { didJustFinish: boolean }) => void
    ) => { remove: () => void };
  };
  return withListener.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish) {
      callback();
    }
  });
}

/**
 * Same underlying event as onPlaybackFinished, but surfaces the running
 * position/duration/playing state instead — what a seek bar needs. Kept as
 * a separate helper rather than widening onPlaybackFinished's signature,
 * since most callers only care about the finish event.
 */
export function onPlaybackStatus(
  player: AudioPlayer,
  callback: (status: { currentTime: number; duration: number; playing: boolean; didJustFinish: boolean }) => void
): { remove: () => void } {
  const withListener = player as unknown as {
    addListener: (
      event: 'playbackStatusUpdate',
      listener: (status: { currentTime: number; duration: number; playing: boolean; didJustFinish: boolean }) => void
    ) => { remove: () => void };
  };
  return withListener.addListener('playbackStatusUpdate', callback);
}
