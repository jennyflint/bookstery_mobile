import { defineStore } from 'pinia';
import { SyncQueueService } from '../services/sync/SyncQueueService';
import { SqliteService } from '../services/database/SqliteService';
import { GoogleAuthService } from '../services/auth/GoogleAuthService';
import { useAuthStore } from './authStore';
import { useLibraryStore } from './libraryStore';
import type { SyncVisualState } from '../types';

export const useSyncStore = defineStore('sync', {
  state: () => ({
    isOnline: true,
    isSyncing: false,
    pendingQueueCount: 0,
    lastSyncAt: null as number | null,
    syncVisualState: 'unauthenticated' as SyncVisualState,
    errorMessage: null as string | null,
    successResetTimer: null as ReturnType<typeof setTimeout> | null,
  }),
  actions: {
    async init(): Promise<void> {
      const sqlite = SqliteService.getInstance();
      await sqlite.init();

      const queueService = SyncQueueService.getInstance();
      await queueService.init();
      this.isOnline = queueService.getIsOnline();

      const session = await sqlite.getUserSession();
      if (session) {
        this.lastSyncAt = session.last_sync_at;
      }

      await this.refreshQueueCount();
    },

    setUnauthenticated(): void {
      this.syncVisualState = 'unauthenticated';
      this.errorMessage = null;
    },

    async refreshQueueCount(): Promise<void> {
      const sqlite = SqliteService.getInstance();
      await sqlite.init();
      const queue = await sqlite.getPendingSyncQueue();
      this.pendingQueueCount = queue.length;

      const authService = GoogleAuthService.getInstance();
      const authStore = useAuthStore();
      const isAuthed = authStore.isAuthenticated || authService.isAuthenticated();

      if (!isAuthed) {
        this.syncVisualState = 'unauthenticated';
      } else if (!this.isOnline) {
        this.syncVisualState = 'offline';
      } else if (!this.isSyncing && this.syncVisualState !== 'success') {
        this.syncVisualState = 'idle';
      }
    },

    async triggerSync(): Promise<void> {
      const authService = GoogleAuthService.getInstance();
      const authStore = useAuthStore();
      const isAuthed = authStore.isAuthenticated || authService.isAuthenticated();

      if (!isAuthed) {
        this.syncVisualState = 'unauthenticated';
        return;
      }

      if (!this.isOnline) {
        this.syncVisualState = 'offline';
        return;
      }

      const queueService = SyncQueueService.getInstance();
      this.isSyncing = true;
      this.syncVisualState = 'syncing';
      this.errorMessage = null;

      try {
        await queueService.flushPending();
        try {
          await useLibraryStore().loadBooks();
        } catch {}
        await this.refreshQueueCount();

        const sqlite = SqliteService.getInstance();
        await sqlite.init();
        const session = await sqlite.getUserSession();
        if (session) {
          this.lastSyncAt = session.last_sync_at;
        }

        this.syncVisualState = 'success';
        if (this.successResetTimer) {
          clearTimeout(this.successResetTimer);
        }
        this.successResetTimer = setTimeout(() => {
          if (this.syncVisualState === 'success') {
            this.syncVisualState = 'idle';
          }
          this.successResetTimer = null;
        }, 2000);
      } catch (err: unknown) {
        this.syncVisualState = 'error';
        this.errorMessage = err instanceof Error ? err.message : 'Sync failed';
      } finally {
        this.isSyncing = false;
      }
    },
  },
});
