import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncQueueService } from '../../../app/services/sync/SyncQueueService';
import { SqliteService } from '../../../app/services/database/SqliteService';
import { GoogleAuthService } from '../../../app/services/auth/GoogleAuthService';
import { GoogleDriveFolderService } from '../../../app/services/drive/GoogleDriveFolderService';

describe('SyncQueueService', () => {
  let sqliteService: SqliteService;
  let authService: GoogleAuthService;
  let folderService: GoogleDriveFolderService;
  let queueService: SyncQueueService;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    sqliteService = new SqliteService();
    authService = new GoogleAuthService(sqliteService);
    folderService = new GoogleDriveFolderService(sqliteService, authService);

    vi.spyOn(folderService, 'ensureStorageFolder').mockResolvedValue('folder-123');
    vi.spyOn(folderService, 'uploadBookProgress').mockResolvedValue();
    vi.spyOn(folderService, 'fetchBookProgress').mockResolvedValue(null);

    queueService = new SyncQueueService(sqliteService, authService, folderService);
  });

  afterEach(() => {
    queueService.destroy();
    vi.useRealTimers();
  });

  it('should prevent network requests when user is unauthenticated', async () => {
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(false);

    await queueService.enqueue('book-unauth', 'loc-1', 10.0);
    await queueService.processQueue();

    expect(folderService.uploadBookProgress).not.toHaveBeenCalled();
    expect(folderService.ensureStorageFolder).not.toHaveBeenCalled();

    const pending = await sqliteService.getPendingSyncQueue();
    expect(pending.length).toBe(1);
    expect(pending[0].status).toBe('pending');
  });

  it('should coalesce rapid page turns using debounce timer into a single remote push', async () => {
    vi.useFakeTimers();
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(authService, 'getAccessToken').mockResolvedValue('valid-token');

    await queueService.queueWithDebounce('book-rapid', 'page-1', 5.0, 4000);
    vi.advanceTimersByTime(2000);

    await queueService.queueWithDebounce('book-rapid', 'page-2', 10.0, 4000);
    vi.advanceTimersByTime(2000);

    await queueService.queueWithDebounce('book-rapid', 'page-3', 15.0, 4000);

    expect(folderService.uploadBookProgress).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4000);
    await vi.runAllTimersAsync();

    expect(folderService.uploadBookProgress).toHaveBeenCalledTimes(3);

    const pendingAfter = await sqliteService.getPendingSyncQueue();
    expect(pendingAfter.length).toBe(0);
    vi.useRealTimers();
  });

  it('should transition outbox queue from pending to synced upon processing', async () => {
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(authService, 'getAccessToken').mockResolvedValue('mock-token');

    await sqliteService.enqueueSyncItem({
      book_id: 'book-pending-1',
      locator: 'chapter-5',
      progress_percentage: 42.0,
      updated_at: Date.now(),
      status: 'pending',
    });

    const pendingBefore = await queueService.peekPending();
    expect(pendingBefore.length).toBe(1);
    expect(pendingBefore[0].status).toBe('pending');

    await queueService.processQueue({ immediate: true });

    expect(folderService.uploadBookProgress).toHaveBeenCalledWith(
      'folder-123',
      'book-pending-1',
      expect.objectContaining({
        bookId: 'book-pending-1',
        locator: 'chapter-5',
        progressPercentage: 42.0,
      }),
      'mock-token',
    );

    const pendingAfter = await queueService.peekPending();
    expect(pendingAfter.length).toBe(0);
  });

  it('should mark items failed when upload encounters an error', async () => {
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(authService, 'getAccessToken').mockResolvedValue('mock-token');
    vi.spyOn(folderService, 'uploadBookProgress').mockRejectedValue(new Error('Network error'));

    await sqliteService.enqueueSyncItem({
      book_id: 'book-fail-1',
      locator: 'chapter-1',
      progress_percentage: 10.0,
      updated_at: Date.now(),
      status: 'pending',
    });

    await queueService.processQueue({ immediate: true });

    const pending = await sqliteService.getPendingSyncQueue();
    expect(pending.length).toBe(0);
  });
});
