import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useLibraryStore } from '~/stores/libraryStore';
import { DeviceFileScannerService } from '~/services/scanner/DeviceFileScannerService';
import { SqliteService } from '~/services/database/SqliteService';
import type { BookRecord } from '~/types';

describe('Duplicate Book Prevention Check', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const baseBook: BookRecord = {
    id: 'hash_kobzar_12345',
    title: 'Kobzar',
    author: 'Taras Shevchenko',
    format: 'epub',
    file_path: 'books/hash_kobzar_12345_kobzar.epub',
    cover_path: null,
    locator: '1',
    progress_percentage: 10,
    total_items: 100,
    last_read_at: 1700000000000,
    updated_at: 1700000000000,
  };

  describe('libraryStore duplicate checks', () => {
    it('should detect duplicate by exact ID', async () => {
      const store = useLibraryStore();
      store.books = [{ ...baseBook }];

      const isDup = store.isDuplicate({ id: 'hash_kobzar_12345' });
      expect(isDup).toBe(true);

      const found = store.findDuplicate({ id: 'hash_kobzar_12345' });
      expect(found).not.toBeNull();
      expect(found?.title).toBe('Kobzar');
    });

    it('should detect duplicate by file_path', async () => {
      const store = useLibraryStore();
      store.books = [{ ...baseBook }];

      const isDup = store.isDuplicate({ file_path: 'books/hash_kobzar_12345_kobzar.epub' });
      expect(isDup).toBe(true);
    });

    it('should detect duplicate by title and author (case-insensitive and trimmed)', async () => {
      const store = useLibraryStore();
      store.books = [{ ...baseBook }];

      const isDup = store.isDuplicate({
        title: '  kobzar  ',
        author: 'taras shevchenko ',
      });
      expect(isDup).toBe(true);
    });

    it('should detect duplicate when both authors are null', async () => {
      const store = useLibraryStore();
      store.books = [
        {
          ...baseBook,
          id: 'hash_anonymous_book',
          title: 'Unknown Tales',
          author: null,
        },
      ];

      const isDup = store.isDuplicate({
        title: 'unknown tales',
        author: null,
      });
      expect(isDup).toBe(true);
    });

    it('should not detect as duplicate when titles differ', async () => {
      const store = useLibraryStore();
      store.books = [{ ...baseBook }];

      const isDup = store.isDuplicate({
        id: 'different_hash',
        title: 'Eneida',
        author: 'Ivan Kotliarevsky',
      });
      expect(isDup).toBe(false);
    });

    it('should reject adding duplicate book in addBook action', async () => {
      const store = useLibraryStore();
      store.books = [{ ...baseBook }];

      const duplicateCandidate: BookRecord = {
        ...baseBook,
        id: 'new_unique_hash',
        title: 'Kobzar',
        author: 'Taras Shevchenko',
      };

      const result = await store.addBook(duplicateCandidate);
      expect(result.success).toBe(false);
      expect(result.isDuplicate).toBe(true);
      expect(result.book?.id).toBe('hash_kobzar_12345');
      expect(store.books.length).toBe(1);
    });

    it('should successfully add non-duplicate book', async () => {
      const store = useLibraryStore();
      store.books = [{ ...baseBook }];

      const newBook: BookRecord = {
        id: 'hash_eneida_9999',
        title: 'Eneida',
        author: 'Ivan Kotliarevsky',
        format: 'pdf',
        file_path: 'books/eneida.pdf',
        cover_path: null,
        locator: '1',
        progress_percentage: 0,
        total_items: 50,
        last_read_at: 1700000000000,
        updated_at: 1700000000000,
      };

      const result = await store.addBook(newBook);
      expect(result.success).toBe(true);
      expect(result.isDuplicate).toBeUndefined();
      expect(store.books.length).toBe(2);
      expect(store.books[0].id).toBe('hash_eneida_9999');
    });
  });

  describe('DeviceFileScannerService duplicate checks', () => {
    const scanner = new DeviceFileScannerService();

    it('should recognize duplicates using existing BookRecord array', () => {
      const existingBooks = [{ ...baseBook }];

      expect(
        scanner.isDuplicate({ id: 'hash_kobzar_12345' }, existingBooks),
      ).toBe(true);

      expect(
        scanner.isDuplicate({ title: 'kobzar', author: 'Taras Shevchenko' }, existingBooks),
      ).toBe(true);

      expect(
        scanner.isDuplicate({ file_path: 'books/hash_kobzar_12345_kobzar.epub' }, existingBooks),
      ).toBe(true);

      expect(
        scanner.isDuplicate({ title: 'Another Book' }, existingBooks),
      ).toBe(false);
    });

    it('should recognize duplicates using Set of IDs', () => {
      const idSet = new Set(['hash_kobzar_12345']);

      expect(
        scanner.isDuplicate({ id: 'hash_kobzar_12345' }, idSet),
      ).toBe(true);

      expect(
        scanner.isDuplicate({ id: 'other_hash' }, idSet),
      ).toBe(false);
    });
  });

  describe('SqliteService duplicate checks', () => {
    it('should find duplicate book in storage', async () => {
      const sqlite = SqliteService.getInstance();
      await sqlite.upsertBook(baseBook);

      const dupById = await sqlite.isDuplicateBook({ id: 'hash_kobzar_12345' });
      expect(dupById).toBe(true);

      const dupByTitle = await sqlite.findDuplicateBook({
        title: '  kobzar ',
        author: 'Taras Shevchenko',
      });
      expect(dupByTitle).not.toBeNull();
      expect(dupByTitle?.id).toBe(baseBook.id);

      const notDup = await sqlite.isDuplicateBook({
        id: 'non_existent_id',
        title: 'Non-existent Title',
      });
      expect(notDup).toBe(false);
    });
  });
});
