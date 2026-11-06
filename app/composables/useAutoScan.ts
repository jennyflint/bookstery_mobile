import { getCurrentInstance, onMounted, onUnmounted } from 'vue';
import { App, type AppState } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useScannerStore } from '../stores/scannerStore';

export function useAutoScan() {
  const scannerStore = useScannerStore();
  let appStateListener: { remove: () => void } | null = null;
  let webVisibilityHandler: (() => void) | null = null;
  let lastResumeTriggerTime = 0;
  const RESUME_COOLDOWN_MS = 5000;

  const handleAppResume = async (): Promise<void> => {
    const now = Date.now();
    if (
      scannerStore.isScanning ||
      now - lastResumeTriggerTime < RESUME_COOLDOWN_MS ||
      (scannerStore.lastScanCompletedAt > 0 &&
        now - scannerStore.lastScanCompletedAt < RESUME_COOLDOWN_MS)
    ) {
      return;
    }
    lastResumeTriggerTime = now;
    scannerStore.runStartupScan().catch((err: unknown) => {
      console.warn('[auto-scan] Background app resume scan failed:', err);
    });
  };

  const setupLifecycleListener = async (): Promise<void> => {
    if (Capacitor.isNativePlatform()) {
      try {
        appStateListener = await App.addListener('appStateChange', ({ isActive }: AppState) => {
          if (isActive) {
            handleAppResume();
          }
        });
      } catch {}
    } else if (typeof document !== 'undefined') {
      webVisibilityHandler = () => {
        if (document.visibilityState === 'visible') {
          handleAppResume();
        }
      };
      document.addEventListener('visibilitychange', webVisibilityHandler);
    }
  };

  const teardownLifecycleListener = () => {
    if (appStateListener) {
      appStateListener.remove();
      appStateListener = null;
    }
    if (webVisibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', webVisibilityHandler);
      webVisibilityHandler = null;
    }
  };

  if (getCurrentInstance()) {
    onMounted(async () => {
      await scannerStore.init();
      await setupLifecycleListener();
    });

    onUnmounted(() => {
      teardownLifecycleListener();
    });
  }

  return {
    scannerStore,
    setupLifecycleListener,
    teardownLifecycleListener,
    handleAppResume,
  };
}
