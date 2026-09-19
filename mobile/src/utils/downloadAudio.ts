import { Alert } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Downloads a remote audio file into the app's cache, then hands it to the
 * OS share sheet — the standard Expo way to get a file out of the app and
 * onto the device (Save to Files/Music, AirDrop, another app, etc.), since
 * writing directly into public device storage needs extra native
 * permissions this project doesn't otherwise use.
 */
export async function downloadAndShareAudio(
  url: string,
  fileName: string,
  mimeType: string = 'audio/mpeg'
): Promise<void> {
  try {
    const destination = new File(Paths.cache, fileName);
    const file = await File.downloadFileAsync(url, destination, { idempotent: true });

    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('Sharing Unavailable', 'Sharing is not available on this device.');
      return;
    }
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: `Save "${fileName}"` });
  } catch (error) {
    console.error('Failed to download/share audio:', error);
    Alert.alert('Download Failed', 'Failed to download this file. Please try again.');
  }
}

/** Strips characters that aren't safe in a filename, matching the pattern
 * already used for project export filenames. */
export function safeFileName(name: string, extension: string): string {
  const base = name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'audio';
  return `${base}.${extension}`;
}
