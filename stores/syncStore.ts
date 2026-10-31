import { defineStore } from 'pinia';
import { SyncService } from '../services/sync/SyncService';
import { SqliteService } from '../services/database/SqliteService';

export const useSyncStore = defineStore('sync', {
  state: () => ({
    isOnline: true,
    isSyncing: false,
    pendingQueueCount: 0,
    lastSyncAt: null as number | null,
  }),
  actions: {
    async init(): Promise<void> {
      const syncService = SyncService.getInstance();
      await syncService.init();
      this.isOnline = syncService.getIsOnline();
      await this.refreshQueueCount();

      const sqlite = SqliteService.getInstance();
      const session = await sqlite.getUserSession();
      if (session) {
        this.lastSyncAt = session.last_sync_at;
      }
    },
    async triggerSync(): Promise<void> {
      const syncService = SyncService.getInstance();
      this.isSyncing = true;
      try {
        await syncService.flushQueue();
        await syncService.syncWithDrive();
        await this.refreshQueueCount();

        const sqlite = SqliteService.getInstance();
        const session = await sqlite.getUserSession();
        if (session) {
          this.lastSyncAt = session.last_sync_at;
        }
      } finally {
        this.isSyncing = false;
      }
    },
    async refreshQueueCount(): Promise<void> {
      const sqlite = SqliteService.getInstance();
      const queue = await sqlite.getPendingSyncQueue();
      this.pendingQueueCount = queue.length;
    },
  },
});
