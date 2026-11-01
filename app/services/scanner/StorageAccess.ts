import { registerPlugin } from '@capacitor/core';

export interface StorageAccessStatus {
  allFilesAccessRequired: boolean;
  granted: boolean;
}

export interface StorageAccessPlugin {
  getStatus(): Promise<StorageAccessStatus>;
  openAllFilesAccessSettings(): Promise<void>;
}

/** Native bridge (see docs/android/StorageAccessPlugin.java) for Android 11+ "All files access". */
export const StorageAccess = registerPlugin<StorageAccessPlugin>('StorageAccess');
