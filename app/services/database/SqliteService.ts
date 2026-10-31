import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { SCHEMA_V1 } from './migrations';
import type { BookRecord, DictionaryItem, SyncQueueItem, SyncStatus, UserSession } from '../../types';

export class SqliteService {
  private static instance: SqliteService | null = null;
  private sqliteConnection: SQLiteConnection | null = null;
  private db: SQLiteDBConnection | null = null;
  private isInitialized: boolean = false;
  private readonly dbName: string = 'bookstery_db';

  private inMemoryBooks: Map<string, BookRecord> = new Map();
  private inMemoryQueue: SyncQueueItem[] = [];
  private inMemoryDictionary: DictionaryItem[] = [];
  private inMemorySession: UserSession | null = null;
  private queueCounter: number = 1;
  private dictCounter: number = 1;

  static getInstance(): SqliteService {
    if (!SqliteService.instance) {
      SqliteService.instance = new SqliteService();
    }
    return SqliteService.instance;
  }

  async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const platform = Capacitor.getPlatform();
    if (platform === 'web' && typeof window !== 'undefined' && !('sqliteStorage' in window)) {
      this.isInitialized = true;
      return;
    }

    try {
      this.sqliteConnection = new SQLiteConnection(CapacitorSQLite);
      const isConn = (await this.sqliteConnection.isConnection(this.dbName, false)).result;

      if (isConn) {
        this.db = await this.sqliteConnection.retrieveConnection(this.dbName, false);
      } else {
        this.db = await this.sqliteConnection.createConnection(
          this.dbName,
          false,
          'no-encryption',
          1,
          false,
        );
      }

      await this.db.open();
      await this.db.execute(SCHEMA_V1);
      this.isInitialized = true;
    } catch {
      this.isInitialized = true;
    }
  }

  async getAllBooks(): Promise<BookRecord[]> {
    if (this.db) {
      try {
        const result = await this.db.query('SELECT * FROM books ORDER BY last_read_at DESC;');
        return (result.values as BookRecord[]) || [];
      } catch {
      }
    }
    return Array.from(this.inMemoryBooks.values()).sort((a, b) => b.last_read_at - a.last_read_at);
  }

  async getBookById(id: string): Promise<BookRecord | null> {
    if (this.db) {
      try {
        const result = await this.db.query('SELECT * FROM books WHERE id = ?;', [id]);
        if (result.values && result.values.length > 0) {
          return result.values[0] as BookRecord;
        }
        return null;
      } catch {
      }
    }
    return this.inMemoryBooks.get(id) || null;
  }

  async upsertBook(book: BookRecord): Promise<void> {
    if (this.db) {
      try {
        const query = `
          INSERT INTO books (id, title, author, format, file_path, cover_path, locator, progress_percentage, total_items, last_read_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            author = excluded.author,
            format = excluded.format,
            file_path = excluded.file_path,
            cover_path = excluded.cover_path,
            locator = excluded.locator,
            progress_percentage = excluded.progress_percentage,
            total_items = excluded.total_items,
            last_read_at = excluded.last_read_at,
            updated_at = excluded.updated_at;
        `;
        await this.db.run(query, [
          book.id,
          book.title,
          book.author,
          book.format,
          book.file_path,
          book.cover_path,
          book.locator,
          book.progress_percentage,
          book.total_items,
          book.last_read_at,
          book.updated_at,
        ]);
        return;
      } catch {
      }
    }
    this.inMemoryBooks.set(book.id, { ...book });
  }

  async updateReadingPosition(bookId: string, locator: string, progressPercentage: number): Promise<void> {
    const now = Date.now();
    if (this.db) {
      try {
        const query = `
          UPDATE books
          SET locator = ?, progress_percentage = ?, last_read_at = ?, updated_at = ?
          WHERE id = ?;
        `;
        await this.db.run(query, [locator, progressPercentage, now, now, bookId]);
        return;
      } catch {
      }
    }
    const book = this.inMemoryBooks.get(bookId);
    if (book) {
      book.locator = locator;
      book.progress_percentage = progressPercentage;
      book.last_read_at = now;
      book.updated_at = now;
    }
  }

  async deleteBook(id: string): Promise<void> {
    if (this.db) {
      try {
        await this.db.run('DELETE FROM books WHERE id = ?;', [id]);
        return;
      } catch {
      }
    }
    this.inMemoryBooks.delete(id);
  }

  async getPendingSyncQueue(): Promise<SyncQueueItem[]> {
    if (this.db) {
      try {
        const result = await this.db.query(
          "SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY updated_at ASC;",
        );
        return (result.values as SyncQueueItem[]) || [];
      } catch {
      }
    }
    return this.inMemoryQueue.filter((item) => item.status === 'pending');
  }

  async enqueueSyncItem(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
    if (this.db) {
      try {
        const query = `
          INSERT INTO sync_queue (book_id, locator, progress_percentage, updated_at, status)
          VALUES (?, ?, ?, ?, ?);
        `;
        await this.db.run(query, [
          item.book_id,
          item.locator,
          item.progress_percentage,
          item.updated_at,
          item.status,
        ]);
        return;
      } catch {
      }
    }
    this.inMemoryQueue.push({
      id: this.queueCounter++,
      ...item,
    });
  }

  async updateSyncQueueStatus(id: number, status: SyncStatus): Promise<void> {
    if (this.db) {
      try {
        await this.db.run('UPDATE sync_queue SET status = ? WHERE id = ?;', [status, id]);
        return;
      } catch {
      }
    }
    const item = this.inMemoryQueue.find((q) => q.id === id);
    if (item) {
      item.status = status;
    }
  }

  async clearSyncedQueue(): Promise<void> {
    if (this.db) {
      try {
        await this.db.run("DELETE FROM sync_queue WHERE status = 'synced';");
        return;
      } catch {
      }
    }
    this.inMemoryQueue = this.inMemoryQueue.filter((item) => item.status !== 'synced');
  }

  async getDictionaryHistory(): Promise<DictionaryItem[]> {
    if (this.db) {
      try {
        const result = await this.db.query('SELECT * FROM dictionary_history ORDER BY created_at DESC;');
        return (result.values as DictionaryItem[]) || [];
      } catch {
      }
    }
    return [...this.inMemoryDictionary].sort((a, b) => b.created_at - a.created_at);
  }

  async saveDictionaryItem(item: Omit<DictionaryItem, 'id'>): Promise<number> {
    if (this.db) {
      try {
        const query = `
          INSERT INTO dictionary_history (book_id, source_text, translated_text, source_lang, target_lang, created_at)
          VALUES (?, ?, ?, ?, ?, ?);
        `;
        const res = await this.db.run(query, [
          item.book_id,
          item.source_text,
          item.translated_text,
          item.source_lang,
          item.target_lang,
          item.created_at,
        ]);
        return res.changes?.lastId || 1;
      } catch {
      }
    }
    const newId = this.dictCounter++;
    this.inMemoryDictionary.push({
      id: newId,
      ...item,
    });
    return newId;
  }

  async deleteDictionaryItem(id: number): Promise<void> {
    if (this.db) {
      try {
        await this.db.run('DELETE FROM dictionary_history WHERE id = ?;', [id]);
        return;
      } catch {
      }
    }
    this.inMemoryDictionary = this.inMemoryDictionary.filter((item) => item.id !== id);
  }

  async getUserSession(): Promise<UserSession | null> {
    if (this.db) {
      try {
        const result = await this.db.query('SELECT * FROM user_session WHERE id = 1;');
        if (result.values && result.values.length > 0) {
          return result.values[0] as UserSession;
        }
        return null;
      } catch {
      }
    }
    return this.inMemorySession;
  }

  async saveUserSession(session: Omit<UserSession, 'id'>): Promise<void> {
    if (this.db) {
      try {
        const query = `
          INSERT INTO user_session (id, email, display_name, last_sync_at)
          VALUES (1, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            email = excluded.email,
            display_name = excluded.display_name,
            last_sync_at = excluded.last_sync_at;
        `;
        await this.db.run(query, [session.email, session.display_name, session.last_sync_at]);
        return;
      } catch {
      }
    }
    this.inMemorySession = {
      id: 1,
      ...session,
    };
  }

  async close(): Promise<void> {
    if (this.db && this.sqliteConnection) {
      try {
        await this.db.close();
        await this.sqliteConnection.closeConnection(this.dbName, false);
      } catch {
      }
      this.db = null;
      this.sqliteConnection = null;
      this.isInitialized = false;
    }
  }
}
