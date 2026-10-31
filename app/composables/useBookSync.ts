import { storeToRefs } from 'pinia';
import { useSyncStore } from '../stores/syncStore';
import { SyncService } from '../services/sync/SyncService';

export function useBookSync() {
  const syncStore = useSyncStore();
  const { isOnline, isSyncing, pendingQueueCount, lastSyncAt } = storeToRefs(syncStore);

  const initSync = async (): Promise<void> => {
    await syncStore.init();
  };

  const syncNow = async (): Promise<void> => {
    await syncStore.triggerSync();
  };

  const queueProgress = async (bookId: string, locator: string, progressPercentage: number): Promise<void> => {
    const syncService = SyncService.getInstance();
    await syncService.queueProgressUpdate(bookId, locator, progressPercentage);
    await syncStore.refreshQueueCount();
  };

  return {
    isOnline,
    isSyncing,
    pendingQueueCount,
    lastSyncAt,
    initSync,
    syncNow,
    queueProgress,
  };
}
