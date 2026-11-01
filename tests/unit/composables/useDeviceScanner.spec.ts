import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDeviceScanner } from '../../../app/composables/useDeviceScanner';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { useLibraryStore } from '../../../app/stores/libraryStore';

describe('useDeviceScanner', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should import book file directly to Directory.Data and add to libraryStore', async () => {
    vi.spyOn(Filesystem, 'writeFile').mockResolvedValue({ uri: 'file:///data/books/mock.epub' });

    const scanner = useDeviceScanner();
    const fakeContent = new Blob(['sample-book-content'], { type: 'application/epub+zip' });
    const fakeFile = new File([fakeContent], 'Odyssey.epub', { type: 'application/epub+zip' });

    const result = await scanner.importBook(fakeFile);

    expect(result.success).toBe(true);
    expect(result.book?.title).toBe('Odyssey');
    expect(result.book?.format).toBe('epub');
    expect(Filesystem.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: Directory.Data,
        recursive: true,
      }),
    );

    const store = useLibraryStore();
    expect(store.books.length).toBe(1);
    expect(store.books[0].title).toBe('Odyssey');
  });

  it('should detect duplicate when importing existing book file', async () => {
    const scanner = useDeviceScanner();
    const store = useLibraryStore();
    await store.addBook({
      id: 'existing-id',
      title: 'Odyssey',
      author: null,
      format: 'epub',
      file_path: 'books/existing.epub',
      cover_path: null,
      locator: '',
      progress_percentage: 0,
      total_items: 0,
      last_read_at: 1000,
      updated_at: 1000,
    });

    const fakeContent = new Blob(['sample-book-content'], { type: 'application/epub+zip' });
    const fakeFile = new File([fakeContent], 'Odyssey.epub', { type: 'application/epub+zip' });

    const result = await scanner.importBook(fakeFile);

    expect(result.success).toBe(false);
    expect(result.isDuplicate).toBe(true);
    expect(scanner.duplicateNotice.value).toBe('Odyssey');
  });

  it('should import native picked files directly to Directory.Data', async () => {
    vi.spyOn(Filesystem, 'writeFile').mockResolvedValue({ uri: 'file:///data/books/mock.pdf' });

    const scanner = useDeviceScanner();
    const nativeFiles = [
      {
        name: 'WarAndPeace.pdf',
        data: 'bW9jay1wZGYtY29udGVudA==',
        size: 1024,
      },
    ];

    const result = await scanner.importNativeFiles(nativeFiles);

    expect(result.importedCount).toBe(1);
    expect(result.duplicates.length).toBe(0);

    const store = useLibraryStore();
    expect(store.books.length).toBe(1);
    expect(store.books[0].title).toBe('WarAndPeace');
    expect(store.books[0].format).toBe('pdf');
    expect(Filesystem.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: Directory.Data,
        recursive: true,
      }),
    );
  });
});
