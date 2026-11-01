import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const bridge = vi.hoisted(() => ({
  copyToAppStorage: vi.fn(),
  generatePdfThumbnail: vi.fn(),
}));

vi.mock('../../../app/services/NativeReaderBridge', () => ({
  NativeReaderBridge: bridge,
  isNativeReaderBridgeAvailable: () => true,
  toWebViewUrl: (path: string) => `http://localhost/_capacitor_file_${path}`,
  fetchBookBytes: vi.fn().mockResolvedValue(new Uint8Array([1])),
}));

import { Filesystem } from '@capacitor/filesystem';
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
