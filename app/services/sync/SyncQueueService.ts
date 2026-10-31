import { Network, type ConnectionStatus } from '@capacitor/network';
import { App, type AppState } from '@capacitor/app';
import { SqliteService } from '../database/SqliteService';
import { GoogleAuthService } from '../auth/GoogleAuthService';
import { GoogleDriveFolderService } from '../drive/GoogleDriveFolderService';
import { SyncConflictResolver } from './SyncConflictResolver';
import type { SyncQueueItem, BookProgressRecord } from '../../types';

export class SyncQueueService {
  private static instance: SyncQueueService | null = null;
  private sqliteService: SqliteService;
  private authService: GoogleAuthService;
  private folderService: GoogleDriveFolderService;
  private isOnline: boolean = true;
  private isProcessing: boolean = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private networkListenerHandle: { remove: () => void } | null = null;
  private appStateListenerHandle: { remove: () => void } | null = null;
  private isInitialized: boolean = false;

  constructor(
    sqliteService?: SqliteService,
    authService?: GoogleAuthService,
    folderService?: GoogleDriveFolderService,
  ) {
    this.sqliteService = sqliteService || SqliteService.getInstance();
    this.authService = authService || GoogleAuthService.getInstance();
    this.folderService = folderService || GoogleDriveFolderService.getInstance();
  }

  static getInstance(): SyncQueueService {
    if (!SyncQueueService.instance) {
      SyncQueueService.instance = new SyncQueueService();
    }
    return SyncQueueService.instance;
  }

  async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const status = await Network.getStatus();
      this.isOnline = status.connected;
    } catch {
      this.isOnline = true;
    }

    try {
      this.networkListenerHandle = await Network.addListener(
        'networkStatusChange',
        async (status: ConnectionStatus) => {
          const wasOffline = !this.isOnline;
          this.isOnline = status.connected;
          if (wasOffline && this.isOnline && this.authService.isAuthenticated()) {
            await this.processQueue();
          }
        },
      );
    } catch {
    }

    try {
      this.appStateListenerHandle = await App.addListener(
        'appStateChange',
        async (state: AppState) => {
          if (!state.isActive && this.authService.isAuthenticated()) {
            this.cancelDebounce();
            await this.processQueue();
          }
        },
      );
    } catch {
    }

    this.isInitialized = true;
  }

  async enqueue(
    bookId: string,
    locator: string,
    progressPercentage: number,
  ): Promise<void> {
    const now = Date.now();
    await this.sqliteService.updateReadingPosition(bookId, locator, progressPercentage);
    await this.sqliteService.enqueueSyncItem({
      book_id: bookId,
      locator,
      progress_percentage: progressPercentage,
      updated_at: now,
      status: 'pending',
    });
  }

  async queueWithDebounce(
    bookId: string,
    locator: string,
    progressPercentage: number,
    delayMs = 4000,
  ): Promise<void> {
    await this.enqueue(bookId, locator, progressPercentage);

    if (!this.authService.isAuthenticated()) {
      return;
    }

    this.cancelDebounce();

    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      await this.processQueue();
    }, delayMs);
  }

  cancelDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  async peekPending(): Promise<SyncQueueItem[]> {
    return await this.sqliteService.getPendingSyncQueue();
  }

  async markSynced(id: number): Promise<void> {
    await this.sqliteService.updateSyncQueueStatus(id, 'synced');
  }

  async markFailed(id: number): Promise<void> {
    await this.sqliteService.updateSyncQueueStatus(id, 'failed');
  }

  async processQueue(options?: { immediate?: boolean }): Promise<void> {
    if (options?.immediate) {
      this.cancelDebounce();
    }

    if (this.isProcessing) {
      return;
    }

    if (!this.authService.isAuthenticated()) {
      return;
    }

    if (!this.isOnline) {
      return;
    }

    this.isProcessing = true;

    try {
      const pendingItems = await this.peekPending();
      if (pendingItems.length === 0) {
        return;
      }

      let accessToken: string;
      try {
        accessToken = await this.authService.getAccessToken();
      } catch {
        return;
      }

      let folderId: string;
      try {
        folderId = await this.folderService.ensureStorageFolder(accessToken);
      } catch {
        return;
      }

      for (const item of pendingItems) {
        if (!item.id) {
          continue;
        }

        await this.sqliteService.updateSyncQueueStatus(item.id, 'processing');

        try {
          const remote = await this.folderService.fetchBookProgress(
            folderId,
            item.book_id,
            accessToken,
          );

          if (remote) {
            const conflictResult = SyncConflictResolver.resolve(
              {
                locator: item.locator,
                progress_percentage: item.progress_percentage,
                updated_at: item.updated_at,
              },
              {
                locator: remote.locator,
                progress_percentage: remote.progressPercentage,
                updated_at: remote.updatedAt,
              },
            );

            if (conflictResult.source === 'local') {
              const payload: BookProgressRecord = {
                bookId: item.book_id,
                locator: item.locator,
                progressPercentage: item.progress_percentage,
                updatedAt: item.updated_at,
              };
              await this.folderService.uploadBookProgress(
                folderId,
                item.book_id,
                payload,
                accessToken,
              );
            } else {
              await this.sqliteService.updateReadingPosition(
                item.book_id,
                conflictResult.winnerLocator,
                conflictResult.winnerPercentage,
              );
            }
          } else {
            const payload: BookProgressRecord = {
              bookId: item.book_id,
              locator: item.locator,
              progressPercentage: item.progress_percentage,
              updatedAt: item.updated_at,
            };
            await this.folderService.uploadBookProgress(
              folderId,
              item.book_id,
              payload,
              accessToken,
            );
          }

          await this.markSynced(item.id);

          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch {
          await this.markFailed(item.id);
        }
      }

      await this.sqliteService.clearSyncedQueue();

      const session = await this.sqliteService.getUserSession();
      if (session) {
        await this.sqliteService.saveUserSession({
          email: session.email,
          display_name: session.display_name,
          last_sync_at: Date.now(),
          drive_folder_id: folderId,
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async flushPending(): Promise<void> {
    await this.processQueue({ immediate: true });
  }

  getIsOnline(): boolean {
    return this.isOnline;
  }

  getIsProcessing(): boolean {
    return this.isProcessing;
  }

  destroy(): void {
    this.cancelDebounce();
    if (this.networkListenerHandle) {
      this.networkListenerHandle.remove();
      this.networkListenerHandle = null;
    }
    if (this.appStateListenerHandle) {
      this.appStateListenerHandle.remove();
      this.appStateListenerHandle = null;
    }
    this.isInitialized = false;
  }
}
