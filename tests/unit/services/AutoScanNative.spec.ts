import { describe, it, expect, vi, beforeEach } from 'vitest';

const bridge = vi.hoisted(() => ({
  scanDirectory: vi.fn(),
  copyToAppStorage: vi.fn(),
  generatePdfThumbnail: vi.fn(),
  checkStoragePermission: vi.fn(),
  requestStoragePermission: vi.fn(),
}));

vi.mock('../../../app/services/NativeReaderBridge', () => ({
  NativeReaderBridge: bridge,
  isNativeReaderBridgeAvailable: () => true,
  toWebViewUrl: (path: string) => `http://localhost/_capacitor_file_${path}`,
  fetchBookBytes: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));

import { AutoScanService } from '../../../app/services/scanner/AutoScanService';
import type { BookRecord } from '../../../app/types';

describe('AutoScanService native pipeline', () => {
  let service: AutoScanService;
  let sqlite: {
    init: ReturnType<typeof vi.fn>;
    updateFilePathAndSize: ReturnType<typeof vi.fn>;
    upsertBook: ReturnType<typeof vi.fn>;
    updateCoverPath: ReturnType<typeof vi.fn>;
  };
  let books: BookRecord[];
  let coverQueue: { enqueue: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    books = [];
    sqlite = {
      init: vi.fn().mockResolvedValue(undefined),
      updateFilePathAndSize: vi.fn().mockResolvedValue(undefined),
      upsertBook: vi.fn().mockResolvedValue(undefined),
      updateCoverPath: vi.fn().mockResolvedValue(undefined),
    };
    coverQueue = { enqueue: vi.fn().mockResolvedValue(null) };
    const directoryRepo = {
      getSettings: vi.fn().mockResolvedValue({ id: 1, auto_scan_on_startup: 1, scan_subdirectories: 1, updated_at: 0 }),
      getActiveDirectories: vi.fn().mockResolvedValue([]),
      getDirectoryByUri: vi.fn().mockResolvedValue(null),
      updateLastScanned: vi.fn().mockResolvedValue(undefined),
    };
    bridge.checkStoragePermission.mockResolvedValue({ granted: true });
    service = new AutoScanService(
      directoryRepo as never,
      sqlite as never,
      { getBooks: vi.fn(async () => books) } as never,
      coverQueue as never,
    );
  });

  it('imports scanned books natively and renders PDF thumbnails without moving file data through JS', async () => {
    bridge.scanDirectory.mockResolvedValue({
      files: [
        { uri: 'content://tree/doc/a.pdf', path: '', name: 'a.pdf', extension: 'pdf', size: 100, lastModified: 1 },
        { uri: 'content://tree/doc/b.epub', path: '', name: 'b.epub', extension: 'epub', size: 200, lastModified: 1 },
      ],
    });
    bridge.copyToAppStorage.mockImplementation(async ({ fileName }: { fileName: string }) => ({
      hash: `hash-${fileName}`,
      size: fileName === 'a.pdf' ? 100 : 200,
      path: `/data/files/books/hash-${fileName}`,
      relativePath: `books/hash-${fileName}`,
    }));
    bridge.generatePdfThumbnail.mockResolvedValue({ path: '/data/files/covers/hash-a.pdf.webp', width: 360, height: 480 });

    const summary = await service.scanSingleDirectory('content://tree');

    expect(bridge.scanDirectory).toHaveBeenCalledTimes(1);
    expect(summary.newBooksCount).toBe(2);
    expect(sqlite.upsertBook).toHaveBeenCalledTimes(2);
    expect(bridge.generatePdfThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({ bookId: 'hash-a.pdf', maxWidth: 360 }),
    );
    expect(sqlite.updateCoverPath).toHaveBeenCalledWith(
      'hash-a.pdf',
      'http://localhost/_capacitor_file_/data/files/covers/hash-a.pdf.webp',
    );
    expect(coverQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(coverQueue.enqueue.mock.calls[0][1]).toBe('epub');
  });

  it('skips files that were already imported (same original name and size) without copying them again', async () => {
    books = [
      {
        id: 'abc12345',
        title: 'a',
        author: null,
        format: 'pdf',
        file_path: 'books/abc12345_a.pdf',
        cover_path: null,
        locator: '1',
        progress_percentage: 0,
        total_items: 0,
        last_read_at: 0,
        updated_at: 0,
        file_size: 100,
      } as BookRecord,
    ];
    bridge.scanDirectory.mockResolvedValue({
      files: [{ uri: 'content://tree/doc/a.pdf', path: '', name: 'a.pdf', extension: 'pdf', size: 100, lastModified: 1 }],
    });

    const summary = await service.scanSingleDirectory('content://tree');

    expect(bridge.copyToAppStorage).not.toHaveBeenCalled();
    expect(summary.skippedBooksCount).toBe(1);
    expect(summary.newBooksCount).toBe(0);
  });
});
