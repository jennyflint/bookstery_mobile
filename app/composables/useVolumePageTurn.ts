import { ref, computed, watch, onMounted, onUnmounted, type Ref, type ComputedRef } from 'vue';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useTtsStore } from '../stores/ttsStore';
import { VolumeButtons } from '../services/volume/VolumeButtonsAdapter';
import type { VolumeDirection } from '../types/volume';

export interface UseVolumePageTurnOptions {
  onNextPage: () => void | Promise<void>;
  onPrevPage: () => void | Promise<void>;
  isReaderOpen?: Ref<boolean> | ComputedRef<boolean>;
  isAnyModalOpen?: Ref<boolean> | ComputedRef<boolean>;
}

const DEBOUNCE_TURN_MS = 150;

export function useVolumePageTurn(options: UseVolumePageTurnOptions) {
  const settingsStore = useSettingsStore();
  const ttsStore = useTtsStore();

  const isReaderOpen = computed(() => {
    if (options.isReaderOpen !== undefined) {
      return options.isReaderOpen.value;
    }
    return settingsStore.isReaderActive;
  });

  const isAnyModalOpen = computed(() => {
    if (options.isAnyModalOpen !== undefined) {
      return options.isAnyModalOpen.value;
    }
    return false;
  });

  const shouldIntercept = computed<boolean>(() => {
    return (
      isReaderOpen.value &&
      Boolean(settingsStore.volumeKeyPageTurn) &&
      !ttsStore.isPlaying &&
      !isAnyModalOpen.value
    );
  });

  let lastTurnTimestamp = 0;
  let pluginListenerHandle: PluginListenerHandle | null = null;
  let appStateListenerHandle: PluginListenerHandle | null = null;
  let iframeObserver: MutationObserver | null = null;
  const attachedIframes = new WeakSet<HTMLIFrameElement>();

  const dispatchPageTurn = async (direction: VolumeDirection): Promise<void> => {
    if (!shouldIntercept.value) {
      return;
    }

    const now = Date.now();
    if (now - lastTurnTimestamp < DEBOUNCE_TURN_MS) {
      return;
    }
    lastTurnTimestamp = now;

    const isInverted = Boolean(settingsStore.invertVolumeKeys);
    if (direction === 'down') {
      if (isInverted) {
        await options.onPrevPage();
      } else {
        await options.onNextPage();
      }
    } else if (direction === 'up') {
      if (isInverted) {
        await options.onNextPage();
      } else {
        await options.onPrevPage();
      }
    }
  };

  const setNativeInterception = async (enabled: boolean): Promise<void> => {
    try {
      await VolumeButtons.setVolumeInterception({ enabled });
    } catch {
      // Ignored on non-native or unsupported platforms
    }
  };

  const handleKeydown = (event: KeyboardEvent): void => {
    if (!shouldIntercept.value) {
      return;
    }

    const key = event.key;
    if (key === 'AudioVolumeDown' || key === 'VolumeDown' || key === 'PageDown') {
      event.preventDefault();
      void dispatchPageTurn('down');
    } else if (key === 'AudioVolumeUp' || key === 'VolumeUp' || key === 'PageUp') {
      event.preventDefault();
      void dispatchPageTurn('up');
    }
  };

  const handleWindowCustomEvent = (event: Event): void => {
    const customEvent = event as CustomEvent<{ direction?: VolumeDirection }>;
    if (customEvent.detail?.direction) {
      void dispatchPageTurn(customEvent.detail.direction);
    }
  };

  const attachIframeKeydown = (iframe: HTMLIFrameElement): void => {
    if (attachedIframes.has(iframe)) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        attachedIframes.add(iframe);
        doc.addEventListener('keydown', handleKeydown, true);
      }
    } catch {
      // Cross-origin iframe security fallback
    }
  };

  const scanAndAttachIframes = (): void => {
    if (typeof document === 'undefined') return;
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((iframe) => {
      attachIframeKeydown(iframe);
      iframe.addEventListener('load', () => attachIframeKeydown(iframe), { once: true });
    });
  };

  const setupListeners = async (): Promise<void> => {
    // 1. Register native Capacitor listener for volume key events
    try {
      pluginListenerHandle = await VolumeButtons.addListener('volumeButtonPressed', (event) => {
        if (event?.direction) {
          void dispatchPageTurn(event.direction);
        }
      });
    } catch {
      // Non-native fallback
    }

    // 2. Listen to custom DOM events (dispatched by native bridge triggerWindowJSEvent)
    if (typeof window !== 'undefined') {
      window.addEventListener('volumeButtonPressed', handleWindowCustomEvent);
      window.addEventListener('keydown', handleKeydown, true);

      // 3. Scan existing iframes and observe new ones (e.g. EPUB rendering chapters)
      scanAndAttachIframes();
      if (typeof MutationObserver !== 'undefined') {
        iframeObserver = new MutationObserver(() => {
          scanAndAttachIframes();
        });
        iframeObserver.observe(document.body, { childList: true, subtree: true });
      }
    }

    // 4. Handle Capacitor app state changes (background / foreground)
    try {
      appStateListenerHandle = await App.addListener('appStateChange', (state) => {
        if (!state.isActive) {
          void setNativeInterception(false);
        } else if (shouldIntercept.value) {
          void setNativeInterception(true);
        }
      });
    } catch {
      // App listener not available in plain browser
    }
  };

  if (typeof window !== 'undefined') {
    void setupListeners();
  }

  watch(
    shouldIntercept,
    (active) => {
      void setNativeInterception(active);
    },
    { immediate: true },
  );

  onUnmounted(async () => {
    // Ensure hardware buttons are restored immediately on unmount
    await setNativeInterception(false);

    if (pluginListenerHandle) {
      try {
        await pluginListenerHandle.remove();
      } catch {}
      pluginListenerHandle = null;
    }

    if (appStateListenerHandle) {
      try {
        await appStateListenerHandle.remove();
      } catch {}
      appStateListenerHandle = null;
    }

    if (iframeObserver) {
      iframeObserver.disconnect();
      iframeObserver = null;
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('volumeButtonPressed', handleWindowCustomEvent);
      window.removeEventListener('keydown', handleKeydown, true);
    }
  });

  return {
    shouldIntercept,
    dispatchPageTurn,
  };
}
