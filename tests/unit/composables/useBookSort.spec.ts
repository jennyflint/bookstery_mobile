import { describe, it, expect, beforeEach } from 'vitest';
import { sortBooks, useBookSort } from '../../../app/composables/useBookSort';
import type { BookRecord } from '../../../app/types';

describe('useBookSort & sortBooks', () => {
  const sampleBooks: BookRecord[] = [
    {
      id: 'book-1',
      title: 'Кобзар',
      author: 'Тарас Шевченко',
      format: 'pdf',
      file_path: 'books/kobzar.pdf',
      cover_path: null,
      locator: '1',
      progress_percentage: 20,
      total_items: 200,
      last_read_at: 1000,
      updated_at: 2000,
      created_at: 1000,
      file_size: 5000,
      is_pinned: 0,
    },
    {
      id: 'book-2',
      title: 'Енеїда',
      author: 'Іван Котляревський',
      format: 'epub',
      file_path: 'books/eneida.epub',
      cover_path: null,
      locator: '1',
      progress_percentage: 85,
      total_items: 150,
      last_read_at: 5000,
      updated_at: 6000,
      created_at: 5000,
      file_size: 15000,
      is_pinned: 0,
    },
    {
      id: 'book-3',
      title: 'Тіні забутих предків',
      author: 'Михайло Коцюбинський',
      format: 'fb2',
      file_path: 'books/tini.fb2',
      cover_path: null,
      locator: '1',
      progress_percentage: 0,
      total_items: 100,
      last_read_at: 0, // unread
      updated_at: 3000,
      created_at: 3000,
      file_size: 2000,
      is_pinned: 0,
    },
    {
      id: 'book-4',
      title: 'Анонімна книга',
      author: null, // missing author
      format: 'epub',
      file_path: 'books/anon.epub',
      cover_path: null,
      locator: '1',
      progress_percentage: 50,
      total_items: 80,
      last_read_at: 3000,
      updated_at: 4000,
      created_at: 4000,
      file_size: undefined, // missing file size
      is_pinned: 0,
    },
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  describe('Pure sortBooks function', () => {
    it('does not mutate the original array', () => {
      const copy = [...sampleBooks];
      const sorted = sortBooks(sampleBooks, 'title', 'asc', 'uk');
      expect(sorted).not.toBe(sampleBooks);
      expect(sampleBooks).toEqual(copy);
    });

    it('sorts by lastReadAt desc (recently read first, unread at bottom)', () => {
      const sorted = sortBooks(sampleBooks, 'lastReadAt', 'desc', 'uk');
      expect(sorted.map((b) => b.id)).toEqual(['book-2', 'book-4', 'book-1', 'book-3']);
      expect(sorted[sorted.length - 1].id).toBe('book-3'); // unread at bottom
    });

    it('sorts by lastReadAt asc (oldest read first, unread at bottom)', () => {
      const sorted = sortBooks(sampleBooks, 'lastReadAt', 'asc', 'uk');
      expect(sorted.map((b) => b.id)).toEqual(['book-1', 'book-4', 'book-2', 'book-3']);
      expect(sorted[sorted.length - 1].id).toBe('book-3'); // unread at bottom
    });

    it('sorts by createdAt desc and asc', () => {
      const desc = sortBooks(sampleBooks, 'createdAt', 'desc', 'uk');
      expect(desc.map((b) => b.id)).toEqual(['book-2', 'book-4', 'book-3', 'book-1']);

      const asc = sortBooks(sampleBooks, 'createdAt', 'asc', 'uk');
      expect(asc.map((b) => b.id)).toEqual(['book-1', 'book-3', 'book-4', 'book-2']);
    });

    it('sorts alphabetically by title using Ukrainian collation', () => {
      const asc = sortBooks(sampleBooks, 'title', 'asc', 'uk');
      // Ukrainian alphabetical: Анонімна книга, Енеїда, Кобзар, Тіні забутих предків
      expect(asc.map((b) => b.title)).toEqual([
        'Анонімна книга',
        'Енеїда',
        'Кобзар',
        'Тіні забутих предків',
      ]);

      const desc = sortBooks(sampleBooks, 'title', 'desc', 'uk');
      expect(desc.map((b) => b.title)).toEqual([
        'Тіні забутих предків',
        'Кобзар',
        'Енеїда',
        'Анонімна книга',
      ]);
    });

    it('sorts by author placing books without author at the end', () => {
      const asc = sortBooks(sampleBooks, 'author', 'asc', 'uk');
      // Authors: Іван Котляревський, Михайло Коцюбинський, Тарас Шевченко, then null author
      expect(asc.map((b) => b.id)).toEqual(['book-2', 'book-3', 'book-1', 'book-4']);
      expect(asc[asc.length - 1].author).toBeNull();

      const desc = sortBooks(sampleBooks, 'author', 'desc', 'uk');
      // Reverse author order, but missing author remains at the bottom
      expect(desc.map((b) => b.id)).toEqual(['book-1', 'book-3', 'book-2', 'book-4']);
      expect(desc[desc.length - 1].author).toBeNull();
    });

    it('sorts by format with secondary sort by title', () => {
      const asc = sortBooks(sampleBooks, 'format', 'asc', 'uk');
      // epub (book-4: Анонімна книга, book-2: Енеїда), fb2 (book-3), pdf (book-1)
      expect(asc.map((b) => b.id)).toEqual(['book-4', 'book-2', 'book-3', 'book-1']);
    });

    it('sorts by progress percentage', () => {
      const asc = sortBooks(sampleBooks, 'progress', 'asc', 'uk');
      expect(asc.map((b) => b.progress_percentage)).toEqual([0, 20, 50, 85]);

      const desc = sortBooks(sampleBooks, 'progress', 'desc', 'uk');
      expect(desc.map((b) => b.progress_percentage)).toEqual([85, 50, 20, 0]);
    });

    it('sorts by fileSize placing missing size at the bottom', () => {
      const asc = sortBooks(sampleBooks, 'fileSize', 'asc', 'uk');
      // Sizes: 2000, 5000, 15000, undefined at bottom
      expect(asc.map((b) => b.id)).toEqual(['book-3', 'book-1', 'book-2', 'book-4']);

      const desc = sortBooks(sampleBooks, 'fileSize', 'desc', 'uk');
      // Sizes: 15000, 5000, 2000, undefined at bottom
      expect(desc.map((b) => b.id)).toEqual(['book-2', 'book-1', 'book-3', 'book-4']);
    });

    it('keeps pinned books at the top when keepPinnedOnTop is true', () => {
      const booksWithPin: BookRecord[] = [
        { ...sampleBooks[0], is_pinned: 0 },
        { ...sampleBooks[1], is_pinned: 1, pinned_at: 100 },
        { ...sampleBooks[2], is_pinned: 0 },
      ];

      const sorted = sortBooks(booksWithPin, 'title', 'asc', 'uk', { keepPinnedOnTop: true });
      expect(sorted[0].id).toBe('book-2'); // pinned book on top
    });
  });

  describe('useBookSort composable', () => {
    it('initializes with default lastReadAt desc when storage is empty', () => {
      const { sortField, sortOrder } = useBookSort('test_sort');
      expect(sortField.value).toBe('lastReadAt');
      expect(sortOrder.value).toBe('desc');
    });

    it('loads saved sort preferences from localStorage', () => {
      localStorage.setItem('test_sort_field', 'title');
      localStorage.setItem('test_sort_order', 'asc');

      const { sortField, sortOrder } = useBookSort('test_sort');
      expect(sortField.value).toBe('title');
      expect(sortOrder.value).toBe('asc');
    });

    it('persists changes to localStorage when updated', () => {
      const { sortField, setSortField, toggleSortOrder } = useBookSort('test_sort');

      setSortField('author');
      expect(sortField.value).toBe('author');
      expect(localStorage.getItem('test_sort_field')).toBe('author');

      toggleSortOrder();
      expect(localStorage.getItem('test_sort_order')).toBe('desc');
    });

    it('toggles direction when re-selecting the same field', () => {
      const { sortField, sortOrder, setSortField } = useBookSort('test_sort');
      expect(sortField.value).toBe('lastReadAt');
      expect(sortOrder.value).toBe('desc');

      setSortField('lastReadAt');
      expect(sortOrder.value).toBe('asc');

      setSortField('lastReadAt');
      expect(sortOrder.value).toBe('desc');
    });
  });
});
