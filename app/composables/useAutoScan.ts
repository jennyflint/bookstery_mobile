import { onMounted, onUnmounted } from 'vue';
import { App, type AppState } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useScannerStore } from '../stores/scannerStore';

export function useAutoScan() {
  const scannerStore = useScannerStore();
  let appStateListener: { remove: () => void } | null = null;
  let webVisibilityHandler: (() => void) | null = null;

  const handleAppResume = async () => {
    await scannerStore.runStartupScan();
  };

  const setupLifecycleListener = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        appStateListener = await App.addListener('appStateChange', async (state: AppState) => {
          if (state.isActive) {
            await handleAppResume();
          }
        });
      } catch {}
    } else if (typeof document !== 'undefined') {
      webVisibilityHandler = async () => {
        if (document.visibilityState === 'visible') {
          await handleAppResume();
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

  onMounted(async () => {
    await scannerStore.init();
    await setupLifecycleListener();
  });

  onUnmounted(() => {
    teardownLifecycleListener();
  });

  return {
    scannerStore,
    setupLifecycleListener,
    teardownLifecycleListener,
    handleAppResume,
  };
}
