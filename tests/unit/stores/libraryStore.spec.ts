import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useLibraryStore } from '../../../app/stores/libraryStore';
import { SqliteService } from '../../../app/services/database/SqliteService';
import { Filesystem, Directory } from '@capacitor/filesystem';
import type { BookRecord } from '../../../app/types';

describe('libraryStore Pinning', () => {
  const book1: BookRecord = {
    id: 'lib-book-1',
    title: 'First Book',
    author: 'Author 1',
    format: 'epub',
    file_path: 'path/1',
    cover_path: null,
    locator: '1',
    progress_percentage: 10,
    total_items: 100,
    last_read_at: 1000,
    updated_at: 1000,
    is_pinned: 0,
    pinned_at: null,
  };

  const book2: BookRecord = {
    id: 'lib-book-2',
    title: 'Second Book',
    author: 'Author 2',
    format: 'pdf',
    file_path: 'path/2',
    cover_path: null,
    locator: '1',
    progress_percentage: 80,
    total_items: 100,
    last_read_at: 5000,
    updated_at: 5000,
    is_pinned: 0,
    pinned_at: null,
  };

  beforeEach(async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    const sqlite = SqliteService.getInstance();
    await sqlite.init();
    await sqlite.upsertBook(book1);
    await sqlite.upsertBook(book2);
  });

  it('should optimistically pin a book and re-sort library books with pinned on top', async () => {
    const store = useLibraryStore();
    await store.loadBooks();

    expect(store.books[0].id).toBe('lib-book-2');
    expect(store.books[1].id).toBe('lib-book-1');

    await store.toggleBookPin('lib-book-1');

    expect(store.books[0].id).toBe('lib-book-1');
    expect(store.books[0].is_pinned).toBe(1);
    expect(typeof store.books[0].pinned_at).toBe('number');

    expect(store.books[1].id).toBe('lib-book-2');
    expect(store.books[1].is_pinned).toBe(0);

    const filtered = store.filteredBooks;
    expect(filtered[0].id).toBe('lib-book-1');
    expect(filtered[1].id).toBe('lib-book-2');
  });

  it('should optimistically unpin a book and return to regular last_read_at sort order', async () => {
    const store = useLibraryStore();
    await store.loadBooks();

    await store.toggleBookPin('lib-book-1');
    expect(store.books[0].id).toBe('lib-book-1');

    await store.toggleBookPin('lib-book-1');
    expect(store.books[0].id).toBe('lib-book-2');
    expect(store.books[1].id).toBe('lib-book-1');
    expect(store.books[1].is_pinned).toBe(0);
    expect(store.books[1].pinned_at).toBeNull();
  });

  describe('removeBook storage reclamation', () => {
    it('should delete physical file from Directory.Data when removing a sandbox book', async () => {
      const sandboxBook: BookRecord = {
        id: 'sandbox-book-1',
        title: 'Sandbox Book',
        author: 'Author',
        format: 'epub',
        file_path: 'books/12345678_book.epub',
        cover_path: null,
        locator: '1',
        progress_percentage: 0,
        total_items: 100,
        last_read_at: 6000,
        updated_at: 6000,
      };

      const sqlite = SqliteService.getInstance();
      await sqlite.upsertBook(sandboxBook);

      const deleteFileSpy = vi.spyOn(Filesystem, 'deleteFile').mockResolvedValue(undefined as any);

      const store = useLibraryStore();
      await store.loadBooks();

      expect(store.books.some((b) => b.id === 'sandbox-book-1')).toBe(true);

      await store.removeBook('sandbox-book-1');

      expect(store.books.some((b) => b.id === 'sandbox-book-1')).toBe(false);
      expect(deleteFileSpy).toHaveBeenCalledWith({
        path: 'books/12345678_book.epub',
        directory: Directory.Data,
      });
    });

    it('should not attempt to delete physical file when removing an external storage book', async () => {
      const externalBook: BookRecord = {
        id: 'external-book-1',
        title: 'External Book',
        author: 'Author',
        format: 'pdf',
        file_path: '/storage/emulated/0/Download/external.pdf',
        cover_path: null,
        locator: '1',
        progress_percentage: 0,
        total_items: 100,
        last_read_at: 7000,
        updated_at: 7000,
      };

      const sqlite = SqliteService.getInstance();
      await sqlite.upsertBook(externalBook);

      const deleteFileSpy = vi.spyOn(Filesystem, 'deleteFile').mockResolvedValue(undefined as any);

      const store = useLibraryStore();
      await store.loadBooks();

      expect(store.books.some((b) => b.id === 'external-book-1')).toBe(true);

      await store.removeBook('external-book-1');

      expect(store.books.some((b) => b.id === 'external-book-1')).toBe(false);
      expect(deleteFileSpy).not.toHaveBeenCalled();
    });
  });
});
