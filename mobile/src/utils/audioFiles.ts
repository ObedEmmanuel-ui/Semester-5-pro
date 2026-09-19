const AUDIO_EXTENSIONS = [
  'mp3', 'wav', 'wave', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'wma', 'opus', '3gp', 'amr', 'caf',
];

/**
 * DocumentPicker's `type: 'audio/*'` filter is unreliable on Android — some
 * document providers (Google Drive, certain file managers) report audio
 * files under a generic MIME type like application/octet-stream, which
 * that filter then hides entirely, making the picker look broken/empty.
 * So we ask for every file type instead and validate afterward by
 * extension (falling back to the reported MIME type when there's no
 * recognizable extension), giving a clear error instead of silently
 * rejecting a real audio file.
 */
export function isLikelyAudioFile(name: string, mimeType?: string | null): boolean {
  if (mimeType?.startsWith('audio/')) {
    return true;
  }
  const extension = name.split('.').pop()?.toLowerCase();
  return !!extension && AUDIO_EXTENSIONS.includes(extension);
}
