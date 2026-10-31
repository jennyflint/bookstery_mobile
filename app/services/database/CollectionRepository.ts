import { SqliteService } from './SqliteService';
import type {
  Book,
  BookCollection,
  BookRecord,
  Collection,
  CollectionWithCount,
} from '../../types';

const STORAGE_KEYS = {
  COLLECTIONS: 'bookstery_web_collections',
  BOOK_COLLECTIONS: 'bookstery_web_book_collections',
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

interface CollectionRow {
  id: number;
  name: string;
  created_at: number;
  updated_at: number;
  book_count?: number;
}

interface CollectionIdRow {
  collection_id: number;
}

interface IdRow {
  id: number;
}

export class CollectionRepository {
  private static instance: CollectionRepository | null = null;
  private sqliteService: SqliteService;

  constructor(sqliteService?: SqliteService) {
    this.sqliteService = sqliteService || SqliteService.getInstance();
  }

  static getInstance(): CollectionRepository {
    if (!CollectionRepository.instance) {
      CollectionRepository.instance = new CollectionRepository();
    }
    return CollectionRepository.instance;
  }

  async getAllCollectionsWithCounts(): Promise<CollectionWithCount[]> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        const query = `
          SELECT 
            c.id, 
            c.name, 
            c.created_at, 
            c.updated_at, 
            COUNT(bc.book_id) as book_count
          FROM collections c
          LEFT JOIN book_collection bc ON c.id = bc.collection_id
          GROUP BY c.id, c.name, c.created_at, c.updated_at
          ORDER BY c.name COLLATE NOCASE ASC;
        `;
        const rows = await this.sqliteService.querySql<CollectionRow>(query);
        return rows.map((row) => ({
          id: row.id,
          name: row.name,
          created_at: row.created_at,
          updated_at: row.updated_at,
          count: Number(row.book_count) || 0,
          book_count: Number(row.book_count) || 0,
        }));
      } catch {}
    }

    const collections = readStorage<Collection[]>(STORAGE_KEYS.COLLECTIONS, []);
    const bookCollections = readStorage<BookCollection[]>(STORAGE_KEYS.BOOK_COLLECTIONS, []);

    const countMap = new Map<number, number>();
    for (const bc of bookCollections) {
      countMap.set(bc.collection_id, (countMap.get(bc.collection_id) || 0) + 1);
    }

    return collections
      .map((c) => {
        const count = countMap.get(c.id) || 0;
        return {
          id: c.id,
          name: c.name,
          created_at: c.created_at,
          updated_at: c.updated_at,
          count,
          book_count: count,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  async createCollection(name: string): Promise<Collection> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Collection name cannot be empty');
    }

    await this.sqliteService.init();
    const now = Date.now();

    if (this.sqliteService.isNativePlatform()) {
      const existing = await this.sqliteService.querySql<IdRow>(
        'SELECT id FROM collections WHERE LOWER(name) = LOWER(?);',
        [trimmed],
      );

      if (existing.length > 0) {
        throw new Error('Collection with this name already exists');
      }

      await this.sqliteService.runSql(
        'INSERT INTO collections (name, created_at, updated_at) VALUES (?, ?, ?);',
        [trimmed, now, now],
      );

      const created = await this.sqliteService.querySql<CollectionRow>(
        'SELECT id, name, created_at, updated_at FROM collections WHERE name = ? ORDER BY id DESC LIMIT 1;',
        [trimmed],
      );

      if (created.length === 0) {
        throw new Error('Failed to create collection');
      }

      return {
        id: created[0].id,
        name: created[0].name,
        created_at: created[0].created_at,
        updated_at: created[0].updated_at,
      };
    }

    const collections = readStorage<Collection[]>(STORAGE_KEYS.COLLECTIONS, []);
    const exists = collections.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      throw new Error('Collection with this name already exists');
    }

    const newId = collections.reduce((max, c) => Math.max(max, c.id), 0) + 1;
    const newCollection: Collection = {
      id: newId,
      name: trimmed,
      created_at: now,
      updated_at: now,
    };

    collections.push(newCollection);
    writeStorage(STORAGE_KEYS.COLLECTIONS, collections);

    return newCollection;
  }

  async renameCollection(id: number, newName: string): Promise<void> {
    const trimmed = newName.trim();
    if (!trimmed) {
      throw new Error('Collection name cannot be empty');
    }

    await this.sqliteService.init();
    const now = Date.now();

    if (this.sqliteService.isNativePlatform()) {
      const existing = await this.sqliteService.querySql<IdRow>(
        'SELECT id FROM collections WHERE LOWER(name) = LOWER(?) AND id != ?;',
        [trimmed, id],
      );

      if (existing.length > 0) {
        throw new Error('Collection with this name already exists');
      }

      await this.sqliteService.runSql(
        'UPDATE collections SET name = ?, updated_at = ? WHERE id = ?;',
        [trimmed, now, id],
      );
      return;
    }

    const collections = readStorage<Collection[]>(STORAGE_KEYS.COLLECTIONS, []);
    const target = collections.find((c) => c.id === id);
    if (!target) {
      throw new Error('Collection not found');
    }

    const exists = collections.some(
      (c) => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) {
      throw new Error('Collection with this name already exists');
    }

    target.name = trimmed;
    target.updated_at = now;
    writeStorage(STORAGE_KEYS.COLLECTIONS, collections);
  }

  async deleteCollection(id: number): Promise<void> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      await this.sqliteService.executeSql('PRAGMA foreign_keys = ON;');
      await this.sqliteService.runSql('DELETE FROM collections WHERE id = ?;', [id]);
      return;
    }

    const collections = readStorage<Collection[]>(STORAGE_KEYS.COLLECTIONS, []);
    const filteredCollections = collections.filter((c) => c.id !== id);
    writeStorage(STORAGE_KEYS.COLLECTIONS, filteredCollections);

    const bookCollections = readStorage<BookCollection[]>(STORAGE_KEYS.BOOK_COLLECTIONS, []);
    const filteredBookCollections = bookCollections.filter((bc) => bc.collection_id !== id);
    writeStorage(STORAGE_KEYS.BOOK_COLLECTIONS, filteredBookCollections);
  }

  async getBookCollectionIds(bookId: string): Promise<number[]> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        const rows = await this.sqliteService.querySql<CollectionIdRow>(
          'SELECT collection_id FROM book_collection WHERE book_id = ?;',
          [bookId],
        );
        return rows.map((r) => r.collection_id);
      } catch {
        return [];
      }
    }

    const bookCollections = readStorage<BookCollection[]>(STORAGE_KEYS.BOOK_COLLECTIONS, []);
    return bookCollections.filter((bc) => bc.book_id === bookId).map((bc) => bc.collection_id);
  }

  async assignBookToCollections(bookId: string, collectionIds: number[]): Promise<void> {
    await this.sqliteService.init();
    const uniqueIds = Array.from(new Set(collectionIds));

    if (this.sqliteService.isNativePlatform()) {
      await this.sqliteService.executeSql('PRAGMA foreign_keys = ON;');
      await this.sqliteService.runSql('DELETE FROM book_collection WHERE book_id = ?;', [bookId]);

      for (const collectionId of uniqueIds) {
        await this.sqliteService.runSql(
          'INSERT OR IGNORE INTO book_collection (book_id, collection_id) VALUES (?, ?);',
          [bookId, collectionId],
        );
      }
      return;
    }

    const bookCollections = readStorage<BookCollection[]>(STORAGE_KEYS.BOOK_COLLECTIONS, []);
    const withoutBook = bookCollections.filter((bc) => bc.book_id !== bookId);

    for (const collectionId of uniqueIds) {
      withoutBook.push({
        book_id: bookId,
        collection_id: collectionId,
      });
    }

    writeStorage(STORAGE_KEYS.BOOK_COLLECTIONS, withoutBook);
  }

  async getBooksByCollection(collectionId: number | null): Promise<Book[]> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        if (collectionId === null) {
          const query = `
            SELECT b.* FROM books b
            WHERE NOT EXISTS (
              SELECT 1 FROM book_collection bc WHERE bc.book_id = b.id
            )
            ORDER BY b.is_pinned DESC, b.pinned_at DESC, b.last_read_at DESC;
          `;
          return await this.sqliteService.querySql<BookRecord>(query);
        }

        const query = `
          SELECT b.* FROM books b
          INNER JOIN book_collection bc ON b.id = bc.book_id
          WHERE bc.collection_id = ?
          ORDER BY b.is_pinned DESC, b.pinned_at DESC, b.last_read_at DESC;
        `;
        return await this.sqliteService.querySql<BookRecord>(query, [collectionId]);
      } catch {
        return [];
      }
    }

    const allBooks = await this.sqliteService.getAllBooks();
    const bookCollections = readStorage<BookCollection[]>(STORAGE_KEYS.BOOK_COLLECTIONS, []);

    if (collectionId === null) {
      const assignedBookIds = new Set(bookCollections.map((bc) => bc.book_id));
      return allBooks.filter((book) => !assignedBookIds.has(book.id));
    }

    const inCollectionBookIds = new Set(
      bookCollections.filter((bc) => bc.collection_id === collectionId).map((bc) => bc.book_id),
    );

    return allBooks.filter((book) => inCollectionBookIds.has(book.id));
  }
}

export const collectionRepository = CollectionRepository.getInstance();
