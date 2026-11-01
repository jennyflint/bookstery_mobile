import { defineStore } from 'pinia';
import { ScreenControlService } from '../services/ScreenControlService';
import type { ScreenControlSettings, ScreenOrientationMode } from '../types';

export const SETTINGS_STORAGE_KEY = 'bookstery_screen_control_settings';

export const DEFAULT_SCREEN_CONTROL_SETTINGS: ScreenControlSettings = {
  keepScreenAwake: true,
  orientationLock: 'auto',
  applyOrientationOnlyInReader: true,
};

function getStoredSettings(): ScreenControlSettings {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_SCREEN_CONTROL_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ScreenControlSettings>;
      return {
        keepScreenAwake:
          typeof parsed.keepScreenAwake === 'boolean'
            ? parsed.keepScreenAwake
            : DEFAULT_SCREEN_CONTROL_SETTINGS.keepScreenAwake,
        orientationLock:
          parsed.orientationLock === 'portrait' ||
          parsed.orientationLock === 'landscape' ||
          parsed.orientationLock === 'auto'
            ? parsed.orientationLock
            : DEFAULT_SCREEN_CONTROL_SETTINGS.orientationLock,
        applyOrientationOnlyInReader:
          typeof parsed.applyOrientationOnlyInReader === 'boolean'
            ? parsed.applyOrientationOnlyInReader
            : DEFAULT_SCREEN_CONTROL_SETTINGS.applyOrientationOnlyInReader,
      };
    }
  } catch {
    // Fall back to defaults on parsing error
  }
  return { ...DEFAULT_SCREEN_CONTROL_SETTINGS };
}

function persistSettings(settings: ScreenControlSettings): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage quota or security error
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => {
    const initial = getStoredSettings();
    return {
      keepScreenAwake: initial.keepScreenAwake,
      orientationLock: initial.orientationLock as ScreenOrientationMode,
      applyOrientationOnlyInReader: initial.applyOrientationOnlyInReader,
      isReaderActive: false,
    };
  },

  actions: {
    async setKeepScreenAwake(enabled: boolean): Promise<void> {
      this.keepScreenAwake = enabled;
      this.persist();

      // If currently inside the reader, apply immediately
      if (this.isReaderActive) {
        await ScreenControlService.setKeepAwake(enabled);
      }
    },

    async setOrientationLock(mode: ScreenOrientationMode): Promise<void> {
      this.orientationLock = mode;
      this.persist();

      // If scoped only to reader and reader is inactive, ensure orientation is auto
      if (this.applyOrientationOnlyInReader && !this.isReaderActive) {
        await ScreenControlService.applyOrientation('auto');
      } else {
        await ScreenControlService.applyOrientation(mode);
      }
    },

    async setApplyOrientationOnlyInReader(onlyInReader: boolean): Promise<void> {
      this.applyOrientationOnlyInReader = onlyInReader;
      this.persist();

      if (!onlyInReader) {
        // Now applied globally
        await ScreenControlService.applyOrientation(this.orientationLock);
      } else if (!this.isReaderActive) {
        // Revert to auto outside reader
        await ScreenControlService.applyOrientation('auto');
      }
    },

    async enterReader(): Promise<void> {
      this.isReaderActive = true;
      if (this.keepScreenAwake) {
        await ScreenControlService.setKeepAwake(true);
      }
      await ScreenControlService.applyOrientation(this.orientationLock);
    },

    async leaveReader(isTtsPlaying: boolean = false): Promise<void> {
      this.isReaderActive = false;

      // Keep screen awake if TTS is playing in the background
      if (!isTtsPlaying) {
        await ScreenControlService.setKeepAwake(false);
      }

      // Revert orientation if scoped to reader
      if (this.applyOrientationOnlyInReader) {
        await ScreenControlService.applyOrientation('auto');
      }
    },

    async handleAppBackground(): Promise<void> {
      // Release wake lock when app goes to background to preserve battery
      await ScreenControlService.setKeepAwake(false);
    },

    async handleAppForeground(): Promise<void> {
      if (this.isReaderActive) {
        if (this.keepScreenAwake) {
          await ScreenControlService.setKeepAwake(true);
        }
        await ScreenControlService.applyOrientation(this.orientationLock);
      }
    },

    resetToDefault(): void {
      this.keepScreenAwake = DEFAULT_SCREEN_CONTROL_SETTINGS.keepScreenAwake;
      this.orientationLock = DEFAULT_SCREEN_CONTROL_SETTINGS.orientationLock;
      this.applyOrientationOnlyInReader =
        DEFAULT_SCREEN_CONTROL_SETTINGS.applyOrientationOnlyInReader;
      this.persist();

      if (this.isReaderActive) {
        if (this.keepScreenAwake) {
          void ScreenControlService.setKeepAwake(true);
        }
        void ScreenControlService.applyOrientation(this.orientationLock);
      } else {
        void ScreenControlService.applyOrientation('auto');
      }
    },

    persist(): void {
      persistSettings({
        keepScreenAwake: this.keepScreenAwake,
        orientationLock: this.orientationLock,
        applyOrientationOnlyInReader: this.applyOrientationOnlyInReader,
      });
    },
  },
});
