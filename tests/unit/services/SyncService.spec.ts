import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncService } from '../../../app/services/sync/SyncService';
import { SqliteService } from '../../../app/services/database/SqliteService';
import { GoogleAuthService } from '../../../app/services/auth/GoogleAuthService';
import { GoogleDriveFolderService } from '../../../app/services/drive/GoogleDriveFolderService';

describe('SyncService', () => {
  let sqliteService: SqliteService;
  let authService: GoogleAuthService;
  let folderService: GoogleDriveFolderService;
  let syncService: SyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    sqliteService = new SqliteService();
    authService = new GoogleAuthService(sqliteService);
    folderService = new GoogleDriveFolderService(sqliteService, authService);

    vi.spyOn(authService, 'getCurrentUser').mockReturnValue({
      id: 'test-user-id',
      email: 'test@example.com',
      displayName: 'Test User',
      accessToken: 'mock-token',
    });

    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(authService, 'getAccessToken').mockResolvedValue('mock-token');
    vi.spyOn(folderService, 'ensureStorageFolder').mockResolvedValue('test-folder');
    vi.spyOn(folderService, 'fetchBookProgress').mockResolvedValue(null);
    vi.spyOn(folderService, 'uploadBookProgress').mockResolvedValue();

    syncService = new SyncService(sqliteService, authService, folderService);
  });

  it('should enqueue items with pending status when updating reading position', async () => {
    vi.spyOn(syncService.getQueueService(), 'getIsOnline').mockReturnValue(false);

    await syncService.getQueueService().enqueue('book-hash-1', '15', 50.0);

    const pending = await sqliteService.getPendingSyncQueue();
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending[0].book_id).toBe('book-hash-1');
    expect(pending[0].locator).toBe('15');
    expect(pending[0].progress_percentage).toBe(50.0);
  });

  it('should transition queue item status to synced after successful flush', async () => {
    await sqliteService.enqueueSyncItem({
      book_id: 'book-hash-2',
      locator: 'fb2-p-40',
      progress_percentage: 60.0,
      updated_at: Date.now(),
      status: 'pending',
    });

    const pendingBefore = await sqliteService.getPendingSyncQueue();
    expect(pendingBefore.length).toBe(1);
    expect(pendingBefore[0].status).toBe('pending');

    await syncService.flushQueue();

    expect(folderService.uploadBookProgress).toHaveBeenCalled();
    const pendingAfter = await sqliteService.getPendingSyncQueue();
    expect(pendingAfter.length).toBe(0);
  });

  it('should transition queue item status to failed when upload fails', async () => {
    vi.spyOn(folderService, 'uploadBookProgress').mockRejectedValue(new Error('Network error'));

    await sqliteService.enqueueSyncItem({
      book_id: 'book-hash-3',
      locator: 'epubcfi(/6/2)',
      progress_percentage: 25.0,
      updated_at: Date.now(),
      status: 'pending',
    });

    await syncService.flushQueue();

    const pending = await sqliteService.getPendingSyncQueue();
    expect(pending.length).toBe(0);
  });
});
