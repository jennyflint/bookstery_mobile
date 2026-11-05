import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const bridge = vi.hoisted(() => ({
  copyToAppStorage: vi.fn(),
  generatePdfThumbnail: vi.fn(),
  checkStoragePermission: vi.fn().mockResolvedValue({ granted: true }),
  requestStoragePermission: vi.fn().mockResolvedValue({ granted: true }),
  scanDirectory: vi.fn().mockResolvedValue({ files: [] }),
}));

vi.mock('../../../app/services/NativeReaderBridge', () => ({
  NativeReaderBridge: bridge,
  isNativeReaderBridgeAvailable: () => true,
  toWebViewUrl: (path: string) => `http://localhost/_capacitor_file_${path}`,
  fetchBookBytes: vi.fn().mockResolvedValue(new Uint8Array([1])),
}));

import { Filesystem, Directory } from '@capacitor/filesystem';
import { useDeviceScanner } from '../../../app/composables/useDeviceScanner';
import { useLibraryStore } from '../../../app/stores/libraryStore';

describe('useDeviceScanner native import of picked files', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('copies a large picked PDF natively without reading its content into JS', async () => {
    bridge.copyToAppStorage.mockResolvedValue({
      hash: 'h1',
      size: 60 * 1024 * 1024,
      path: '/data/files/books/h1_Big.pdf',
      relativePath: 'books/h1_Big.pdf',
    });
    bridge.generatePdfThumbnail.mockResolvedValue({ path: '/data/files/covers/h1.webp', width: 360, height: 480 });
    const readSpy = vi.spyOn(Filesystem, 'readFile');
    const writeSpy = vi.spyOn(Filesystem, 'writeFile');

    const scanner = useDeviceScanner();
    const result = await scanner.importNativeFiles([
      { name: 'Big.pdf', path: 'content://media/external/file/1', size: 60 * 1024 * 1024 },
    ]);

    expect(result).toEqual({ importedCount: 1, duplicates: [], failed: [] });
    expect(bridge.copyToAppStorage).toHaveBeenCalledWith({
      uriOrPath: 'content://media/external/file/1',
      fileName: 'Big.pdf',
      destDir: 'books',
    });
    expect(readSpy).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();

    const store = useLibraryStore();
    expect(store.books[0]).toMatchObject({ id: 'h1', file_path: 'books/h1_Big.pdf', format: 'pdf' });
  });

  it('scans Download directory and maps files without duplicates', async () => {
    bridge.checkStoragePermission.mockResolvedValue({ granted: true });
    bridge.scanDirectory.mockResolvedValue({
      files: [
        {
          name: 'Novel.epub',
          path: '/storage/emulated/0/Download/Novel.epub',
          uri: 'file:///storage/emulated/0/Download/Novel.epub',
          extension: 'epub',
          size: 2048,
          lastModified: 1000,
        },
        {
          name: 'AlreadyHere.pdf',
          path: '/storage/emulated/0/Download/AlreadyHere.pdf',
          uri: 'file:///storage/emulated/0/Download/AlreadyHere.pdf',
          extension: 'pdf',
          size: 4096,
          lastModified: 1000,
        },
      ],
    });

    const store = useLibraryStore();
    await store.addBook({
      id: 'existing-id',
      title: 'AlreadyHere',
      author: null,
      format: 'pdf',
      file_path: 'books/existing.pdf',
      cover_path: null,
      locator: '',
      progress_percentage: 0,
      total_items: 0,
      last_read_at: 1000,
      updated_at: 1000,
    });

    const scanner = useDeviceScanner();
    const files = await scanner.scanDevice();

    expect(bridge.scanDirectory).toHaveBeenCalledWith({
      uriOrPath: '/storage/emulated/0/Download',
      extensions: [
        'pdf',
        'epub',
        'fb2',
        'fb2.zip',
        'mobi',
        'azw',
        'azw3',
        'kf8',
      ],
    });

    const novel = files.find((f) => f.name === 'Novel.epub');
    expect(novel).toBeDefined();
    expect(novel?.isDuplicate).toBe(false);
    expect(novel?.format).toBe('epub');

    const duplicate = files.find((f) => f.name === 'AlreadyHere.pdf');
    expect(duplicate).toBeDefined();
    expect(duplicate?.isDuplicate).toBe(true);
  });

  it('requests storage permission if not initially granted when scanning', async () => {
    bridge.checkStoragePermission.mockResolvedValueOnce({ granted: false });
    bridge.requestStoragePermission.mockResolvedValueOnce({ granted: true });
    bridge.scanDirectory.mockResolvedValue({ files: [] });

    const scanner = useDeviceScanner();
    await scanner.scanDevice();

    expect(bridge.checkStoragePermission).toHaveBeenCalled();
    expect(bridge.requestStoragePermission).toHaveBeenCalled();
    expect(bridge.scanDirectory).toHaveBeenCalled();
    expect(scanner.hasStoragePermissionError.value).toBe(false);
  });

  it('sets hasStoragePermissionError when permission is denied', async () => {
    bridge.checkStoragePermission.mockResolvedValueOnce({ granted: false });
    bridge.requestStoragePermission.mockResolvedValueOnce({ granted: false });

    const scanner = useDeviceScanner();
    await scanner.scanDevice();

    expect(scanner.hasStoragePermissionError.value).toBe(true);
    expect(bridge.scanDirectory).not.toHaveBeenCalled();
  });

  it('imports files from Download in-place without calling copyToAppStorage when file.path is absolute', async () => {
    bridge.generatePdfThumbnail.mockResolvedValue({
      path: '/data/files/covers/thumb.webp',
      width: 360,
      height: 480,
    });

    const scanner = useDeviceScanner();
    const filesToImport = [
      {
        name: 'Book.pdf',
        path: '/storage/emulated/0/Download/Book.pdf',
        size: 5000,
        format: 'pdf' as const,
        isDuplicate: false,
      },
    ];

    const result = await scanner.importFiles(filesToImport);

    expect(result.importedCount).toBe(1);
    expect(result.duplicateCount).toBe(0);
    expect(bridge.copyToAppStorage).not.toHaveBeenCalled();

    const store = useLibraryStore();
    expect(store.books.length).toBe(1);
    expect(store.books[0].title).toBe('Book');
    expect(store.books[0].file_path).toBe('/storage/emulated/0/Download/Book.pdf');
    expect(store.books[0].file_size).toBe(5000);
  });

  it('imports files from Download in-place without calling copyToAppStorage when file.path is file:// URI', async () => {
    const scanner = useDeviceScanner();
    const filesToImport = [
      {
        name: 'Tale.epub',
        path: 'file:///storage/emulated/0/Download/Tale.epub',
        size: 3000,
        format: 'epub' as const,
        isDuplicate: false,
      },
    ];

    const result = await scanner.importFiles(filesToImport);

    expect(result.importedCount).toBe(1);
    expect(result.duplicateCount).toBe(0);
    expect(bridge.copyToAppStorage).not.toHaveBeenCalled();

    const store = useLibraryStore();
    expect(store.books.length).toBe(1);
    expect(store.books[0].title).toBe('Tale');
    expect(store.books[0].file_path).toBe('/storage/emulated/0/Download/Tale.epub');
    expect(store.books[0].file_size).toBe(3000);
  });

  it('migrates existing sandbox copy to in-place storage and deletes redundant sandbox file when importing from Download', async () => {
    const deleteSpy = vi.spyOn(Filesystem, 'deleteFile').mockResolvedValue(undefined as any);
    const store = useLibraryStore();
    await store.addBook({
      id: 'existing-sandbox-id',
      title: 'OldBook',
      author: null,
      format: 'pdf',
      file_path: 'books/12345678_OldBook.pdf',
      cover_path: null,
      locator: '1',
      progress_percentage: 0,
      total_items: 10,
      last_read_at: 1000,
      updated_at: 1000,
      file_size: 4000,
    });

    const scanner = useDeviceScanner();
    const filesToImport = [
      {
        name: 'OldBook.pdf',
        path: '/storage/emulated/0/Download/OldBook.pdf',
        size: 4000,
        format: 'pdf' as const,
        isDuplicate: false,
      },
    ];

    const result = await scanner.importFiles(filesToImport);

    expect(result.duplicateCount).toBe(1);
    expect(bridge.copyToAppStorage).not.toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalledWith({
      path: 'books/12345678_OldBook.pdf',
      directory: Directory.Data,
    });
    expect(store.books[0].file_path).toBe('/storage/emulated/0/Download/OldBook.pdf');
  });

  it('reports files that fail to import instead of failing silently', async () => {
    bridge.copyToAppStorage.mockRejectedValue(new Error('No space left on device'));

    const scanner = useDeviceScanner();
    const result = await scanner.importNativeFiles([
      { name: 'Huge.pdf', path: 'content://media/external/file/2', size: 1 },
    ]);

    expect(result.importedCount).toBe(0);
    expect(result.failed).toEqual(['Huge.pdf']);
  });
});
