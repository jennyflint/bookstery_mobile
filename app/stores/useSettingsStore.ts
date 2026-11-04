import { defineStore } from 'pinia';
import { ScreenControlService } from '../services/ScreenControlService';
import { useReaderStore } from './readerStore';
import type { ReaderPaginationMode, ScreenControlSettings, ScreenOrientationMode } from '../types';

export const SETTINGS_STORAGE_KEY = 'bookstery_screen_control_settings';

export const DEFAULT_SCREEN_CONTROL_SETTINGS: Required<ScreenControlSettings> = {
  keepScreenAwake: true,
  orientationLock: 'auto',
  applyOrientationOnlyInReader: true,
  fontSize: 18,
  volumeKeyPageTurn: true,
  invertVolumeKeys: false,
  paginationMode: 'scroll',
};

function getStoredSettings(): Required<ScreenControlSettings> {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_SCREEN_CONTROL_SETTINGS };
  }
  try {
    // If bookstery_reader_settings has a saved paginationMode, use it as the source of truth
    let readerPaginationMode: ReaderPaginationMode | undefined;
    try {
      const readerRaw = localStorage.getItem('bookstery_reader_settings');
      if (readerRaw) {
        const readerParsed = JSON.parse(readerRaw) as { paginationMode?: string };
        if (readerParsed.paginationMode === 'scroll' || readerParsed.paginationMode === 'paginated') {
          readerPaginationMode = readerParsed.paginationMode;
        } else if (readerParsed.paginationMode === 'buttons') {
          readerPaginationMode = 'paginated';
        }
      }
    } catch {}

    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ScreenControlSettings>;
      const screenPaginationMode =
        parsed.paginationMode === 'scroll' || parsed.paginationMode === 'paginated'
          ? parsed.paginationMode
          : parsed.paginationMode === 'buttons'
            ? 'paginated'
            : undefined;

      const effectivePaginationMode =
        readerPaginationMode ?? screenPaginationMode ?? DEFAULT_SCREEN_CONTROL_SETTINGS.paginationMode;

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
        fontSize:
          typeof parsed.fontSize === 'number' && !isNaN(parsed.fontSize)
            ? Math.min(32, Math.max(12, Math.round(parsed.fontSize)))
            : DEFAULT_SCREEN_CONTROL_SETTINGS.fontSize,
        volumeKeyPageTurn:
          typeof parsed.volumeKeyPageTurn === 'boolean'
            ? parsed.volumeKeyPageTurn
            : DEFAULT_SCREEN_CONTROL_SETTINGS.volumeKeyPageTurn,
        invertVolumeKeys:
          typeof parsed.invertVolumeKeys === 'boolean'
            ? parsed.invertVolumeKeys
            : DEFAULT_SCREEN_CONTROL_SETTINGS.invertVolumeKeys,
        paginationMode: effectivePaginationMode,
      };
    } else {
      return {
        ...DEFAULT_SCREEN_CONTROL_SETTINGS,
        paginationMode: readerPaginationMode ?? DEFAULT_SCREEN_CONTROL_SETTINGS.paginationMode,
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
      fontSize: initial.fontSize,
      volumeKeyPageTurn: initial.volumeKeyPageTurn,
      invertVolumeKeys: initial.invertVolumeKeys,
      paginationMode: initial.paginationMode as ReaderPaginationMode,
      isReaderActive: false,
    };
  },

  getters: {
    fontScale: (state): number => Number((state.fontSize / 18).toFixed(2)),
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

    setFontSize(size: number): void {
      const clamped = Math.min(Math.max(Math.round(size), 12), 32);
      this.fontSize = clamped;
      this.persist();

      try {
        const readerStore = useReaderStore();
        if (readerStore.settings.fontSize !== clamped) {
          readerStore.setFontSize(clamped);
        }
      } catch {}
    },

    increaseFontSize(): void {
      this.setFontSize(this.fontSize + 2);
    },

    decreaseFontSize(): void {
      this.setFontSize(this.fontSize - 2);
    },

    resetFontSize(): void {
      this.setFontSize(DEFAULT_SCREEN_CONTROL_SETTINGS.fontSize);
    },

    setVolumeKeyPageTurn(enabled: boolean): void {
      this.volumeKeyPageTurn = enabled;
      this.persist();

      try {
        const readerStore = useReaderStore();
        readerStore.setVolumeKeyPageTurn(enabled);
      } catch {}
    },

    setInvertVolumeKeys(invert: boolean): void {
      this.invertVolumeKeys = invert;
      this.persist();

      try {
        const readerStore = useReaderStore();
        readerStore.setInvertVolumeKeys(invert);
      } catch {}
    },

    setPaginationMode(mode: ReaderPaginationMode): void {
      const normalized = mode === 'buttons' ? 'paginated' : mode;
      this.paginationMode = normalized;
      this.persist();

      try {
        const readerStore = useReaderStore();
        if (readerStore.settings.paginationMode !== normalized) {
          readerStore.setPaginationMode(normalized);
        }
      } catch {}
    },

    resetToDefault(): void {
      this.keepScreenAwake = DEFAULT_SCREEN_CONTROL_SETTINGS.keepScreenAwake;
      this.orientationLock = DEFAULT_SCREEN_CONTROL_SETTINGS.orientationLock;
      this.applyOrientationOnlyInReader =
        DEFAULT_SCREEN_CONTROL_SETTINGS.applyOrientationOnlyInReader;
      this.fontSize = DEFAULT_SCREEN_CONTROL_SETTINGS.fontSize;
      this.volumeKeyPageTurn = DEFAULT_SCREEN_CONTROL_SETTINGS.volumeKeyPageTurn;
      this.invertVolumeKeys = DEFAULT_SCREEN_CONTROL_SETTINGS.invertVolumeKeys;
      this.paginationMode = DEFAULT_SCREEN_CONTROL_SETTINGS.paginationMode ?? 'scroll';
      this.persist();

      try {
        const readerStore = useReaderStore();
        if (readerStore.settings.fontSize !== this.fontSize) {
          readerStore.setFontSize(this.fontSize);
        }
        readerStore.setVolumeKeyPageTurn(this.volumeKeyPageTurn);
        readerStore.setInvertVolumeKeys(this.invertVolumeKeys);
        if (readerStore.settings.paginationMode !== this.paginationMode) {
          readerStore.setPaginationMode(this.paginationMode);
        }
      } catch {}

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
        fontSize: this.fontSize,
        volumeKeyPageTurn: this.volumeKeyPageTurn,
        invertVolumeKeys: this.invertVolumeKeys,
        paginationMode: this.paginationMode,
      });
    },
  },
});
