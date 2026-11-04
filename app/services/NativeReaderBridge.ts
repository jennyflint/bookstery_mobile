import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import type { NativeReaderBridgePlugin } from '../types/nativeBridge';

/**
 * Typed handle for the Android `NativeReaderBridge` plugin (see docs/android/).
 * The web implementation lets the app run in a browser during development: native-only
 * operations reject, harmless ones return neutral values.
 */
export const NativeReaderBridge = registerPlugin<NativeReaderBridgePlugin>('NativeReaderBridge', {
  web: () => ({
    async scanDirectory() {
      return { files: [] };
    },
    async resolveStreamableUrl(options: { uriOrPath: string }) {
      return { path: options.uriOrPath, size: 0, cached: false };
    },
    async copyToAppStorage() {
      throw new Error('NativeReaderBridge.copyToAppStorage is only available on Android');
    },
    async generatePdfThumbnail() {
      throw new Error('NativeReaderBridge.generatePdfThumbnail is only available on Android');
    },
    async checkStoragePermission() {
      return { granted: true, allFilesAccessRequired: false, requested: false, sdkVersion: 0 };
    },
    async requestStoragePermission() {
      return { granted: true, allFilesAccessRequired: false, requested: false, sdkVersion: 0 };
    },
    async setVolumeInterception(options: { enabled: boolean }) {
      return { enabled: options.enabled };
    },
    async isInterceptionEnabled() {
      return { enabled: false };
    },
    async exitApp() {
      // In browser/dev mode, exitApp is a no-op
    },
    async addListener() {
      return { remove: async (): Promise<void> => {} };
    },
    async removeAllListeners() {},
  }),
});

/** True only inside the Android app build that ships the native plugin. */
export function isNativeReaderBridgeAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('NativeReaderBridge');
}

/** Turns a local absolute path into a URL the WebView can `fetch()`. */
export function toWebViewUrl(localPath: string): string {
  return Capacitor.convertFileSrc(localPath);
}

/**
 * Reads a book as raw bytes straight from the native file, without a Base64 round trip
 * over the Capacitor bridge.
 */
export async function fetchBookBytes(uriOrPath: string): Promise<Uint8Array> {
  const { path } = await NativeReaderBridge.resolveStreamableUrl({ uriOrPath });
  const response = await fetch(toWebViewUrl(path));
  if (!response.ok) {
    throw new Error(`Failed to stream book (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Cleanly exits the Android application by calling the native plugin `exitApp`,
 * with a fallback to Capacitor's `@capacitor/app` `App.exitApp()`.
 */
export async function exitNativeApp(): Promise<void> {
  if (isNativeReaderBridgeAvailable()) {
    try {
      await NativeReaderBridge.exitApp();
      return;
    } catch (err) {
      console.warn('[NativeReaderBridge] Native exitApp failed, falling back to App.exitApp:', err);
    }
  }

  try {
    await App.exitApp();
  } catch (err) {
    console.warn('[NativeReaderBridge] App.exitApp fallback failed:', err);
  }
}

export const exitApp = exitNativeApp;
