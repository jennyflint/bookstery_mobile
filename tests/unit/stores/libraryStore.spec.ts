import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useLibraryStore } from '../../../app/stores/libraryStore';
import { SqliteService } from '../../../app/services/database/SqliteService';
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
});
