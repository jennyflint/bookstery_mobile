import { Network, type ConnectionStatus } from '@capacitor/network';
import { SqliteService } from '../database/SqliteService';
import { GoogleAuthService } from '../auth/GoogleAuthService';
import { GoogleDriveService } from '../drive/GoogleDriveService';
import { SyncConflictResolver } from './SyncConflictResolver';
import type { DriveSyncPayload, RemoteBookProgress } from '../../types';

export class SyncService {
  private static instance: SyncService | null = null;
  private sqliteService: SqliteService;
  private authService: GoogleAuthService;
  private driveService: GoogleDriveService;
  private isOnline: boolean = true;
  private isSyncing: boolean = false;
  private networkListenerHandle: { remove: () => void } | null = null;
  private deviceId: string;

  constructor(
    sqliteService?: SqliteService,
    authService?: GoogleAuthService,
    driveService?: GoogleDriveService,
  ) {
    this.sqliteService = sqliteService || SqliteService.getInstance();
    this.authService = authService || GoogleAuthService.getInstance();
    this.driveService = driveService || new GoogleDriveService();
    this.deviceId = 'device-' + Math.random().toString(36).substring(2, 9);
  }

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  async init(): Promise<void> {
    const status = await Network.getStatus();
    this.isOnline = status.connected;

    this.networkListenerHandle = await Network.addListener(
      'networkStatusChange',
      async (connStatus: ConnectionStatus) => {
        const wasOffline = !this.isOnline;
        this.isOnline = connStatus.connected;
        if (wasOffline && this.isOnline) {
          await this.flushQueue();
          await this.syncWithDrive();
        }
      },
    );
  }

  async queueProgressUpdate(bookId: string, locator: string, progressPercentage: number): Promise<void> {
    const now = Date.now();

    await this.sqliteService.updateReadingPosition(bookId, locator, progressPercentage);

    await this.sqliteService.enqueueSyncItem({
      book_id: bookId,
      locator,
      progress_percentage: progressPercentage,
      updated_at: now,
      status: 'pending',
    });

    if (this.isOnline) {
      await this.flushQueue();
      await this.syncWithDrive();
    }
  }

  async flushQueue(): Promise<void> {
    const pendingItems = await this.sqliteService.getPendingSyncQueue();
    if (pendingItems.length === 0) {
      return;
    }

    const user = this.authService.getCurrentUser();
    if (!user) {
      return;
    }

    let accessToken: string;
    try {
      accessToken = await this.authService.getAccessToken();
    } catch {
      return;
    }

    for (const item of pendingItems) {
      if (item.id) {
        await this.sqliteService.updateSyncQueueStatus(item.id, 'processing');
      }
    }

    try {
      const remotePayload = (await this.driveService.downloadProgressFile(accessToken)) || {
        version: 1,
        device_id: this.deviceId,
        updated_at: Date.now(),
        books: {},
      };

      for (const item of pendingItems) {
        remotePayload.books[item.book_id] = {
          locator: item.locator,
          progress_percentage: item.progress_percentage,
          updated_at: item.updated_at,
        };
      }

      remotePayload.updated_at = Date.now();
      await this.driveService.uploadProgressFile(accessToken, remotePayload);

      for (const item of pendingItems) {
        if (item.id) {
          await this.sqliteService.updateSyncQueueStatus(item.id, 'synced');
        }
      }

      await this.sqliteService.clearSyncedQueue();
    } catch {
      for (const item of pendingItems) {
        if (item.id) {
          await this.sqliteService.updateSyncQueueStatus(item.id, 'failed');
        }
      }
    }
  }

  async syncWithDrive(): Promise<void> {
    if (this.isSyncing || !this.isOnline) {
      return;
    }

    const user = this.authService.getCurrentUser();
    if (!user) {
      return;
    }

    this.isSyncing = true;

    try {
      const accessToken = await this.authService.getAccessToken();
      const remotePayload = await this.driveService.downloadProgressFile(accessToken);

      const localBooks = await this.sqliteService.getAllBooks();
      const mergedBooks: Record<string, RemoteBookProgress> = {};

      if (remotePayload && remotePayload.books) {
        for (const [bookId, remoteProg] of Object.entries(remotePayload.books)) {
          const localBook = localBooks.find((b) => b.id === bookId);
          if (localBook) {
            const resolved = SyncConflictResolver.resolve(
              {
                locator: localBook.locator,
                progress_percentage: localBook.progress_percentage,
                updated_at: localBook.updated_at,
              },
              remoteProg,
            );

            if (resolved.source === 'remote') {
              await this.sqliteService.updateReadingPosition(
                bookId,
                resolved.winnerLocator,
                resolved.winnerPercentage,
              );
            }

            mergedBooks[bookId] = {
              locator: resolved.winnerLocator,
              progress_percentage: resolved.winnerPercentage,
              updated_at: resolved.winnerUpdatedAt,
            };
          } else {
            mergedBooks[bookId] = remoteProg;
          }
        }
      }

      for (const localBook of localBooks) {
        if (!mergedBooks[localBook.id]) {
          mergedBooks[localBook.id] = {
            locator: localBook.locator,
            progress_percentage: localBook.progress_percentage,
            updated_at: localBook.updated_at,
          };
        }
      }

      const updatedPayload: DriveSyncPayload = {
        version: 1,
        device_id: this.deviceId,
        updated_at: Date.now(),
        books: mergedBooks,
      };

      await this.driveService.uploadProgressFile(accessToken, updatedPayload);

      await this.sqliteService.saveUserSession({
        email: user.email,
        display_name: user.displayName,
        last_sync_at: Date.now(),
      });
    } catch {
    } finally {
      this.isSyncing = false;
    }
  }

  getIsOnline(): boolean {
    return this.isOnline;
  }

  getIsSyncing(): boolean {
    return this.isSyncing;
  }

  destroy(): void {
    if (this.networkListenerHandle) {
      this.networkListenerHandle.remove();
      this.networkListenerHandle = null;
    }
  }
}
