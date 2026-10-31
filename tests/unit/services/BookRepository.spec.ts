import { describe, it, expect, beforeEach } from 'vitest';
import { BookRepository } from '../../../app/services/database/BookRepository';
import { SqliteService } from '../../../app/services/database/SqliteService';
import type { BookRecord } from '../../../app/types';

describe('BookRepository', () => {
  let repository: BookRepository;
  let sqliteService: SqliteService;

  const sampleBook1: BookRecord = {
    id: 'book-1',
    title: 'Alpha Book',
    author: 'Author A',
    format: 'epub',
    file_path: 'books/alpha.epub',
    cover_path: null,
    locator: '1',
    progress_percentage: 20,
    total_items: 100,
    last_read_at: 1000,
    updated_at: 1000,
    is_pinned: 0,
    pinned_at: null,
  };

  const sampleBook2: BookRecord = {
    id: 'book-2',
    title: 'Beta Book',
    author: 'Author B',
    format: 'pdf',
    file_path: 'books/beta.pdf',
    cover_path: null,
    locator: '1',
    progress_percentage: 90,
    total_items: 200,
    last_read_at: 50000,
    updated_at: 50000,
    is_pinned: 0,
    pinned_at: null,
  };

  const sampleBook3: BookRecord = {
    id: 'book-3',
    title: 'Zeta Book',
    author: 'Author Z',
    format: 'fb2',
    file_path: 'books/zeta.fb2',
    cover_path: null,
    locator: '1',
    progress_percentage: 5,
    total_items: 150,
    last_read_at: 500,
    updated_at: 500,
    is_pinned: 0,
    pinned_at: null,
  };

  beforeEach(async () => {
    localStorage.clear();
    sqliteService = SqliteService.getInstance();
    await sqliteService.init();
    repository = new BookRepository(sqliteService);
    await repository.migratePinnedColumns();

    await repository.upsertBook(sampleBook1);
    await repository.upsertBook(sampleBook2);
    await repository.upsertBook(sampleBook3);
  });

  it('should toggle is_pinned between 0 and 1 and set or clear pinned_at timestamp', async () => {
    const bookBefore = await repository.getBookById('book-1');
    expect(bookBefore?.is_pinned).toBe(0);
    expect(bookBefore?.pinned_at).toBeNull();

    const isPinnedAfterFirstToggle = await repository.togglePinBook('book-1');
    expect(isPinnedAfterFirstToggle).toBe(true);

    const bookAfterPin = await repository.getBookById('book-1');
    expect(bookAfterPin?.is_pinned).toBe(1);
    expect(typeof bookAfterPin?.pinned_at).toBe('number');
    expect(bookAfterPin?.pinned_at).toBeGreaterThan(0);

    const isPinnedAfterSecondToggle = await repository.togglePinBook('book-1');
    expect(isPinnedAfterSecondToggle).toBe(false);

    const bookAfterUnpin = await repository.getBookById('book-1');
    expect(bookAfterUnpin?.is_pinned).toBe(0);
    expect(bookAfterUnpin?.pinned_at).toBeNull();
  });

  it('should throw an English error when toggling pin status on a non-existent book', async () => {
    await expect(repository.togglePinBook('non-existent-book-id')).rejects.toThrow(
      'Book not found',
    );
  });

  it('should ensure pinned books always appear before unpinned books ordered by pinned_at DESC', async () => {
    await repository.togglePinBook('book-3');
    await new Promise((resolve) => setTimeout(resolve, 50));
    await repository.togglePinBook('book-1');

    const orderedBooks = await repository.getBooks();

    expect(orderedBooks).toHaveLength(3);
    expect(orderedBooks[0].id).toBe('book-1');
    expect(orderedBooks[0].is_pinned).toBe(1);

    expect(orderedBooks[1].id).toBe('book-3');
    expect(orderedBooks[1].is_pinned).toBe(1);

    expect(orderedBooks[2].id).toBe('book-2');
    expect(orderedBooks[2].is_pinned).toBe(0);
    expect(orderedBooks[2].last_read_at).toBe(50000);
  });
});
