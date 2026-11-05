import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncQueueService } from './SyncQueueService';
import { SqliteService } from '../database/SqliteService';
import { GoogleAuthService } from '../auth/GoogleAuthService';
import { GoogleDriveFolderService } from '../drive/GoogleDriveFolderService';
import { computeCanonicalBookId } from '../scanner/FileHashService';
import type { BookRecord } from '../../types';

describe('SyncQueueService - Cross-Device Reading Progress Synchronization', () => {
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

  it('pulls remote progress from manifest.json and <bookId>.json when pendingItems is empty and updates local SQLite', async () => {
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(authService, 'getAccessToken').mockResolvedValue('mock-token');

    const bookId = 'canonical-book-remote-pull';
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

  it('pulls newer remote progress before initializing the reader engine', async () => {
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(authService, 'getAccessToken').mockResolvedValue('mock-token');

    const bookId = 'book-open-test';
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

    const pulledProgress = await queueService.pullSingleBookProgress(bookId);

    expect(pulledProgress).toEqual({
      locator: 'page-60',
      progressPercentage: 60,
      updatedAt: 6000,
    });

    if (pulledProgress && pulledProgress.updatedAt > localBook.updated_at) {
      localBook.locator = pulledProgress.locator;
      localBook.progress_percentage = pulledProgress.progressPercentage;
      localBook.updated_at = pulledProgress.updatedAt;
    }

    expect(localBook.locator).toBe('page-60');
    expect(localBook.progress_percentage).toBe(60);
    expect(localBook.updated_at).toBe(6000);

    const updatedDbBook = await sqliteService.getBookById(bookId);
    expect(updatedDbBook?.locator).toBe('page-60');
    expect(updatedDbBook?.progress_percentage).toBe(60);
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

    const differentSizeHash = await computeCanonicalBookId(fileNames[0], size + 1);
    expect(differentSizeHash).not.toBe(hashes[0]);

    const differentNameHash = await computeCanonicalBookId('DifferentBook.epub', size);
    expect(differentNameHash).not.toBe(hashes[0]);
  });
});
