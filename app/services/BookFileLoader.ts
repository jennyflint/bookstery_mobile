import { Directory, Filesystem } from '@capacitor/filesystem';
import { isNativeReaderBridgeAvailable, fetchBookBytes } from './NativeReaderBridge';

const SANDBOX_DIRECTORIES: Directory[] = [Directory.Data, Directory.Documents];

/** Resolves a stored book path to a `file://` URI, trying the app sandbox first. */
export async function resolveStoredBookUri(filePath: string): Promise<string | null> {
  if (filePath.startsWith('content://') || filePath.startsWith('file://') || filePath.startsWith('/')) {
    return filePath;
  }
  for (const directory of SANDBOX_DIRECTORIES) {
    try {
      const { uri } = await Filesystem.getUri({ path: filePath, directory });
      await Filesystem.stat({ path: filePath, directory });
      return uri;
    } catch {
      // Not in this directory.
    }
  }
  return null;
}

/**
 * Loads a book's bytes through the native bridge (binary fetch, no Base64).
 * Returns null when the bridge is unavailable or the file cannot be found, so callers can
 * fall back to the Filesystem plugin.
 */
export async function loadBookBytesNative(filePath: string): Promise<Uint8Array | null> {
  if (!isNativeReaderBridgeAvailable()) {
    return null;
  }
  try {
    const uri = await resolveStoredBookUri(filePath);
    return uri ? await fetchBookBytes(uri) : null;
  } catch (err) {
    console.warn('[BookFileLoader] Native streaming failed, falling back to Filesystem:', err);
    return null;
  }
}

/** Legacy read through the Filesystem plugin (Base64 over the bridge); used when the native bridge is unavailable. */
export async function readBookViaFilesystem(filePath: string): Promise<Uint8Array | ArrayBuffer | string> {
  let fileRes;
  try {
    fileRes = await Filesystem.readFile({ path: filePath, directory: Directory.Data });
  } catch {
    try {
      fileRes = await Filesystem.readFile({ path: filePath, directory: Directory.Documents });
    } catch {
      fileRes = await Filesystem.readFile({ path: filePath });
    }
  }

  const data = fileRes.data;
  if (typeof data === 'string') {
    const base64Clean = data.includes(',') ? data.split(',')[1] : data;
    const binary = atob(base64Clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(await data.arrayBuffer());
}
