import { SqliteService } from './SqliteService';
import { MIGRATION_ADD_PINNED_COLUMNS } from './migrations';
import type { BookRecord } from '../../types';

const STORAGE_KEYS = {
  BOOKS: 'bookstery_web_books',
};

function readStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') {
    return defaultValue;
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function writeStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export class BookRepository {
  private static instance: BookRepository | null = null;
  private sqliteService: SqliteService;

  constructor(sqliteService?: SqliteService) {
    this.sqliteService = sqliteService || SqliteService.getInstance();
  }

  static getInstance(): BookRepository {
    if (!BookRepository.instance) {
      BookRepository.instance = new BookRepository();
    }
    return BookRepository.instance;
  }

  async migratePinnedColumns(): Promise<void> {
    await this.sqliteService.init();
    if (this.sqliteService.isNativePlatform()) {
      for (const statement of MIGRATION_ADD_PINNED_COLUMNS) {
        try {
          await this.sqliteService.executeSql(statement);
        } catch {}
      }
    }
  }

  async getBooks(): Promise<BookRecord[]> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        const query = `
          SELECT * FROM books
          ORDER BY is_pinned DESC, pinned_at DESC, last_read_at DESC;
        `;
        return await this.sqliteService.querySql<BookRecord>(query);
      } catch {}
    }

    const books = readStorage<BookRecord[]>(STORAGE_KEYS.BOOKS, []);
    return [...books].sort((a, b) => {
      const pinA = a.is_pinned ?? 0;
      const pinB = b.is_pinned ?? 0;
      if (pinA !== pinB) {
        return pinB - pinA;
      }
      if (pinA === 1) {
        const timeA = a.pinned_at ?? 0;
        const timeB = b.pinned_at ?? 0;
        if (timeA !== timeB) {
          return timeB - timeA;
        }
      }
      return b.last_read_at - a.last_read_at;
    });
  }

  async getBookById(id: string): Promise<BookRecord | null> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        const rows = await this.sqliteService.querySql<BookRecord>(
          'SELECT * FROM books WHERE id = ?;',
          [id],
        );
        return rows.length > 0 ? rows[0] : null;
      } catch {
        return null;
      }
    }

    const books = readStorage<BookRecord[]>(STORAGE_KEYS.BOOKS, []);
    return books.find((b) => b.id === id) || null;
  }

  async togglePinBook(bookId: string): Promise<boolean> {
    await this.sqliteService.init();
    const book = await this.getBookById(bookId);
    if (!book) {
      throw new Error('Book not found');
    }

    const newPinned = book.is_pinned === 1 ? 0 : 1;
    const newPinnedAt = newPinned === 1 ? Date.now() : null;
    const now = Date.now();

    if (this.sqliteService.isNativePlatform()) {
      await this.sqliteService.runSql(
        'UPDATE books SET is_pinned = ?, pinned_at = ?, updated_at = ? WHERE id = ?;',
        [newPinned, newPinnedAt, now, bookId],
      );
      return newPinned === 1;
    }

    const books = readStorage<BookRecord[]>(STORAGE_KEYS.BOOKS, []);
    const target = books.find((b) => b.id === bookId);
    if (target) {
      target.is_pinned = newPinned;
      target.pinned_at = newPinnedAt;
      target.updated_at = now;
      writeStorage(STORAGE_KEYS.BOOKS, books);
    }

    return newPinned === 1;
  }

  async upsertBook(book: BookRecord): Promise<void> {
    await this.sqliteService.init();
    await this.sqliteService.upsertBook(book);
  }

  async deleteBook(id: string): Promise<void> {
    await this.sqliteService.init();
    await this.sqliteService.deleteBook(id);
  }
}

export const bookRepository = BookRepository.getInstance();
