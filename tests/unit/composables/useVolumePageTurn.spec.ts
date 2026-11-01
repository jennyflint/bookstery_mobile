import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { useVolumePageTurn } from '~/composables/useVolumePageTurn';
import { useSettingsStore } from '~/stores/useSettingsStore';
import { useTtsStore } from '~/stores/ttsStore';
import { mockVolumeButtons, mockApp } from '../../mocks/capacitor-plugins';

describe('useVolumePageTurn composable', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('computes shouldIntercept accurately based on reader, settings, TTS, and modal state', async () => {
    const settingsStore = useSettingsStore();
    const ttsStore = useTtsStore();

    const isReaderOpen = ref(true);
    const isAnyModalOpen = ref(false);
    const onNextPage = vi.fn();
    const onPrevPage = vi.fn();

    const { shouldIntercept } = useVolumePageTurn({
      onNextPage,
      onPrevPage,
      isReaderOpen,
      isAnyModalOpen,
    });

    expect(shouldIntercept.value).toBe(true);
    expect(mockVolumeButtons.setVolumeInterception).toHaveBeenCalledWith({ enabled: true });

    // 1. Deactivates when TTS is playing
    ttsStore.isPlaying = true;
    await nextTick();
    expect(shouldIntercept.value).toBe(false);
    expect(mockVolumeButtons.setVolumeInterception).toHaveBeenCalledWith({ enabled: false });

    // Restoring TTS restores interception
    ttsStore.isPlaying = false;
    await nextTick();
    expect(shouldIntercept.value).toBe(true);

    // 2. Deactivates when any modal is open
    isAnyModalOpen.value = true;
    await nextTick();
    expect(shouldIntercept.value).toBe(false);

    isAnyModalOpen.value = false;
    await nextTick();
    expect(shouldIntercept.value).toBe(true);

    // 3. Deactivates when user disables volumeKeyPageTurn in settings
    settingsStore.volumeKeyPageTurn = false;
    await nextTick();
    expect(shouldIntercept.value).toBe(false);

    settingsStore.volumeKeyPageTurn = true;
    await nextTick();
    expect(shouldIntercept.value).toBe(true);

    // 4. Deactivates when reader is closed
    isReaderOpen.value = false;
    await nextTick();
    expect(shouldIntercept.value).toBe(false);
  });

  it('dispatches next/prev page correctly when standard (non-inverted)', async () => {
    const settingsStore = useSettingsStore();
    settingsStore.invertVolumeKeys = false;

    const onNextPage = vi.fn().mockResolvedValue(undefined);
    const onPrevPage = vi.fn().mockResolvedValue(undefined);

    const { dispatchPageTurn } = useVolumePageTurn({
      onNextPage,
      onPrevPage,
      isReaderOpen: ref(true),
      isAnyModalOpen: ref(false),
    });

    // Volume Down -> Next Page
    await dispatchPageTurn('down');
    expect(onNextPage).toHaveBeenCalledTimes(1);
    expect(onPrevPage).not.toHaveBeenCalled();

    // Volume Up -> Previous Page (after throttle period)
    await new Promise((r) => setTimeout(r, 160));
    await dispatchPageTurn('up');
    expect(onPrevPage).toHaveBeenCalledTimes(1);
  });

  it('inverts page turns when invertVolumeKeys is true', async () => {
    const settingsStore = useSettingsStore();
    settingsStore.invertVolumeKeys = true;

    const onNextPage = vi.fn().mockResolvedValue(undefined);
    const onPrevPage = vi.fn().mockResolvedValue(undefined);

    const { dispatchPageTurn } = useVolumePageTurn({
      onNextPage,
      onPrevPage,
      isReaderOpen: ref(true),
      isAnyModalOpen: ref(false),
    });

    // Inverted: Volume Down -> Previous Page
    await dispatchPageTurn('down');
    expect(onPrevPage).toHaveBeenCalledTimes(1);
    expect(onNextPage).not.toHaveBeenCalled();

    // Inverted: Volume Up -> Next Page
    await new Promise((r) => setTimeout(r, 160));
    await dispatchPageTurn('up');
    expect(onNextPage).toHaveBeenCalledTimes(1);
  });

  it('handles fallback keydown events on window', async () => {
    const onNextPage = vi.fn().mockResolvedValue(undefined);
    const onPrevPage = vi.fn().mockResolvedValue(undefined);

    useVolumePageTurn({
      onNextPage,
      onPrevPage,
      isReaderOpen: ref(true),
      isAnyModalOpen: ref(false),
    });

    await nextTick();

    // Simulate Volume Down keyboard event
    const downEvent = new KeyboardEvent('keydown', {
      key: 'AudioVolumeDown',
      cancelable: true,
    });
    const preventDefaultSpy = vi.spyOn(downEvent, 'preventDefault');
    window.dispatchEvent(downEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(onNextPage).toHaveBeenCalledTimes(1);

    // Simulate Volume Up keyboard event
    await new Promise((r) => setTimeout(r, 160));
    const upEvent = new KeyboardEvent('keydown', {
      key: 'AudioVolumeUp',
      cancelable: true,
    });
    window.dispatchEvent(upEvent);

    expect(onPrevPage).toHaveBeenCalledTimes(1);
  });

  it('handles custom volumeButtonPressed window event from native bridge', async () => {
    const onNextPage = vi.fn().mockResolvedValue(undefined);
    const onPrevPage = vi.fn().mockResolvedValue(undefined);

    useVolumePageTurn({
      onNextPage,
      onPrevPage,
      isReaderOpen: ref(true),
      isAnyModalOpen: ref(false),
    });

    await nextTick();

    const bridgeEvent = new CustomEvent('volumeButtonPressed', {
      detail: { direction: 'down' },
    });
    window.dispatchEvent(bridgeEvent);

    expect(onNextPage).toHaveBeenCalledTimes(1);
  });

  it('suspends native interception when app moves to background', async () => {
    let appStateCallback: ((state: { isActive: boolean }) => void) | null = null;
    mockApp.addListener.mockImplementation(async (event: string, callback: any) => {
      if (event === 'appStateChange') {
        appStateCallback = callback;
      }
      return { remove: vi.fn().mockResolvedValue(undefined) };
    });

    useVolumePageTurn({
      onNextPage: vi.fn(),
      onPrevPage: vi.fn(),
      isReaderOpen: ref(true),
      isAnyModalOpen: ref(false),
    });

    await nextTick();

    expect(mockVolumeButtons.setVolumeInterception).toHaveBeenCalledWith({ enabled: true });

    // Background app
    if (appStateCallback) {
      (appStateCallback as any)({ isActive: false });
    }
    expect(mockVolumeButtons.setVolumeInterception).toHaveBeenCalledWith({ enabled: false });

    // Foreground app
    if (appStateCallback) {
      (appStateCallback as any)({ isActive: true });
    }
    expect(mockVolumeButtons.setVolumeInterception).toHaveBeenCalledWith({ enabled: true });
  });
});
