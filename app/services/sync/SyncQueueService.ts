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
          } else if (state.isActive && this.authService.isAuthenticated()) {
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

      const pendingItems = await this.peekPending();
      if (pendingItems.length > 0) {
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

            const localBook = await this.sqliteService.getBookById(item.book_id);

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
                  title: localBook?.title,
                  fileSize: localBook?.file_size,
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
                  conflictResult.winnerUpdatedAt,
                );
              }
            } else {
              const payload: BookProgressRecord = {
                bookId: item.book_id,
                locator: item.locator,
                progressPercentage: item.progress_percentage,
                updatedAt: item.updated_at,
                title: localBook?.title,
                fileSize: localBook?.file_size,
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
      }

      await this.pullRemoteProgress(folderId, accessToken);

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

  async pullRemoteProgress(folderId: string, accessToken: string): Promise<number> {
    try {
      const manifest = await this.folderService.fetchManifest(folderId, accessToken);
      if (!manifest) {
        return 0;
      }

      const localBooks = await this.sqliteService.getAllBooks();
      const pendingItems = await this.peekPending();
      let updatedCount = 0;

      for (const book of localBooks) {
        let remoteBookId: string | null = null;
        let manifestEntry = manifest[book.id];

        if (manifestEntry) {
          remoteBookId = book.id;
        } else {
          const normalizedBookTitle = book.title?.trim().toLowerCase();
          for (const [candidateId, entry] of Object.entries(manifest)) {
            const normalizedEntryTitle = entry.title?.trim().toLowerCase();
            const sizesMatch =
              Boolean(entry.fileSize && book.file_size && entry.fileSize === book.file_size);
            const titlesMatch =
              Boolean(normalizedEntryTitle && normalizedBookTitle && normalizedEntryTitle === normalizedBookTitle);
            if (sizesMatch && titlesMatch) {
              manifestEntry = entry;
              remoteBookId = candidateId;
              break;
            }
          }
        }

        if (!manifestEntry || !remoteBookId) {
          continue;
        }

        const pendingForBook = pendingItems.find((p) => p.book_id === book.id);
        if (pendingForBook && pendingForBook.updated_at >= manifestEntry.updatedAt) {
          continue;
        }

        const isNewer = manifestEntry.updatedAt > book.updated_at;
        const isInitialCatchUp =
          book.progress_percentage === 0 && manifestEntry.progressPercentage > book.progress_percentage;

        if (isNewer || isInitialCatchUp) {
          const remote = await this.folderService.fetchBookProgress(
            folderId,
            remoteBookId,
            accessToken,
          );
          if (remote && remote.locator) {
            await this.sqliteService.updateReadingPosition(
              book.id,
              remote.locator,
              remote.progressPercentage,
              remote.updatedAt,
            );
            book.locator = remote.locator;
            book.progress_percentage = remote.progressPercentage;
            book.updated_at = remote.updatedAt;
            updatedCount++;
          }
        }
      }

      return updatedCount;
    } catch (err) {
      console.warn('[SyncQueueService] pullRemoteProgress error:', err);
      return 0;
    }
  }

  async pullSingleBookProgress(
    bookId: string,
  ): Promise<{ locator: string; progressPercentage: number; updatedAt: number } | null> {
    if (!this.authService.isAuthenticated() || !this.isOnline) {
      return null;
    }

    try {
      let accessToken: string;
      try {
        accessToken = await this.authService.getAccessToken();
      } catch {
        return null;
      }

      let folderId: string;
      try {
        folderId = await this.folderService.ensureStorageFolder(accessToken);
      } catch {
        return null;
      }

      const book = await this.sqliteService.getBookById(bookId);
      const manifest = await this.folderService.fetchManifest(folderId, accessToken);
      let remoteBookId: string = bookId;
      let manifestEntry = manifest ? manifest[bookId] : null;

      if (!manifestEntry && manifest && book) {
        const normalizedBookTitle = book.title?.trim().toLowerCase();
        for (const [candidateId, entry] of Object.entries(manifest)) {
          const normalizedEntryTitle = entry.title?.trim().toLowerCase();
          const sizesMatch =
            Boolean(entry.fileSize && book.file_size && entry.fileSize === book.file_size);
          const titlesMatch =
            Boolean(normalizedEntryTitle && normalizedBookTitle && normalizedEntryTitle === normalizedBookTitle);
          if (sizesMatch && titlesMatch) {
            manifestEntry = entry;
            remoteBookId = candidateId;
            break;
          }
        }
      }

      const pendingItems = await this.peekPending();
      const pendingForBook = pendingItems.find((p) => p.book_id === bookId);
      if (pendingForBook && manifestEntry && pendingForBook.updated_at >= manifestEntry.updatedAt) {
        return null;
      }

      const remote = await this.folderService.fetchBookProgress(folderId, remoteBookId, accessToken);
      if (!remote || !remote.locator) {
        return null;
      }

      if (pendingForBook && pendingForBook.updated_at >= remote.updatedAt) {
        return null;
      }

      const localUpdatedAt = book?.updated_at ?? 0;
      const localProgress = book?.progress_percentage ?? 0;
      const isNewer = remote.updatedAt > localUpdatedAt;
      const isInitialCatchUp = localProgress === 0 && remote.progressPercentage > localProgress;

      if (isNewer || isInitialCatchUp) {
        await this.sqliteService.updateReadingPosition(
          bookId,
          remote.locator,
          remote.progressPercentage,
          remote.updatedAt,
        );
      }

      return {
        locator: remote.locator,
        progressPercentage: remote.progressPercentage,
        updatedAt: remote.updatedAt,
      };
    } catch (err) {
      console.warn('[SyncQueueService] pullSingleBookProgress failed:', err);
      return null;
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
