import { onMounted, onUnmounted } from 'vue';
import { App, type AppState } from '@capacitor/app';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { useReaderStore } from '../stores/readerStore';
import { SqliteService } from '../services/database/SqliteService';

export function useAppLifecycle() {
  const readerStore = useReaderStore();
  let appStateListener: { remove: () => void } | null = null;
  let backButtonListener: { remove: () => void } | null = null;

  const enableKeepAwake = async (): Promise<void> => {
    try {
      await KeepAwake.keepAwake();
    } catch {
    }
  };

  const disableKeepAwake = async (): Promise<void> => {
    try {
      await KeepAwake.allowSleep();
    } catch {
    }
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
      }
    }
  };

  onMounted(async () => {
    appStateListener = await App.addListener('appStateChange', async (state: AppState) => {
      if (!state.isActive) {
        await persistCurrentProgress();
        await disableKeepAwake();
      } else if (readerStore.currentBook) {
        await enableKeepAwake();
      }
    });

    backButtonListener = await App.addListener('backButton', () => {
      if (readerStore.selection) {
        readerStore.setSelection(null);
        return;
      }
      if (!readerStore.isImmersiveMode) {
        readerStore.setImmersiveMode(true);
        return;
      }
    });
  });

  onUnmounted(async () => {
    await persistCurrentProgress();
    await disableKeepAwake();

    if (appStateListener) {
      appStateListener.remove();
      appStateListener = null;
    }

    if (backButtonListener) {
      backButtonListener.remove();
      backButtonListener = null;
    }
  });

  return {
    enableKeepAwake,
    disableKeepAwake,
    persistCurrentProgress,
  };
}
