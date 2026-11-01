import { SyncQueueService } from './SyncQueueService';
import { SqliteService } from '../database/SqliteService';
import { GoogleAuthService } from '../auth/GoogleAuthService';
import { GoogleDriveFolderService } from '../drive/GoogleDriveFolderService';

export class SyncService {
  private static instance: SyncService | null = null;
  private queueService: SyncQueueService;
  private sqliteService: SqliteService;
  private authService: GoogleAuthService;
  private folderService: GoogleDriveFolderService;

  constructor(
    sqliteService?: SqliteService,
    authService?: GoogleAuthService,
    folderService?: GoogleDriveFolderService,
  ) {
    this.sqliteService = sqliteService || SqliteService.getInstance();
    this.authService = authService || GoogleAuthService.getInstance();
    this.folderService = folderService || GoogleDriveFolderService.getInstance();
    this.queueService =
      sqliteService || authService || folderService
        ? new SyncQueueService(this.sqliteService, this.authService, this.folderService)
        : SyncQueueService.getInstance();
  }

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  async init(): Promise<void> {
    await this.queueService.init();
  }

  async queueProgressUpdate(
    bookId: string,
    locator: string,
    progressPercentage: number,
  ): Promise<void> {
    await this.queueService.queueWithDebounce(bookId, locator, progressPercentage, 4000);
  }

  async flushQueue(): Promise<void> {
    await this.queueService.flushPending();
  }

  async syncWithDrive(): Promise<void> {
    await this.queueService.processQueue({ immediate: true });
  }

  getIsOnline(): boolean {
    return this.queueService.getIsOnline();
  }

  getQueueService(): SyncQueueService {
    return this.queueService;
  }
}
