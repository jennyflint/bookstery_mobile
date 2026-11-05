import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import {
  SCHEMA_V1,
  SCHEMA_HIGHLIGHTS,
  SCHEMA_SCAN_DIRECTORIES,
  SCHEMA_AI,
  SCHEMA_AI_CHAT,
  SCHEMA_VOCABULARY,
  migrateFormatCheckConstraints,
} from './migrations';
import type {
  AiChatMessage,
  BookRecord,
  DictionaryItem,
  SyncQueueItem,
  SyncStatus,
  UserSession,
  VocabularyWordRecord,
} from '../../types';

const STORAGE_KEYS = {
  BOOKS: 'bookstery_web_books',
  SYNC_QUEUE: 'bookstery_web_sync_queue',
  DICTIONARY: 'bookstery_web_dictionary',
  SESSION: 'bookstery_web_session',
  DRIVE_FOLDER_ID: 'bookstery_web_drive_folder_id',
  COLLECTIONS: 'bookstery_web_collections',
  BOOK_COLLECTIONS: 'bookstery_web_book_collections',
  HIGHLIGHTS: 'bookstery_web_highlights',
  SCAN_DIRECTORIES: 'bookstery_web_scan_directories',
  SCANNER_SETTINGS: 'bookstery_web_scanner_settings',
  LLM_SETTINGS: 'bookstery_web_llm_settings',
  AI_CACHE: 'bookstery_web_ai_cache',
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

export class SqliteService {
  private static instance: SqliteService | null = null;
  private sqliteConnection: SQLiteConnection | null = null;
  private db: SQLiteDBConnection | null = null;
  private isInitialized: boolean = false;
  private isNative: boolean = false;
  private readonly dbName: string = 'bookstery_db';

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

    if (!Capacitor.isNativePlatform()) {
      this.isNative = false;
      this.isInitialized = true;
      return;
    }

    try {
      this.isNative = true;
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
      await this.db.execute('PRAGMA foreign_keys = ON;');
      await this.db.execute(SCHEMA_V1);

      try {
        await this.db.execute('ALTER TABLE user_session ADD COLUMN drive_folder_id TEXT;');
      } catch {}

      try {
        await this.db.execute(
          'ALTER TABLE books ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1));',
        );
      } catch {}

      try {
        await this.db.execute('ALTER TABLE books ADD COLUMN pinned_at INTEGER DEFAULT NULL;');
      } catch {}

      try {
        await this.db.execute(
          'CREATE INDEX IF NOT EXISTS idx_books_pinned ON books(is_pinned DESC, pinned_at DESC);',
        );
      } catch {}

      try {
        await this.db.execute(SCHEMA_HIGHLIGHTS);
      } catch {}

      try {
        await this.db.execute(`
          CREATE TABLE IF NOT EXISTS collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS book_collection (
            book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
            collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
            PRIMARY KEY (book_id, collection_id)
          );
          CREATE INDEX IF NOT EXISTS idx_book_collection_book ON book_collection(book_id);
          CREATE INDEX IF NOT EXISTS idx_book_collection_collection ON book_collection(collection_id);
        `);
      } catch {}

      try {
        await this.db.execute(SCHEMA_SCAN_DIRECTORIES);
      } catch {}

      try {
        await this.db.execute(SCHEMA_AI);
      } catch {}

      try {
        await this.db.execute(SCHEMA_AI_CHAT);
      } catch {}

      try {
        await this.db.execute(SCHEMA_VOCABULARY);
      } catch {}

      try {
        await this.migrateDictionaryHistoryToVocabulary();
      } catch {}

      try {
        await this.db.execute(
          "ALTER TABLE llm_settings ADD COLUMN target_language TEXT DEFAULT 'uk';",
        );
      } catch {}

      try {
        await this.db.execute(
          'ALTER TABLE llm_settings ADD COLUMN custom_system_prompt TEXT DEFAULT NULL;',
        );
      } catch {}

      try {
        await this.db.execute(
          'ALTER TABLE llm_settings ADD COLUMN custom_prompts_json TEXT DEFAULT NULL;',
        );
      } catch {}

      try {
        await this.db.execute('ALTER TABLE books ADD COLUMN file_size INTEGER DEFAULT NULL;');
      } catch {}

      try {
        await this.db.execute('ALTER TABLE books ADD COLUMN file_hash TEXT DEFAULT NULL;');
      } catch {}

      try {
        await migrateFormatCheckConstraints(this.db);
      } catch {}

      this.isInitialized = true;
    } catch {
      this.isNative = false;
      this.db = null;
      this.isInitialized = true;
    }
  }

  async getAllBooks(): Promise<BookRecord[]> {
    if (this.isNative && this.db) {
      try {
        const result = await this.db.query(
          'SELECT * FROM books ORDER BY is_pinned DESC, pinned_at DESC, last_read_at DESC;',
        );
        return (result.values as BookRecord[]) || [];
      } catch {}
    }
    const books = readStorage<BookRecord[]>(STORAGE_KEYS.BOOKS, []);
    return books.sort((a, b) => {
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
    if (this.isNative && this.db) {
      try {
        const result = await this.db.query('SELECT * FROM books WHERE id = ?;', [id]);
        if (result.values && result.values.length > 0) {
          return result.values[0] as BookRecord;
        }
        return null;
      } catch {}
    }
    const books = readStorage<BookRecord[]>(STORAGE_KEYS.BOOKS, []);
    return books.find((b) => b.id === id) || null;
  }

  async findDuplicateBook(candidate: {
    id?: string;
    title?: string;
    author?: string | null;
    file_path?: string;
  }): Promise<BookRecord | null> {
    const allBooks = await this.getAllBooks();
    const candidateTitle = candidate.title?.trim().toLowerCase();
    const candidateAuthor = candidate.author?.trim().toLowerCase() || null;

    for (const book of allBooks) {
      if (candidate.id && book.id === candidate.id) {
        return book;
      }
      if (candidate.file_path && book.file_path === candidate.file_path) {
        return book;
      }
      if (candidateTitle && book.title.trim().toLowerCase() === candidateTitle) {
        const bookAuthor = book.author?.trim().toLowerCase() || null;
        if (!candidateAuthor && !bookAuthor) {
          return book;
        }
        if (candidateAuthor && bookAuthor && candidateAuthor === bookAuthor) {
          return book;
        }
      }
    }
    return null;
  }

  async isDuplicateBook(candidate: {
    id?: string;
    title?: string;
    author?: string | null;
    file_path?: string;
  }): Promise<boolean> {
    const duplicate = await this.findDuplicateBook(candidate);
    return duplicate !== null;
  }

  async upsertBook(book: BookRecord): Promise<void> {
    const isPinned = book.is_pinned ?? 0;
    const pinnedAt = book.pinned_at ?? null;
    const fileSize = book.file_size ?? null;
    const fileHash = book.file_hash ?? null;
    if (this.isNative && this.db) {
      try {
        const query = `
          INSERT INTO books (id, title, author, format, file_path, cover_path, locator, progress_percentage, total_items, last_read_at, updated_at, is_pinned, pinned_at, file_size, file_hash)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            updated_at = excluded.updated_at,
            is_pinned = excluded.is_pinned,
            pinned_at = excluded.pinned_at,
            file_size = COALESCE(excluded.file_size, books.file_size),
            file_hash = COALESCE(excluded.file_hash, books.file_hash);
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
          isPinned,
          pinnedAt,
          fileSize,
          fileHash,
        ]);
        return;
      } catch {}
    }
    const books = readStorage<BookRecord[]>(STORAGE_KEYS.BOOKS, []);
    const index = books.findIndex((b) => b.id === book.id);
    const updatedBook: BookRecord = {
      ...book,
      is_pinned: isPinned,
      pinned_at: pinnedAt,
      file_size: fileSize ?? undefined,
      file_hash: fileHash ?? undefined,
    };
    if (index !== -1) {
      books[index] = updatedBook;
    } else {
      books.push(updatedBook);
    }
    writeStorage(STORAGE_KEYS.BOOKS, books);
  }

  async updateReadingPosition(
    bookId: string,
    locator: string,
    progressPercentage: number,
    updatedAt?: number,
  ): Promise<void> {
    const timestamp = updatedAt ?? Date.now();
    if (this.isNative && this.db) {
      try {
        const query = `
          UPDATE books
          SET locator = ?, progress_percentage = ?, last_read_at = ?, updated_at = ?
          WHERE id = ?;
        `;
        await this.db.run(query, [locator, progressPercentage, timestamp, timestamp, bookId]);
        return;
      } catch {}
    }
    const books = readStorage<BookRecord[]>(STORAGE_KEYS.BOOKS, []);
    const book = books.find((b) => b.id === bookId);
    if (book) {
      book.locator = locator;
      book.progress_percentage = progressPercentage;
      book.last_read_at = timestamp;
      book.updated_at = timestamp;
      writeStorage(STORAGE_KEYS.BOOKS, books);
    }
  }

  async updateCoverPath(bookId: string, coverPath: string | null): Promise<void> {
    const now = Date.now();
    if (this.isNative && this.db) {
      try {
        const query = `
          UPDATE books
          SET cover_path = ?, updated_at = ?
          WHERE id = ?;
        `;
        await this.db.run(query, [coverPath, now, bookId]);
        return;
      } catch {}
    }
    const books = readStorage<BookRecord[]>(STORAGE_KEYS.BOOKS, []);
    const book = books.find((b) => b.id === bookId);
    if (book) {
      book.cover_path = coverPath;
      book.updated_at = now;
      writeStorage(STORAGE_KEYS.BOOKS, books);
    }
  }

  async updateFilePathAndSize(bookId: string, filePath: string, fileSize?: number): Promise<void> {
    const now = Date.now();
    if (this.isNative && this.db) {
      try {
        const query = `
          UPDATE books
          SET file_path = ?, file_size = COALESCE(?, file_size), updated_at = ?
          WHERE id = ?;
        `;
        await this.db.run(query, [filePath, fileSize ?? null, now, bookId]);
        return;
      } catch {}
    }
    const books = readStorage<BookRecord[]>(STORAGE_KEYS.BOOKS, []);
    const book = books.find((b) => b.id === bookId);
    if (book) {
      book.file_path = filePath;
      if (fileSize !== undefined) {
        book.file_size = fileSize;
      }
      book.updated_at = now;
      writeStorage(STORAGE_KEYS.BOOKS, books);
    }
  }

  async deleteBook(id: string): Promise<void> {
    if (this.isNative && this.db) {
      try {
        await this.db.run('DELETE FROM books WHERE id = ?;', [id]);
        return;
      } catch {}
    }
    const books = readStorage<BookRecord[]>(STORAGE_KEYS.BOOKS, []);
    const filtered = books.filter((b) => b.id !== id);
    writeStorage(STORAGE_KEYS.BOOKS, filtered);
    const bookCollections = readStorage<{ book_id: string; collection_id: number }[]>(
      STORAGE_KEYS.BOOK_COLLECTIONS,
      [],
    );
    writeStorage(
      STORAGE_KEYS.BOOK_COLLECTIONS,
      bookCollections.filter((bc) => bc.book_id !== id),
    );
  }

  async getPendingSyncQueue(): Promise<SyncQueueItem[]> {
    if (this.isNative && this.db) {
      try {
        const result = await this.db.query(
          "SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY updated_at ASC;",
        );
        return (result.values as SyncQueueItem[]) || [];
      } catch {}
    }
    const queue = readStorage<SyncQueueItem[]>(STORAGE_KEYS.SYNC_QUEUE, []);
    return queue.filter((item) => item.status === 'pending');
  }

  async enqueueSyncItem(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
    if (this.isNative && this.db) {
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
      } catch {}
    }
    const queue = readStorage<SyncQueueItem[]>(STORAGE_KEYS.SYNC_QUEUE, []);
    const maxId = queue.reduce((max, q) => Math.max(max, q.id || 0), 0);
    queue.push({
      id: maxId + 1,
      ...item,
    });
    writeStorage(STORAGE_KEYS.SYNC_QUEUE, queue);
  }

  async updateSyncQueueStatus(id: number, status: SyncStatus): Promise<void> {
    if (this.isNative && this.db) {
      try {
        await this.db.run('UPDATE sync_queue SET status = ? WHERE id = ?;', [status, id]);
        return;
      } catch {}
    }
    const queue = readStorage<SyncQueueItem[]>(STORAGE_KEYS.SYNC_QUEUE, []);
    const target = queue.find((q) => q.id === id);
    if (target) {
      target.status = status;
      writeStorage(STORAGE_KEYS.SYNC_QUEUE, queue);
    }
  }

  async clearSyncedQueue(): Promise<void> {
    if (this.isNative && this.db) {
      try {
        await this.db.run("DELETE FROM sync_queue WHERE status = 'synced';");
        return;
      } catch {}
    }
    const queue = readStorage<SyncQueueItem[]>(STORAGE_KEYS.SYNC_QUEUE, []);
    const remaining = queue.filter((item) => item.status !== 'synced');
    writeStorage(STORAGE_KEYS.SYNC_QUEUE, remaining);
  }

  async migrateDictionaryHistoryToVocabulary(): Promise<void> {
    if (this.isNative && this.db) {
      try {
        const historyResult = await this.db.query(
          'SELECT * FROM dictionary_history ORDER BY created_at ASC;',
        );
        const historyItems = (historyResult.values as DictionaryItem[]) || [];
        if (historyItems.length > 0) {
          for (const item of historyItems) {
            let bookTitle: string | null = null;
            if (item.book_id) {
              const bookRes = await this.db.query('SELECT title FROM books WHERE id = ?;', [
                item.book_id,
              ]);
              if (bookRes.values && bookRes.values.length > 0) {
                bookTitle = (bookRes.values[0] as { title?: string }).title || null;
              }
            }
            await this.saveVocabularyWord({
              book_id: item.book_id || null,
              book_title: bookTitle,
              word: item.source_text,
              lemma: null,
              part_of_speech: null,
              phonetic: null,
              translation: item.translated_text,
              contextual_definition: item.translated_text,
              general_definition: null,
              synonyms_json: null,
              example_sentence: null,
              context_sentence: null,
              created_at: item.created_at || Date.now(),
            });
          }
          await this.db.run('DELETE FROM dictionary_history;');
        }
      } catch {}
    }

    const listWeb = readStorage<DictionaryItem[]>(STORAGE_KEYS.DICTIONARY, []);
    const listAlt = readStorage<DictionaryItem[]>('bookstery_dictionary', []);
    const list = [...listWeb, ...listAlt];
    if (list.length > 0) {
      const vocabItems = readStorage<VocabularyWordRecord[]>('bookstery_web_vocabulary', []);
      for (const item of list) {
        const exists = vocabItems.some(
          (v) =>
            v.word.toLowerCase() === item.source_text.toLowerCase() &&
            v.translation.toLowerCase() === item.translated_text.toLowerCase(),
        );
        if (!exists) {
          vocabItems.unshift({
            id: Date.now() + Math.floor(Math.random() * 1000),
            book_id: item.book_id || null,
            book_title: null,
            word: item.source_text,
            lemma: null,
            part_of_speech: null,
            phonetic: null,
            translation: item.translated_text,
            contextual_definition: item.translated_text,
            general_definition: null,
            synonyms_json: null,
            example_sentence: null,
            context_sentence: null,
            created_at: item.created_at || Date.now(),
          });
        }
      }
      writeStorage('bookstery_web_vocabulary', vocabItems);
      writeStorage(STORAGE_KEYS.DICTIONARY, []);
      writeStorage('bookstery_dictionary', []);
    }
  }

  async getDictionaryHistory(): Promise<DictionaryItem[]> {
    if (this.isNative && this.db) {
      try {
        const result = await this.db.query(
          'SELECT * FROM dictionary_history ORDER BY created_at DESC;',
        );
        return (result.values as DictionaryItem[]) || [];
      } catch {}
    }
    const list = readStorage<DictionaryItem[]>(STORAGE_KEYS.DICTIONARY, []);
    return list.sort((a, b) => b.created_at - a.created_at);
  }

  async saveDictionaryItem(item: Omit<DictionaryItem, 'id'>): Promise<number> {
    return await this.saveVocabularyWord({
      book_id: item.book_id || null,
      book_title: null,
      word: item.source_text,
      lemma: null,
      part_of_speech: null,
      phonetic: null,
      translation: item.translated_text,
      contextual_definition: item.translated_text,
      general_definition: null,
      synonyms_json: null,
      example_sentence: null,
      context_sentence: null,
      created_at: item.created_at || Date.now(),
    });
  }

  async deleteDictionaryItem(id: number): Promise<void> {
    if (this.isNative && this.db) {
      try {
        await this.db.run('DELETE FROM dictionary_history WHERE id = ?;', [id]);
        return;
      } catch {}
    }
    const list = readStorage<DictionaryItem[]>(STORAGE_KEYS.DICTIONARY, []);
    const filtered = list.filter((item) => item.id !== id);
    writeStorage(STORAGE_KEYS.DICTIONARY, filtered);
  }

  async getUserSession(): Promise<UserSession | null> {
    if (this.isNative && this.db) {
      try {
        const result = await this.db.query('SELECT * FROM user_session WHERE id = 1;');
        if (result.values && result.values.length > 0) {
          return result.values[0] as UserSession;
        }
        return null;
      } catch {}
    }
    return readStorage<UserSession | null>(STORAGE_KEYS.SESSION, null);
  }

  async saveUserSession(session: Omit<UserSession, 'id'>): Promise<void> {
    if (this.isNative && this.db) {
      try {
        const query = `
          INSERT INTO user_session (id, email, display_name, last_sync_at, drive_folder_id)
          VALUES (1, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            email = excluded.email,
            display_name = excluded.display_name,
            last_sync_at = excluded.last_sync_at,
            drive_folder_id = COALESCE(excluded.drive_folder_id, user_session.drive_folder_id);
        `;
        await this.db.run(query, [
          session.email,
          session.display_name,
          session.last_sync_at,
          session.drive_folder_id ?? null,
        ]);
        return;
      } catch {}
    }
    const current = readStorage<UserSession | null>(STORAGE_KEYS.SESSION, null);
    const sessionObj: UserSession = {
      id: 1,
      email: session.email,
      display_name: session.display_name,
      last_sync_at: session.last_sync_at,
      drive_folder_id:
        session.drive_folder_id !== undefined
          ? session.drive_folder_id
          : (current?.drive_folder_id ?? null),
    };
    writeStorage(STORAGE_KEYS.SESSION, sessionObj);
  }

  async getDriveFolderId(): Promise<string | null> {
    if (this.isNative && this.db) {
      try {
        const result = await this.db.query(
          'SELECT drive_folder_id FROM user_session WHERE id = 1;',
        );
        if (result.values && result.values.length > 0) {
          return (result.values[0].drive_folder_id as string) || null;
        }
        return null;
      } catch {}
    }
    return readStorage<string | null>(STORAGE_KEYS.DRIVE_FOLDER_ID, null);
  }

  async setDriveFolderId(folderId: string | null): Promise<void> {
    if (this.isNative && this.db) {
      try {
        const query = `
          INSERT INTO user_session (id, email, display_name, last_sync_at, drive_folder_id)
          VALUES (1, NULL, NULL, NULL, ?)
          ON CONFLICT(id) DO UPDATE SET drive_folder_id = excluded.drive_folder_id;
        `;
        await this.db.run(query, [folderId]);
        return;
      } catch {}
    }
    writeStorage(STORAGE_KEYS.DRIVE_FOLDER_ID, folderId);
    const session = readStorage<UserSession | null>(STORAGE_KEYS.SESSION, null);
    if (session) {
      session.drive_folder_id = folderId;
      writeStorage(STORAGE_KEYS.SESSION, session);
    }
  }

  async resetUserSession(): Promise<void> {
    if (this.isNative && this.db) {
      try {
        await this.db.run(
          'UPDATE user_session SET email = NULL, display_name = NULL, last_sync_at = NULL, drive_folder_id = NULL WHERE id = 1;',
        );
        return;
      } catch {}
    }
    writeStorage(STORAGE_KEYS.SESSION, null);
    writeStorage(STORAGE_KEYS.DRIVE_FOLDER_ID, null);
  }

  getDb(): SQLiteDBConnection | null {
    return this.db;
  }

  isNativePlatform(): boolean {
    return this.isNative && this.db !== null;
  }

  async executeSql(sql: string): Promise<void> {
    if (this.isNative && this.db) {
      await this.db.execute(sql);
    }
  }

  async querySql<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (this.isNative && this.db) {
      const result = await this.db.query(sql, params);
      return (result.values as T[]) || [];
    }
    return [];
  }

  async runSql(sql: string, params?: unknown[]): Promise<void> {
    if (this.isNative && this.db) {
      await this.db.run(sql, params);
    }
  }

  async getAiChatMessages(bookId: string): Promise<AiChatMessage[]> {
    if (this.isNative && this.db) {
      try {
        const rows = await this.querySql<{
          id: string;
          book_id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
          context_snippet: string | null;
          created_at: number;
        }>(
          'SELECT id, book_id, role, content, context_snippet, created_at FROM ai_chat_messages WHERE book_id = ? ORDER BY created_at ASC;',
          [bookId],
        );
        return rows.map((r) => ({
          id: r.id,
          bookId: r.book_id,
          role: r.role,
          content: r.content,
          contextSnippet: r.context_snippet || undefined,
          createdAt: r.created_at,
        }));
      } catch {}
    }
    return readStorage<AiChatMessage[]>(`bookstery_web_ai_chat_${bookId}`, []);
  }

  async saveAiChatMessage(message: AiChatMessage): Promise<void> {
    if (this.isNative && this.db) {
      try {
        await this.runSql(
          'INSERT INTO ai_chat_messages (id, book_id, role, content, context_snippet, created_at) VALUES (?, ?, ?, ?, ?, ?);',
          [
            message.id,
            message.bookId,
            message.role,
            message.content,
            message.contextSnippet || null,
            message.createdAt,
          ],
        );
        return;
      } catch {}
    }
    const current = readStorage<AiChatMessage[]>(`bookstery_web_ai_chat_${message.bookId}`, []);
    current.push(message);
    writeStorage(`bookstery_web_ai_chat_${message.bookId}`, current);
  }

  async clearAiChatMessages(bookId: string): Promise<void> {
    if (this.isNative && this.db) {
      try {
        await this.runSql('DELETE FROM ai_chat_messages WHERE book_id = ?;', [bookId]);
        return;
      } catch {}
    }
    writeStorage(`bookstery_web_ai_chat_${bookId}`, []);
  }

  async getVocabularyWords(bookId?: string, search?: string): Promise<VocabularyWordRecord[]> {
    if (this.isNative && this.db) {
      try {
        let sql = 'SELECT * FROM vocabulary_words WHERE 1=1';
        const params: unknown[] = [];
        if (bookId) {
          sql += ' AND book_id = ?';
          params.push(bookId);
        }
        if (search && search.trim()) {
          sql += ' AND (word LIKE ? OR translation LIKE ? OR contextual_definition LIKE ?)';
          const term = `%${search.trim()}%`;
          params.push(term, term, term);
        }
        sql += ' ORDER BY created_at DESC;';
        return await this.querySql<VocabularyWordRecord>(sql, params);
      } catch {}
    }

    let items = readStorage<VocabularyWordRecord[]>('bookstery_web_vocabulary', []);
    if (bookId) {
      items = items.filter((i) => i.book_id === bookId);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (i) =>
          i.word.toLowerCase().includes(q) ||
          i.translation.toLowerCase().includes(q) ||
          i.contextual_definition.toLowerCase().includes(q),
      );
    }
    return items;
  }

  async saveVocabularyWord(word: Omit<VocabularyWordRecord, 'id'>): Promise<number> {
    const id = Date.now();
    if (this.isNative && this.db) {
      try {
        const query = `
          INSERT INTO vocabulary_words (book_id, book_title, word, lemma, part_of_speech, phonetic, translation, contextual_definition, general_definition, synonyms_json, example_sentence, context_sentence, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `;
        await this.runSql(query, [
          word.book_id || null,
          word.book_title || null,
          word.word,
          word.lemma || null,
          word.part_of_speech || null,
          word.phonetic || null,
          word.translation,
          word.contextual_definition,
          word.general_definition || null,
          word.synonyms_json || null,
          word.example_sentence || null,
          word.context_sentence || null,
          word.created_at,
        ]);
        return id;
      } catch {}
    }

    const items = readStorage<VocabularyWordRecord[]>('bookstery_web_vocabulary', []);
    const record: VocabularyWordRecord = { id, ...word };
    items.unshift(record);
    writeStorage('bookstery_web_vocabulary', items);
    return id;
  }

  async deleteVocabularyWord(id: number): Promise<void> {
    if (this.isNative && this.db) {
      try {
        await this.runSql('DELETE FROM vocabulary_words WHERE id = ?;', [id]);
        return;
      } catch {}
    }

    const items = readStorage<VocabularyWordRecord[]>('bookstery_web_vocabulary', []);
    const filtered = items.filter((i) => i.id !== id);
    writeStorage('bookstery_web_vocabulary', filtered);
  }

  async close(): Promise<void> {
    if (this.db && this.sqliteConnection) {
      try {
        await this.db.close();
        await this.sqliteConnection.closeConnection(this.dbName, false);
      } catch {}
      this.db = null;
      this.sqliteConnection = null;
      this.isInitialized = false;
    }
  }
}
