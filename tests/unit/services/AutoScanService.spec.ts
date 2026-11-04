import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AutoScanService,
  deriveDisplayNameFromUri,
} from '../../../app/services/scanner/AutoScanService';
import * as NativeBridgeModule from '../../../app/services/NativeReaderBridge';
import { FileHashService } from '../../../app/services/scanner/FileHashService';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import type { BookRecord, ScanDirectory, ScannerSettings } from '../../../app/types';

describe('AutoScanService', () => {
  let service: AutoScanService;
  let mockDirectoryRepo: {
    getSettings: ReturnType<typeof vi.fn>;
    getActiveDirectories: ReturnType<typeof vi.fn>;
    getDirectoryByUri: ReturnType<typeof vi.fn>;
    updateLastScanned: ReturnType<typeof vi.fn>;
  };
  let mockSqliteService: {
    init: ReturnType<typeof vi.fn>;
    updateFilePathAndSize: ReturnType<typeof vi.fn>;
    upsertBook: ReturnType<typeof vi.fn>;
  };
  let mockBookRepo: {
    getBooks: ReturnType<typeof vi.fn>;
  };
  let mockCoverQueue: {
    enqueue: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDirectoryRepo = {
      getSettings: vi.fn().mockResolvedValue({
        id: 1,
        auto_scan_on_startup: 1,
        scan_subdirectories: 1,
        updated_at: Date.now(),
      } as ScannerSettings),
      getActiveDirectories: vi.fn().mockResolvedValue([
        {
          id: 1,
          uri: 'Documents/Books',
          display_name: 'Books',
          is_active: 1,
          last_scanned_at: null,
          created_at: Date.now(),
        } as ScanDirectory,
      ]),
      getDirectoryByUri: vi.fn().mockResolvedValue(null),
      updateLastScanned: vi.fn().mockResolvedValue(undefined),
    };

    mockSqliteService = {
      init: vi.fn().mockResolvedValue(undefined),
      updateFilePathAndSize: vi.fn().mockResolvedValue(undefined),
      upsertBook: vi.fn().mockResolvedValue(undefined),
    };

    mockBookRepo = {
      getBooks: vi.fn().mockResolvedValue([]),
    };

    mockCoverQueue = {
      enqueue: vi.fn().mockResolvedValue('tests/fixtures/covers/mock-cover.jpg'),
    };

    service = new AutoScanService(
      mockDirectoryRepo as any,
      mockSqliteService as any,
      mockBookRepo as any,
      mockCoverQueue as any,
    );
  });

  describe('isSupportedFile', () => {
    it('should recognize supported ebook extensions case-insensitively', () => {
      expect(service.isSupportedFile('story.pdf')).toBe(true);
      expect(service.isSupportedFile('NOVEL.PDF')).toBe(true);
      expect(service.isSupportedFile('fantasy.epub')).toBe(true);
      expect(service.isSupportedFile('classic.fb2')).toBe(true);
      expect(service.isSupportedFile('archive.fb2.zip')).toBe(true);
      expect(service.isSupportedFile('TALE.FB2.ZIP')).toBe(true);
    });

    it('should ignore unsupported file formats such as txt, docx, jpg, png', () => {
      expect(service.isSupportedFile('notes.txt')).toBe(false);
      expect(service.isSupportedFile('essay.docx')).toBe(false);
      expect(service.isSupportedFile('cover.jpg')).toBe(false);
      expect(service.isSupportedFile('image.png')).toBe(false);
      expect(service.isSupportedFile('audiobook.mp3')).toBe(false);
      expect(service.isSupportedFile('archive.zip')).toBe(false);
    });
  });

  describe('deriveDisplayNameFromUri', () => {
    it('should extract human-readable display names from SAF content URIs and filesystem paths', () => {
      expect(
        deriveDisplayNameFromUri(
          'content://com.android.externalstorage.documents/tree/primary%3ADownload',
        ),
      ).toBe('Download');
      expect(
        deriveDisplayNameFromUri(
          'content://com.android.externalstorage.documents/tree/primary%3ABooks%2FFiction',
        ),
      ).toBe('Fiction');
      expect(deriveDisplayNameFromUri('/storage/emulated/0/Books')).toBe('Books');
      expect(deriveDisplayNameFromUri('Downloads')).toBe('Downloads');
    });
  });

  describe('Fast Skip Delta Detection', () => {
    it('should fast-skip already registered file paths with identical size without reading file content', async () => {
      const existingBook: BookRecord = {
        id: 'existing-sha-256',
        title: 'Cached Book',
        author: 'Author',
        format: 'pdf',
        file_path: 'Books/existing.pdf',
        cover_path: 'tests/fixtures/covers/existing.jpg',
        locator: '1',
        progress_percentage: 10,
        total_items: 100,
        last_read_at: 1000,
        updated_at: 1000,
        file_size: 4096,
      };

      mockBookRepo.getBooks.mockResolvedValue([existingBook]);

      vi.spyOn(Filesystem, 'readdir').mockResolvedValue({
        files: [
          {
            name: 'existing.pdf',
            type: 'file',
            size: 4096,
            mtime: 2000,
            uri: 'file:///Books/existing.pdf',
          },
          {
            name: 'notes.txt',
            type: 'file',
            size: 500,
            mtime: 2000,
            uri: 'file:///Books/notes.txt',
          },
        ],
      } as any);

      const readFileSpy = vi.spyOn(Filesystem, 'readFile');

      const summary = await service.scanAllActiveDirectories();

      expect(summary.scannedFilesCount).toBe(1);
      expect(summary.skippedBooksCount).toBe(1);
      expect(summary.newBooksCount).toBe(0);
      expect(summary.updatedBooksCount).toBe(0);
      expect(readFileSpy).not.toHaveBeenCalled();
      expect(mockCoverQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('Import & Cover Delegation', () => {
    it('should import new ebook and delegate background cover generation to CoverGenerationQueueService', async () => {
      mockBookRepo.getBooks.mockResolvedValue([]);

      vi.spyOn(Filesystem, 'readdir').mockResolvedValue({
        files: [
          {
            name: 'odyssey.epub',
            type: 'file',
            size: 8192,
            mtime: 12345,
            uri: 'file:///Books/odyssey.epub',
          },
          {
            name: 'photo.jpg',
            type: 'file',
            size: 1024,
            mtime: 12345,
            uri: 'file:///Books/photo.jpg',
          },
        ],
      } as any);

      vi.spyOn(Filesystem, 'readFile').mockResolvedValue({
        data: 'mock-binary-book-content-odyssey',
      });

      const summary = await service.scanAllActiveDirectories();
      await service.waitForPendingCovers();

      expect(summary.scannedFilesCount).toBe(1);
      expect(summary.newBooksCount).toBe(1);
      expect(summary.skippedBooksCount).toBe(0);
      expect(summary.newBookIds.length).toBe(1);

      expect(mockSqliteService.upsertBook).toHaveBeenCalledTimes(1);
      const insertedBook = mockSqliteService.upsertBook.mock.calls[0][0] as BookRecord;
      expect(insertedBook.title).toBe('odyssey');
      expect(insertedBook.format).toBe('epub');
      expect(insertedBook.file_size).toBe(8192);

      expect(mockCoverQueue.enqueue).toHaveBeenCalledTimes(1);
      expect(mockCoverQueue.enqueue).toHaveBeenCalledWith(
        insertedBook.id,
        'epub',
        'mock-binary-book-content-odyssey',
      );
    });

    it('should detect renamed or moved files with matching hash and update path without creating duplicates', async () => {
      const targetHash = 'fixed-matching-hash-12345';
      const existingBook: BookRecord = {
        id: targetHash,
        title: 'Old Title',
        author: 'Homer',
        format: 'pdf',
        file_path: 'Books/old-path.pdf',
        cover_path: 'tests/fixtures/covers/old.jpg',
        locator: '1',
        progress_percentage: 20,
        total_items: 200,
        last_read_at: 1000,
        updated_at: 1000,
        file_size: 1024,
      };

      mockBookRepo.getBooks.mockResolvedValue([existingBook]);

      vi.spyOn(Filesystem, 'readdir').mockResolvedValue({
        files: [
          {
            name: 'renamed-book.pdf',
            type: 'file',
            size: 1024,
            mtime: 3000,
            uri: 'file:///Books/renamed-book.pdf',
          },
        ],
      } as any);

      vi.spyOn(Filesystem, 'readFile').mockResolvedValue({
        data: 'renamed-book-binary-content',
      });

      vi.spyOn(FileHashService, 'calculateSha256').mockResolvedValue(targetHash);

      const summary = await service.scanAllActiveDirectories();

      expect(summary.scannedFilesCount).toBe(1);
      expect(summary.updatedBooksCount).toBe(1);
      expect(summary.newBooksCount).toBe(0);
      expect(mockSqliteService.updateFilePathAndSize).toHaveBeenCalledTimes(1);
      expect(mockSqliteService.updateFilePathAndSize).toHaveBeenCalledWith(
        targetHash,
        'Books/renamed-book.pdf',
        1024,
      );
      expect(mockSqliteService.upsertBook).not.toHaveBeenCalled();
      expect(mockCoverQueue.enqueue).not.toHaveBeenCalled();
    });

    it('should scan active directories even when auto_scan_on_startup is disabled (manual scan support)', async () => {
      mockDirectoryRepo.getSettings.mockResolvedValue({
        id: 1,
        auto_scan_on_startup: 0,
        scan_subdirectories: 1,
        updated_at: 1000,
      });

      vi.spyOn(Filesystem, 'readdir').mockResolvedValue({
        files: [],
      } as any);

      const readdirSpy = vi.spyOn(Filesystem, 'readdir');
      const summary = await service.scanAllActiveDirectories();

      expect(summary.scannedFilesCount).toBe(0);
      expect(readdirSpy).toHaveBeenCalled();
    });
  });

  describe('resolveDirectoryTarget', () => {
    it('should resolve Android SAF tree URIs to ExternalStorage with relative paths', () => {
      const res1 = service.resolveDirectoryTarget(
        'content://com.android.externalstorage.documents/tree/primary%3ADownload',
      );
      expect(res1.directory).toBe(Directory.ExternalStorage);
      expect(res1.path).toBe('Download');

      const res2 = service.resolveDirectoryTarget(
        'content://com.android.externalstorage.documents/tree/primary%3ABooks%2FFiction',
      );
      expect(res2.directory).toBe(Directory.ExternalStorage);
      expect(res2.path).toBe('Books/Fiction');
    });

    it('should resolve raw Android external storage paths', () => {
      const res = service.resolveDirectoryTarget('/storage/emulated/0/Books');
      expect(res.directory).toBe(Directory.ExternalStorage);
      expect(res.path).toBe('Books');
    });

    it('should resolve Documents and Data keyword directories', () => {
      const docRes = service.resolveDirectoryTarget('Documents/Ebooks');
      expect(docRes.directory).toBe(Directory.Documents);
      expect(docRes.path).toBe('Ebooks');

      const dataRes = service.resolveDirectoryTarget('Data/MyBooks');
      expect(dataRes.directory).toBe(Directory.Data);
      expect(dataRes.path).toBe('MyBooks');
    });
  });

  describe('validateDirectoryAccess & Permissions', () => {
    it('should return true when readdir succeeds on resolved SAF target', async () => {
      vi.spyOn(Filesystem, 'readdir').mockResolvedValue({ files: [] });

      const isValid = await service.validateDirectoryAccess(
        'content://com.android.externalstorage.documents/tree/primary%3ABooks',
      );

      expect(isValid).toBe(true);
      expect(Filesystem.readdir).toHaveBeenCalledWith({
        path: 'Books',
        directory: Directory.ExternalStorage,
      });
    });

    it('should return false when readdir throws', async () => {
      vi.spyOn(Filesystem, 'readdir').mockRejectedValue(new Error('Permission denied'));

      const isValid = await service.validateDirectoryAccess(
        'content://com.android.externalstorage.documents/tree/primary%3ANotAccessible',
      );

      expect(isValid).toBe(false);
    });

    it('should check and request permissions when on native platform', async () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      vi.spyOn(Filesystem, 'checkPermissions').mockResolvedValue({ publicStorage: 'prompt' });
      vi.spyOn(Filesystem, 'requestPermissions').mockResolvedValue({ publicStorage: 'granted' });
      vi.spyOn(Filesystem, 'readdir').mockResolvedValue({ files: [] });

      const isValid = await service.validateDirectoryAccess('Documents/Books');

      expect(isValid).toBe(true);
      expect(Filesystem.checkPermissions).toHaveBeenCalled();
      expect(Filesystem.requestPermissions).toHaveBeenCalled();
    });

    it('should return false and abort scan if permissions are denied on native platform', async () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      vi.spyOn(Filesystem, 'checkPermissions').mockResolvedValue({ publicStorage: 'denied' });
      vi.spyOn(Filesystem, 'requestPermissions').mockResolvedValue({ publicStorage: 'denied' });
      const readdirSpy = vi.spyOn(Filesystem, 'readdir');

      const isValid = await service.validateDirectoryAccess('Documents/Books');

      expect(isValid).toBe(false);
      expect(readdirSpy).not.toHaveBeenCalled();
    });
  });

  describe('cleanupDuplicatedSandboxBooks', () => {
    it('should reclaim sandbox storage by updating SQLite file_path and deleting Directory.Data copy', async () => {
      const sandboxedBook: BookRecord = {
        id: 'sandboxed-123',
        title: 'My Book',
        author: 'Author',
        format: 'pdf',
        file_path: 'books/abc12345678_MyBook.pdf',
        cover_path: null,
        locator: '1',
        progress_percentage: 0,
        total_items: 100,
        last_read_at: 1000,
        updated_at: 1000,
        file_size: 5000,
      };

      mockBookRepo.getBooks.mockResolvedValue([sandboxedBook]);
      const deleteFileSpy = vi.spyOn(Filesystem, 'deleteFile').mockResolvedValue(undefined as any);

      const scannedFiles = [
        {
          name: 'MyBook.pdf',
          path: '/storage/emulated/0/Books/MyBook.pdf',
          size: 5000,
          format: 'pdf' as const,
        },
      ];

      const reclaimedCount = await service.cleanupDuplicatedSandboxBooks(scannedFiles);

      expect(reclaimedCount).toBe(1);
      expect(mockSqliteService.updateFilePathAndSize).toHaveBeenCalledWith(
        'sandboxed-123',
        '/storage/emulated/0/Books/MyBook.pdf',
        5000,
      );
      expect(deleteFileSpy).toHaveBeenCalledWith({
        path: 'books/abc12345678_MyBook.pdf',
        directory: Directory.Data,
      });
    });

    it('should ignore non-sandboxed books or books with no matching scanned file', async () => {
      const normalBook: BookRecord = {
        id: 'normal-123',
        title: 'Normal Book',
        author: 'Author',
        format: 'pdf',
        file_path: '/storage/emulated/0/Books/Normal.pdf',
        cover_path: null,
        locator: '1',
        progress_percentage: 0,
        total_items: 100,
        last_read_at: 1000,
        updated_at: 1000,
        file_size: 5000,
      };

      mockBookRepo.getBooks.mockResolvedValue([normalBook]);
      const deleteFileSpy = vi.spyOn(Filesystem, 'deleteFile');

      const reclaimedCount = await service.cleanupDuplicatedSandboxBooks([]);

      expect(reclaimedCount).toBe(0);
      expect(deleteFileSpy).not.toHaveBeenCalled();
    });

    it('should crawl /storage/emulated/0/Download and reclaim matching sandbox books when bridge is available', async () => {
      vi.spyOn(NativeBridgeModule, 'isNativeReaderBridgeAvailable').mockReturnValue(true);

      const sandboxedBook: BookRecord = {
        id: 'download-sandboxed-1',
        title: 'Downloaded Book',
        author: 'Author',
        format: 'epub',
        file_path: 'books/def56789012_DownloadedBook.epub',
        cover_path: null,
        locator: '1',
        progress_percentage: 0,
        total_items: 100,
        last_read_at: 1000,
        updated_at: 1000,
        file_size: 9000,
      };

      mockBookRepo.getBooks.mockResolvedValue([sandboxedBook]);
      const deleteFileSpy = vi.spyOn(Filesystem, 'deleteFile').mockResolvedValue(undefined as any);

      vi.spyOn(service as any, 'crawlDirectoryNative').mockImplementation(async (uri: string) => {
        if (uri === '/storage/emulated/0/Download') {
          return [
            {
              name: 'DownloadedBook.epub',
              path: '/storage/emulated/0/Download/DownloadedBook.epub',
              size: 9000,
              format: 'epub',
            },
          ];
        }
        return [];
      });

      const reclaimedCount = await service.cleanupDuplicatedSandboxBooks();

      expect(reclaimedCount).toBe(1);
      expect(mockSqliteService.updateFilePathAndSize).toHaveBeenCalledWith(
        'download-sandboxed-1',
        '/storage/emulated/0/Download/DownloadedBook.epub',
        9000,
      );
      expect(deleteFileSpy).toHaveBeenCalledWith({
        path: 'books/def56789012_DownloadedBook.epub',
        directory: Directory.Data,
      });
    });

    it('should match sandbox book by filename fallback when file_size differs or is missing', async () => {
      const sandboxedBook: BookRecord = {
        id: 'fallback-sandboxed-1',
        title: 'Fallback Book',
        author: 'Author',
        format: 'pdf',
        file_path: 'books/112233445566_FallbackBook.pdf',
        cover_path: null,
        locator: '1',
        progress_percentage: 0,
        total_items: 100,
        last_read_at: 1000,
        updated_at: 1000,
        file_size: undefined,
      };

      mockBookRepo.getBooks.mockResolvedValue([sandboxedBook]);
      const deleteFileSpy = vi.spyOn(Filesystem, 'deleteFile').mockResolvedValue(undefined as any);

      const scannedFiles = [
        {
          name: 'FallbackBook.pdf',
          path: '/storage/emulated/0/Download/FallbackBook.pdf',
          size: 12345,
          format: 'pdf' as const,
        },
      ];

      const reclaimedCount = await service.cleanupDuplicatedSandboxBooks(scannedFiles);

      expect(reclaimedCount).toBe(1);
      expect(mockSqliteService.updateFilePathAndSize).toHaveBeenCalledWith(
        'fallback-sandboxed-1',
        '/storage/emulated/0/Download/FallbackBook.pdf',
        12345,
      );
      expect(deleteFileSpy).toHaveBeenCalledWith({
        path: 'books/112233445566_FallbackBook.pdf',
        directory: Directory.Data,
      });
    });

    it('should delete orphaned files in Directory.Data/books not referenced by any book', async () => {
      const validSandboxBook: BookRecord = {
        id: 'valid-book-1',
        title: 'Valid Book',
        author: 'Author',
        format: 'epub',
        file_path: 'books/active_valid.epub',
        cover_path: null,
        locator: '1',
        progress_percentage: 0,
        total_items: 100,
        last_read_at: 1000,
        updated_at: 1000,
      };

      mockBookRepo.getBooks.mockResolvedValue([validSandboxBook]);

      vi.spyOn(Filesystem, 'readdir').mockImplementation(async (options: any) => {
        if (options?.path === 'books' && options?.directory === Directory.Data) {
          return {
            files: [
              { name: 'active_valid.epub', type: 'file' },
              { name: 'orphaned_12345_old.epub', type: 'file' },
            ],
          } as any;
        }
        return { files: [] } as any;
      });

      const deleteFileSpy = vi.spyOn(Filesystem, 'deleteFile').mockResolvedValue(undefined as any);

      const reclaimedCount = await service.cleanupDuplicatedSandboxBooks([]);

      expect(reclaimedCount).toBe(1);
      expect(deleteFileSpy).toHaveBeenCalledWith({
        path: 'books/orphaned_12345_old.epub',
        directory: Directory.Data,
      });
      expect(deleteFileSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ path: 'books/active_valid.epub' }),
      );
    });
  });
});
