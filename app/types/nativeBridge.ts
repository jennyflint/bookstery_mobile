import type { PluginListenerHandle } from '@capacitor/core';

export interface NativeScanDirectoryOptions {
  /** `content://` tree URI or a filesystem path (`/storage/emulated/0/...`, `file://...`). */
  uriOrPath: string;
  /** Extensions to match, with or without the leading dot (e.g. `.fb2.zip`). */
  extensions: string[];
  /** Directory levels to descend below the root; `0` scans the root only. Defaults to 24. */
  maxDepth?: number;
}

export interface NativeScannedFile {
  uri: string;
  /** Filesystem path when it can be derived, otherwise an empty string. */
  path: string;
  name: string;
  /** Matched extension without the leading dot. */
  extension: string;
  size: number;
  lastModified: number;
}

export interface NativeScanDirectoryResult {
  files: NativeScannedFile[];
}

export interface NativeResolveStreamableOptions {
  uriOrPath: string;
}

export interface NativeResolveStreamableResult {
  /** Absolute local path; pass it to `Capacitor.convertFileSrc()` to get a fetchable URL. */
  path: string;
  size: number;
  cached: boolean;
}

export interface NativeCopyToAppStorageOptions {
  uriOrPath: string;
  fileName: string;
  /** Directory inside the app files dir. Defaults to `books`. */
  destDir?: string;
}

export interface NativeCopyToAppStorageResult {
  /** SHA-256 of the file's Base64 text (the library's historical id scheme). */
  hash: string;
  size: number;
  path: string;
  /** Path relative to the app files dir (`Directory.Data`). */
  relativePath: string;
}

export interface NativePdfThumbnailOptions {
  uriOrPath: string;
  bookId: string;
  maxWidth?: number;
}

export interface NativePdfThumbnailResult {
  path: string;
  width: number;
  height: number;
}

export interface NativeStoragePermissionStatus {
  granted: boolean;
  allFilesAccessRequired: boolean;
  requested: boolean;
  sdkVersion: number;
}

export interface NativeVolumeKeyEvent {
  direction: 'up' | 'down';
}

export interface NativeScanDownloadsOptions {
  extensions?: string[];
  maxDepth?: number;
}

export interface NativeReaderBridgePlugin {
  scanDirectory(options: NativeScanDirectoryOptions): Promise<NativeScanDirectoryResult>;
  scanDownloads?(options?: NativeScanDownloadsOptions): Promise<NativeScanDirectoryResult>;
  resolveStreamableUrl(
    options: NativeResolveStreamableOptions,
  ): Promise<NativeResolveStreamableResult>;
  copyToAppStorage(options: NativeCopyToAppStorageOptions): Promise<NativeCopyToAppStorageResult>;
  generatePdfThumbnail(options: NativePdfThumbnailOptions): Promise<NativePdfThumbnailResult>;
  checkStoragePermission(): Promise<NativeStoragePermissionStatus>;
  requestStoragePermission(options?: { uri?: string }): Promise<NativeStoragePermissionStatus>;
  setVolumeInterception(options: { enabled: boolean }): Promise<{ enabled: boolean }>;
  isInterceptionEnabled(): Promise<{ enabled: boolean }>;
  exitApp(): Promise<void>;
  addListener(
    eventName: 'volumeKeyPressed',
    listenerFunc: (event: NativeVolumeKeyEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'backButtonPressed',
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}
