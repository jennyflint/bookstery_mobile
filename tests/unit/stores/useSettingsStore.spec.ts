import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSettingsStore, SETTINGS_STORAGE_KEY } from '~/stores/useSettingsStore';
import { ScreenControlService } from '~/services/ScreenControlService';

describe('useSettingsStore', () => {
  let store: ReturnType<typeof useSettingsStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    store = useSettingsStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with default values when localStorage is empty', () => {
    expect(store.keepScreenAwake).toBe(true);
    expect(store.orientationLock).toBe('auto');
    expect(store.applyOrientationOnlyInReader).toBe(true);
    expect(store.volumeKeyPageTurn).toBe(true);
    expect(store.invertVolumeKeys).toBe(false);
    expect(store.isReaderActive).toBe(false);
  });

  it('should load initial values from localStorage', () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        keepScreenAwake: false,
        orientationLock: 'portrait',
        applyOrientationOnlyInReader: false,
        volumeKeyPageTurn: false,
        invertVolumeKeys: true,
      }),
    );

    setActivePinia(createPinia());
    const newStore = useSettingsStore();

    expect(newStore.keepScreenAwake).toBe(false);
    expect(newStore.orientationLock).toBe('portrait');
    expect(newStore.applyOrientationOnlyInReader).toBe(false);
    expect(newStore.volumeKeyPageTurn).toBe(false);
    expect(newStore.invertVolumeKeys).toBe(true);
  });

  describe('setKeepScreenAwake', () => {
    it('should update keepScreenAwake and persist to localStorage', async () => {
      await store.setKeepScreenAwake(false);

      expect(store.keepScreenAwake).toBe(false);
      const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(stored.keepScreenAwake).toBe(false);
    });

    it('should immediately call ScreenControlService when reader is active', async () => {
      const setKeepAwakeSpy = vi
        .spyOn(ScreenControlService, 'setKeepAwake')
        .mockResolvedValue(undefined);
      store.isReaderActive = true;

      await store.setKeepScreenAwake(false);

      expect(setKeepAwakeSpy).toHaveBeenCalledWith(false);
    });

    it('should not call ScreenControlService when reader is inactive', async () => {
      const setKeepAwakeSpy = vi
        .spyOn(ScreenControlService, 'setKeepAwake')
        .mockResolvedValue(undefined);
      store.isReaderActive = false;

      await store.setKeepScreenAwake(true);

      expect(setKeepAwakeSpy).not.toHaveBeenCalled();
    });
  });

  describe('setOrientationLock', () => {
    it('should update orientationLock and persist to localStorage', async () => {
      await store.setOrientationLock('landscape');

      expect(store.orientationLock).toBe('landscape');
      const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(stored.orientationLock).toBe('landscape');
    });

    it('should call applyOrientation with mode if applyOrientationOnlyInReader is false', async () => {
      const applyOrientationSpy = vi
        .spyOn(ScreenControlService, 'applyOrientation')
        .mockResolvedValue(undefined);
      store.applyOrientationOnlyInReader = false;
      store.isReaderActive = false;

      await store.setOrientationLock('portrait');

      expect(applyOrientationSpy).toHaveBeenCalledWith('portrait');
    });

    it('should call applyOrientation with "auto" if applyOrientationOnlyInReader is true and reader is inactive', async () => {
      const applyOrientationSpy = vi
        .spyOn(ScreenControlService, 'applyOrientation')
        .mockResolvedValue(undefined);
      store.applyOrientationOnlyInReader = true;
      store.isReaderActive = false;

      await store.setOrientationLock('portrait');

      expect(applyOrientationSpy).toHaveBeenCalledWith('auto');
    });

    it('should call applyOrientation with mode if reader is active', async () => {
      const applyOrientationSpy = vi
        .spyOn(ScreenControlService, 'applyOrientation')
        .mockResolvedValue(undefined);
      store.applyOrientationOnlyInReader = true;
      store.isReaderActive = true;

      await store.setOrientationLock('portrait');

      expect(applyOrientationSpy).toHaveBeenCalledWith('portrait');
    });
  });

  describe('enterReader and leaveReader', () => {
    it('should apply keepAwake and orientation lock on enterReader', async () => {
      const setKeepAwakeSpy = vi
        .spyOn(ScreenControlService, 'setKeepAwake')
        .mockResolvedValue(undefined);
      const applyOrientationSpy = vi
        .spyOn(ScreenControlService, 'applyOrientation')
        .mockResolvedValue(undefined);
      store.keepScreenAwake = true;
      store.orientationLock = 'landscape';

      await store.enterReader();

      expect(store.isReaderActive).toBe(true);
      expect(setKeepAwakeSpy).toHaveBeenCalledWith(true);
      expect(applyOrientationSpy).toHaveBeenCalledWith('landscape');
    });

    it('should allow sleep and revert orientation to auto on leaveReader when TTS is not playing', async () => {
      const setKeepAwakeSpy = vi
        .spyOn(ScreenControlService, 'setKeepAwake')
        .mockResolvedValue(undefined);
      const applyOrientationSpy = vi
        .spyOn(ScreenControlService, 'applyOrientation')
        .mockResolvedValue(undefined);
      store.isReaderActive = true;
      store.applyOrientationOnlyInReader = true;

      await store.leaveReader(false);

      expect(store.isReaderActive).toBe(false);
      expect(setKeepAwakeSpy).toHaveBeenCalledWith(false);
      expect(applyOrientationSpy).toHaveBeenCalledWith('auto');
    });

    it('should keep screen awake on leaveReader if TTS is actively playing', async () => {
      const setKeepAwakeSpy = vi
        .spyOn(ScreenControlService, 'setKeepAwake')
        .mockResolvedValue(undefined);
      store.isReaderActive = true;

      await store.leaveReader(true);

      expect(store.isReaderActive).toBe(false);
      expect(setKeepAwakeSpy).not.toHaveBeenCalledWith(false);
    });
  });

  describe('handleAppBackground and handleAppForeground', () => {
    it('should release wake lock on handleAppBackground', async () => {
      const setKeepAwakeSpy = vi
        .spyOn(ScreenControlService, 'setKeepAwake')
        .mockResolvedValue(undefined);

      await store.handleAppBackground();

      expect(setKeepAwakeSpy).toHaveBeenCalledWith(false);
    });

    it('should restore wake lock and orientation on handleAppForeground if reader is active', async () => {
      const setKeepAwakeSpy = vi
        .spyOn(ScreenControlService, 'setKeepAwake')
        .mockResolvedValue(undefined);
      const applyOrientationSpy = vi
        .spyOn(ScreenControlService, 'applyOrientation')
        .mockResolvedValue(undefined);
      store.isReaderActive = true;
      store.keepScreenAwake = true;
      store.orientationLock = 'portrait';

      await store.handleAppForeground();

      expect(setKeepAwakeSpy).toHaveBeenCalledWith(true);
      expect(applyOrientationSpy).toHaveBeenCalledWith('portrait');
    });
  });

  describe('resetToDefault', () => {
    it('should reset all settings back to defaults', () => {
      store.keepScreenAwake = false;
      store.orientationLock = 'landscape';
      store.applyOrientationOnlyInReader = false;
      store.volumeKeyPageTurn = false;
      store.invertVolumeKeys = true;

      store.resetToDefault();

      expect(store.keepScreenAwake).toBe(true);
      expect(store.orientationLock).toBe('auto');
      expect(store.applyOrientationOnlyInReader).toBe(true);
      expect(store.volumeKeyPageTurn).toBe(true);
      expect(store.invertVolumeKeys).toBe(false);
    });
  });

  describe('setVolumeKeyPageTurn', () => {
    it('should update volumeKeyPageTurn and persist to localStorage', () => {
      store.setVolumeKeyPageTurn(false);

      expect(store.volumeKeyPageTurn).toBe(false);
      const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(stored.volumeKeyPageTurn).toBe(false);
    });
  });

  describe('setInvertVolumeKeys', () => {
    it('should update invertVolumeKeys and persist to localStorage', () => {
      store.setInvertVolumeKeys(true);

      expect(store.invertVolumeKeys).toBe(true);
      const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(stored.invertVolumeKeys).toBe(true);
    });
  });

  describe('setPaginationMode', () => {
    it('should update paginationMode, persist to localStorage, and sync with readerStore', async () => {
      const readerStore = (await import('~/stores/readerStore')).useReaderStore();
      expect(store.paginationMode).toBe('paginated');

      store.setPaginationMode('scroll');

      expect(store.paginationMode).toBe('scroll');
      expect(readerStore.settings.paginationMode).toBe('scroll');
      const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(stored.paginationMode).toBe('scroll');
    });
  });
});
