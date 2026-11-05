import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncQueueService } from '../../../app/services/sync/SyncQueueService';
import { SqliteService } from '../../../app/services/database/SqliteService';
import { GoogleAuthService } from '../../../app/services/auth/GoogleAuthService';
import { GoogleDriveFolderService } from '../../../app/services/drive/GoogleDriveFolderService';
import { computeCanonicalBookId } from '../../../app/services/scanner/FileHashService';
import type { BookRecord } from '../../../app/types';

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
    vi.spyOn(folderService, 'fetchManifest').mockResolvedValue(null);

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

  it('pulls remote progress from manifest.json and <bookId>.json when pendingItems is empty and updates local SQLite', async () => {
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(authService, 'getAccessToken').mockResolvedValue('mock-token');

    const bookId = 'canonical-book-1';
    const localBook: BookRecord = {
      id: bookId,
      title: 'Dune',
      author: 'Frank Herbert',
      format: 'epub',
      file_path: 'books/Dune.epub',
      cover_path: null,
      locator: 'chapter-1',
      progress_percentage: 10,
      total_items: 100,
      last_read_at: 1000,
      updated_at: 1000,
      file_size: 500000,
      file_hash: bookId,
    };
    await sqliteService.upsertBook(localBook);

    const pendingBefore = await queueService.peekPending();
    expect(pendingBefore.length).toBe(0);

    vi.spyOn(folderService, 'fetchManifest').mockResolvedValue({
      [bookId]: {
        updatedAt: 5000,
        progressPercentage: 45,
        title: 'Dune',
        fileSize: 500000,
      },
    });

    vi.spyOn(folderService, 'fetchBookProgress').mockResolvedValue({
      bookId,
      locator: 'chapter-12',
      progressPercentage: 45,
      updatedAt: 5000,
    });

    await queueService.processQueue({ immediate: true });

    expect(folderService.fetchManifest).toHaveBeenCalledWith('folder-123', 'mock-token');
    expect(folderService.fetchBookProgress).toHaveBeenCalledWith('folder-123', bookId, 'mock-token');

    const updatedBook = await sqliteService.getBookById(bookId);
    expect(updatedBook).not.toBeNull();
    expect(updatedBook?.locator).toBe('chapter-12');
    expect(updatedBook?.progress_percentage).toBe(45);
    expect(updatedBook?.updated_at).toBe(5000);
  });

  it('fallback matches remote progress by normalized title and fileSize when local book id differs', async () => {
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(authService, 'getAccessToken').mockResolvedValue('mock-token');

    const legacyId = 'legacy-random-id-123';
    const remoteCanonicalId = 'canonical-remote-id-999';

    const localBook: BookRecord = {
      id: legacyId,
      title: 'The Hobbit',
      author: 'J.R.R. Tolkien',
      format: 'epub',
      file_path: 'books/hobbit.epub',
      cover_path: null,
      locator: 'page-1',
      progress_percentage: 5,
      total_items: 200,
      last_read_at: 1000,
      updated_at: 1000,
      file_size: 320000,
      file_hash: legacyId,
    };
    await sqliteService.upsertBook(localBook);

    vi.spyOn(folderService, 'fetchManifest').mockResolvedValue({
      [remoteCanonicalId]: {
        updatedAt: 8000,
        progressPercentage: 75,
        title: 'the hobbit ',
        fileSize: 320000,
      },
    });

    vi.spyOn(folderService, 'fetchBookProgress').mockResolvedValue({
      bookId: remoteCanonicalId,
      locator: 'page-150',
      progressPercentage: 75,
      updatedAt: 8000,
    });

    await queueService.processQueue({ immediate: true });

    const updatedBook = await sqliteService.getBookById(legacyId);
    expect(updatedBook).not.toBeNull();
    expect(updatedBook?.locator).toBe('page-150');
    expect(updatedBook?.progress_percentage).toBe(75);
    expect(updatedBook?.updated_at).toBe(8000);
  });

  it('pullSingleBookProgress pulls newer remote progress for a specific book when opening in reader', async () => {
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(authService, 'getAccessToken').mockResolvedValue('mock-token');

    const bookId = 'book-reader-open';
    const localBook: BookRecord = {
      id: bookId,
      title: 'Clean Code',
      author: 'Robert Martin',
      format: 'epub',
      file_path: 'books/clean.epub',
      cover_path: null,
      locator: 'page-10',
      progress_percentage: 10,
      total_items: 100,
      last_read_at: 2000,
      updated_at: 2000,
      file_size: 150000,
      file_hash: bookId,
    };
    await sqliteService.upsertBook(localBook);

    vi.spyOn(folderService, 'fetchManifest').mockResolvedValue({
      [bookId]: {
        updatedAt: 6000,
        progressPercentage: 60,
        title: 'Clean Code',
        fileSize: 150000,
      },
    });

    vi.spyOn(folderService, 'fetchBookProgress').mockResolvedValue({
      bookId,
      locator: 'page-60',
      progressPercentage: 60,
      updatedAt: 6000,
    });

    const result = await queueService.pullSingleBookProgress(bookId);

    expect(result).toEqual({
      locator: 'page-60',
      progressPercentage: 60,
      updatedAt: 6000,
    });

    const updatedBook = await sqliteService.getBookById(bookId);
    expect(updatedBook?.locator).toBe('page-60');
    expect(updatedBook?.progress_percentage).toBe(60);
    expect(updatedBook?.updated_at).toBe(6000);
  });

  it('computeCanonicalBookId produces identical IDs across different directory paths on different devices', async () => {
    const size = 1048576;
    const paths = [
      '/storage/emulated/0/Download/TheBook.epub',
      '/sdcard/Books/thebook.epub',
      'C:\\Users\\Reader\\Documents\\THEBOOK.EPUB ',
      '/var/mobile/Containers/Data/Application/Books/TheBook.EPUB',
    ];

    const fileNames = paths.map((p) => p.split(/[/\\]/).pop() as string);

    const hashes = await Promise.all(
      fileNames.map((name) => computeCanonicalBookId(name, size)),
    );

    expect(hashes.length).toBe(4);
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[1]).toBe(hashes[2]);
    expect(hashes[2]).toBe(hashes[3]);

    // Distinct size or title produces a different hash
    const differentSizeHash = await computeCanonicalBookId(fileNames[0], size + 1);
    expect(differentSizeHash).not.toBe(hashes[0]);

    const differentNameHash = await computeCanonicalBookId('DifferentBook.epub', size);
    expect(differentNameHash).not.toBe(hashes[0]);
  });
});
