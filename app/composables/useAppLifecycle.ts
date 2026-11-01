import { onMounted, onUnmounted } from 'vue';
import { App, type AppState } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useReaderStore } from '../stores/readerStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { ScreenControlService } from '../services/ScreenControlService';
import { SqliteService } from '../services/database/SqliteService';

export function useAppLifecycle() {
  const readerStore = useReaderStore();
  const settingsStore = useSettingsStore();
  let appStateListener: { remove: () => void } | null = null;
  let webVisibilityHandler: (() => void) | null = null;

  const enableKeepAwake = async (): Promise<void> => {
    if (settingsStore.keepScreenAwake) {
      await ScreenControlService.setKeepAwake(true);
    }
  };

  const disableKeepAwake = async (): Promise<void> => {
    await ScreenControlService.setKeepAwake(false);
  };

  const persistCurrentProgress = async (): Promise<void> => {
    if (readerStore.currentBook && readerStore.locator) {
      try {
        const sqlite = SqliteService.getInstance();
        await sqlite.updateReadingPosition(
          readerStore.currentBook.id,
          readerStore.locator,
          readerStore.progressPercentage,
        );
      } catch {
        // Silently catch SQLite update errors on lifecycle transitions
      }
    }
  };

  onMounted(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        appStateListener = await App.addListener('appStateChange', async (state: AppState) => {
          if (!state.isActive) {
            await persistCurrentProgress();
            await disableKeepAwake();
          } else if (readerStore.currentBook) {
            await enableKeepAwake();
            await ScreenControlService.applyOrientation(settingsStore.orientationLock);
          }
        });
      } catch {
        // Silently handle listener registration failure
      }
    } else if (typeof document !== 'undefined') {
      webVisibilityHandler = async () => {
        if (document.visibilityState === 'hidden') {
          await persistCurrentProgress();
          await disableKeepAwake();
        } else if (document.visibilityState === 'visible' && readerStore.currentBook) {
          await enableKeepAwake();
          await ScreenControlService.applyOrientation(settingsStore.orientationLock);
        }
      };
      document.addEventListener('visibilitychange', webVisibilityHandler);
    }
  });

  onUnmounted(async () => {
    await persistCurrentProgress();
    await disableKeepAwake();

    if (appStateListener) {
      appStateListener.remove();
      appStateListener = null;
    }

    if (webVisibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', webVisibilityHandler);
      webVisibilityHandler = null;
    }
  });

  return {
    enableKeepAwake,
    disableKeepAwake,
    persistCurrentProgress,
  };
}
