import { storeToRefs } from 'pinia';
import { useSyncStore } from '../stores/syncStore';
import { SyncQueueService } from '../services/sync/SyncQueueService';

export function useBookSync() {
  const syncStore = useSyncStore();
  const { isOnline, isSyncing, pendingQueueCount, lastSyncAt, syncVisualState, errorMessage } =
    storeToRefs(syncStore);

  const initSync = async (): Promise<void> => {
    await syncStore.init();
  };

  const syncNow = async (): Promise<void> => {
    await syncStore.triggerSync();
  };

  const queueProgress = async (
    bookId: string,
    locator: string,
    progressPercentage: number,
  ): Promise<void> => {
    const queueService = SyncQueueService.getInstance();
    await queueService.queueWithDebounce(bookId, locator, progressPercentage, 4000);
    await syncStore.refreshQueueCount();
  };

  const cancelDebounce = (): void => {
    const queueService = SyncQueueService.getInstance();
    queueService.cancelDebounce();
  };

  return {
    isOnline,
    isSyncing,
    pendingQueueCount,
    lastSyncAt,
    syncVisualState,
    errorMessage,
    initSync,
    syncNow,
    queueProgress,
    cancelDebounce,
  };
}
