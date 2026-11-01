import { ref, watch, type Ref } from 'vue';
import type { BookRecord, BookSortField, SortOrder, BookSortOption } from '../types';

export const BOOK_SORT_OPTIONS: BookSortOption[] = [
  { field: 'lastReadAt', labelKey: 'sort.lastRead' },
  { field: 'createdAt', labelKey: 'sort.dateAdded' },
  { field: 'title', labelKey: 'sort.title' },
  { field: 'author', labelKey: 'sort.author' },
  { field: 'format', labelKey: 'sort.format' },
  { field: 'progress', labelKey: 'sort.progress' },
  { field: 'fileSize', labelKey: 'sort.fileSize' },
];

export interface SortBooksOptions {
  keepPinnedOnTop?: boolean;
}

/**
 * Pure function to sort books without mutating the original array.
 */
export function sortBooks(
  books: BookRecord[],
  field: BookSortField,
  order: SortOrder,
  locale: string = 'uk',
  options: SortBooksOptions = {},
): BookRecord[] {
  const keepPinnedOnTop = options.keepPinnedOnTop ?? true;
  const collator = new Intl.Collator(locale || 'uk', { numeric: true, sensitivity: 'base' });

  return [...books].sort((a, b) => {
    // 1. Keep pinned books at the top if requested
    if (keepPinnedOnTop) {
      const pinA = a.is_pinned ?? 0;
      const pinB = b.is_pinned ?? 0;
      if (pinA !== pinB) {
        return pinB - pinA;
      }
      if (pinA === 1) {
        const timeA = a.pinned_at ?? 0;
        const timeB = b.pinned_at ?? 0;
        if (timeA !== timeB && field === 'lastReadAt') {
          return timeB - timeA;
        }
      }
    }

    // 2. Field-specific comparison
    switch (field) {
      case 'lastReadAt': {
        const readA = a.last_read_at ?? 0;
        const readB = b.last_read_at ?? 0;
        const hasReadA = readA > 0;
        const hasReadB = readB > 0;

        // Unread books are always placed at the bottom
        if (hasReadA && !hasReadB) return -1;
        if (!hasReadA && hasReadB) return 1;
        if (!hasReadA && !hasReadB) {
          return collator.compare(a.title || '', b.title || '');
        }

        return order === 'asc' ? readA - readB : readB - readA;
      }

      case 'createdAt': {
        const dateA = a.created_at ?? a.updated_at ?? 0;
        const dateB = b.created_at ?? b.updated_at ?? 0;
        const diff = order === 'asc' ? dateA - dateB : dateB - dateA;
        if (diff !== 0) return diff;
        return collator.compare(a.title || '', b.title || '');
      }

      case 'title': {
        const cmp = collator.compare(a.title || '', b.title || '');
        return order === 'asc' ? cmp : -cmp;
      }

      case 'author': {
        const authorA = a.author ? a.author.trim() : '';
        const authorB = b.author ? b.author.trim() : '';
        const hasA = authorA.length > 0;
        const hasB = authorB.length > 0;

        // Missing authors are placed at the bottom
        if (hasA && !hasB) return -1;
        if (!hasA && hasB) return 1;
        if (!hasA && !hasB) {
          return collator.compare(a.title || '', b.title || '');
        }

        const cmp = collator.compare(authorA, authorB);
        if (cmp !== 0) {
          return order === 'asc' ? cmp : -cmp;
        }
        return collator.compare(a.title || '', b.title || '');
      }

      case 'format': {
        const formatA = a.format || '';
        const formatB = b.format || '';
        const cmp = collator.compare(formatA, formatB);
        if (cmp !== 0) {
          return order === 'asc' ? cmp : -cmp;
        }
        return collator.compare(a.title || '', b.title || '');
      }

      case 'progress': {
        const progA = a.progress_percentage ?? 0;
        const progB = b.progress_percentage ?? 0;
        const diff = order === 'asc' ? progA - progB : progB - progA;
        if (diff !== 0) return diff;
        return collator.compare(a.title || '', b.title || '');
      }

      case 'fileSize': {
        const sizeA = typeof a.file_size === 'number' && a.file_size > 0 ? a.file_size : null;
        const sizeB = typeof b.file_size === 'number' && b.file_size > 0 ? b.file_size : null;

        // Missing file size placed at the bottom
        if (sizeA !== null && sizeB === null) return -1;
        if (sizeA === null && sizeB !== null) return 1;
        if (sizeA === null && sizeB === null) {
          return collator.compare(a.title || '', b.title || '');
        }

        const diff = order === 'asc' ? sizeA - sizeB : sizeB - sizeA;
        if (diff !== 0) return diff;
        return collator.compare(a.title || '', b.title || '');
      }

      default:
        return 0;
    }
  });
}

export function useBookSort(
  storageKey: string = 'bookstery_book_sort',
  initialField: BookSortField = 'lastReadAt',
  initialOrder: SortOrder = 'desc',
) {
  const getStoredField = (): BookSortField => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return initialField;
    }
    try {
      const stored = localStorage.getItem(`${storageKey}_field`);
      if (
        stored &&
        BOOK_SORT_OPTIONS.some((opt) => opt.field === stored)
      ) {
        return stored as BookSortField;
      }
    } catch {}
    return initialField;
  };

  const getStoredOrder = (): SortOrder => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return initialOrder;
    }
    try {
      const stored = localStorage.getItem(`${storageKey}_order`);
      if (stored === 'asc' || stored === 'desc') {
        return stored;
      }
    } catch {}
    return initialOrder;
  };

  const sortField: Ref<BookSortField> = ref(getStoredField());
  const sortOrder: Ref<SortOrder> = ref(getStoredOrder());

  const persist = (): void => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      localStorage.setItem(`${storageKey}_field`, sortField.value);
      localStorage.setItem(`${storageKey}_order`, sortOrder.value);
    } catch {}
  };

  watch([sortField, sortOrder], () => {
    persist();
  });

  const toggleSortOrder = (): void => {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
    persist();
  };

  const setSortField = (field: BookSortField, defaultDirection?: SortOrder): void => {
    if (sortField.value === field) {
      toggleSortOrder();
      return;
    }

    sortField.value = field;
    if (defaultDirection) {
      sortOrder.value = defaultDirection;
    } else {
      // Default to ascending for alphabetical fields, descending for dates/size/progress
      if (field === 'title' || field === 'author' || field === 'format') {
        sortOrder.value = 'asc';
      } else {
        sortOrder.value = 'desc';
      }
    }
    persist();
  };

  const applySort = (
    books: BookRecord[],
    locale: string = 'uk',
    options?: SortBooksOptions,
  ): BookRecord[] => {
    return sortBooks(books, sortField.value, sortOrder.value, locale, options);
  };

  return {
    sortField,
    sortOrder,
    sortOptions: BOOK_SORT_OPTIONS,
    setSortField,
    toggleSortOrder,
    applySort,
  };
}
