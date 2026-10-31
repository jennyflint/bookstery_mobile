import { SqliteService } from './SqliteService';
import type { Book, BookFolder, BookRecord, Folder, FolderWithCount } from '../../types';

const STORAGE_KEYS = {
  FOLDERS: 'bookstery_web_folders',
  BOOK_FOLDERS: 'bookstery_web_book_folders',
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

interface FolderRow {
  id: number;
  name: string;
  created_at: number;
  updated_at: number;
  book_count?: number;
}

interface FolderIdRow {
  folder_id: number;
}

interface IdRow {
  id: number;
}

export class FolderRepository {
  private static instance: FolderRepository | null = null;
  private sqliteService: SqliteService;

  constructor(sqliteService?: SqliteService) {
    this.sqliteService = sqliteService || SqliteService.getInstance();
  }

  static getInstance(): FolderRepository {
    if (!FolderRepository.instance) {
      FolderRepository.instance = new FolderRepository();
    }
    return FolderRepository.instance;
  }

  async getAllFoldersWithCounts(): Promise<FolderWithCount[]> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        const query = `
          SELECT 
            f.id, 
            f.name, 
            f.created_at, 
            f.updated_at, 
            COUNT(bf.book_id) as book_count
          FROM folders f
          LEFT JOIN book_folder bf ON f.id = bf.folder_id
          GROUP BY f.id, f.name, f.created_at, f.updated_at
          ORDER BY f.name COLLATE NOCASE ASC;
        `;
        const rows = await this.sqliteService.querySql<FolderRow>(query);
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

    const folders = readStorage<Folder[]>(STORAGE_KEYS.FOLDERS, []);
    const bookFolders = readStorage<BookFolder[]>(STORAGE_KEYS.BOOK_FOLDERS, []);

    const countMap = new Map<number, number>();
    for (const bf of bookFolders) {
      countMap.set(bf.folder_id, (countMap.get(bf.folder_id) || 0) + 1);
    }

    return folders
      .map((f) => {
        const count = countMap.get(f.id) || 0;
        return {
          id: f.id,
          name: f.name,
          created_at: f.created_at,
          updated_at: f.updated_at,
          count,
          book_count: count,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  async createFolder(name: string): Promise<Folder> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Folder name cannot be empty');
    }

    await this.sqliteService.init();
    const now = Date.now();

    if (this.sqliteService.isNativePlatform()) {
      const existing = await this.sqliteService.querySql<IdRow>(
        'SELECT id FROM folders WHERE LOWER(name) = LOWER(?);',
        [trimmed],
      );

      if (existing.length > 0) {
        throw new Error('Folder with this name already exists');
      }

      await this.sqliteService.runSql(
        'INSERT INTO folders (name, created_at, updated_at) VALUES (?, ?, ?);',
        [trimmed, now, now],
      );

      const created = await this.sqliteService.querySql<FolderRow>(
        'SELECT id, name, created_at, updated_at FROM folders WHERE name = ? ORDER BY id DESC LIMIT 1;',
        [trimmed],
      );

      if (created.length === 0) {
        throw new Error('Failed to create folder');
      }

      return {
        id: created[0].id,
        name: created[0].name,
        created_at: created[0].created_at,
        updated_at: created[0].updated_at,
      };
    }

    const folders = readStorage<Folder[]>(STORAGE_KEYS.FOLDERS, []);
    const exists = folders.some((f) => f.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      throw new Error('Folder with this name already exists');
    }

    const newId = folders.reduce((max, f) => Math.max(max, f.id), 0) + 1;
    const newFolder: Folder = {
      id: newId,
      name: trimmed,
      created_at: now,
      updated_at: now,
    };

    folders.push(newFolder);
    writeStorage(STORAGE_KEYS.FOLDERS, folders);

    return newFolder;
  }

  async renameFolder(id: number, newName: string): Promise<void> {
    const trimmed = newName.trim();
    if (!trimmed) {
      throw new Error('Folder name cannot be empty');
    }

    await this.sqliteService.init();
    const now = Date.now();

    if (this.sqliteService.isNativePlatform()) {
      const existing = await this.sqliteService.querySql<IdRow>(
        'SELECT id FROM folders WHERE LOWER(name) = LOWER(?) AND id != ?;',
        [trimmed, id],
      );

      if (existing.length > 0) {
        throw new Error('Folder with this name already exists');
      }

      await this.sqliteService.runSql('UPDATE folders SET name = ?, updated_at = ? WHERE id = ?;', [
        trimmed,
        now,
        id,
      ]);
      return;
    }

    const folders = readStorage<Folder[]>(STORAGE_KEYS.FOLDERS, []);
    const target = folders.find((f) => f.id === id);
    if (!target) {
      throw new Error('Folder not found');
    }

    const exists = folders.some(
      (f) => f.id !== id && f.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) {
      throw new Error('Folder with this name already exists');
    }

    target.name = trimmed;
    target.updated_at = now;
    writeStorage(STORAGE_KEYS.FOLDERS, folders);
  }

  async deleteFolder(id: number): Promise<void> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      await this.sqliteService.executeSql('PRAGMA foreign_keys = ON;');
      await this.sqliteService.runSql('DELETE FROM folders WHERE id = ?;', [id]);
      return;
    }

    const folders = readStorage<Folder[]>(STORAGE_KEYS.FOLDERS, []);
    const filteredFolders = folders.filter((f) => f.id !== id);
    writeStorage(STORAGE_KEYS.FOLDERS, filteredFolders);

    const bookFolders = readStorage<BookFolder[]>(STORAGE_KEYS.BOOK_FOLDERS, []);
    const filteredBookFolders = bookFolders.filter((bf) => bf.folder_id !== id);
    writeStorage(STORAGE_KEYS.BOOK_FOLDERS, filteredBookFolders);
  }

  async getBookFolderIds(bookId: string): Promise<number[]> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        const rows = await this.sqliteService.querySql<FolderIdRow>(
          'SELECT folder_id FROM book_folder WHERE book_id = ?;',
          [bookId],
        );
        return rows.map((r) => r.folder_id);
      } catch {
        return [];
      }
    }

    const bookFolders = readStorage<BookFolder[]>(STORAGE_KEYS.BOOK_FOLDERS, []);
    return bookFolders.filter((bf) => bf.book_id === bookId).map((bf) => bf.folder_id);
  }

  async assignBookToFolders(bookId: string, folderIds: number[]): Promise<void> {
    await this.sqliteService.init();
    const uniqueIds = Array.from(new Set(folderIds));

    if (this.sqliteService.isNativePlatform()) {
      await this.sqliteService.executeSql('PRAGMA foreign_keys = ON;');
      await this.sqliteService.runSql('DELETE FROM book_folder WHERE book_id = ?;', [bookId]);

      for (const folderId of uniqueIds) {
        await this.sqliteService.runSql(
          'INSERT OR IGNORE INTO book_folder (book_id, folder_id) VALUES (?, ?);',
          [bookId, folderId],
        );
      }
      return;
    }

    const bookFolders = readStorage<BookFolder[]>(STORAGE_KEYS.BOOK_FOLDERS, []);
    const withoutBook = bookFolders.filter((bf) => bf.book_id !== bookId);

    for (const folderId of uniqueIds) {
      withoutBook.push({
        book_id: bookId,
        folder_id: folderId,
      });
    }

    writeStorage(STORAGE_KEYS.BOOK_FOLDERS, withoutBook);
  }

  async getBooksByFolder(folderId: number | null): Promise<Book[]> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        if (folderId === null) {
          const query = `
            SELECT b.* FROM books b
            WHERE NOT EXISTS (
              SELECT 1 FROM book_folder bf WHERE bf.book_id = b.id
            )
            ORDER BY b.is_pinned DESC, b.pinned_at DESC, b.last_read_at DESC;
          `;
          return await this.sqliteService.querySql<BookRecord>(query);
        }

        const query = `
          SELECT b.* FROM books b
          INNER JOIN book_folder bf ON b.id = bf.book_id
          WHERE bf.folder_id = ?
          ORDER BY b.is_pinned DESC, b.pinned_at DESC, b.last_read_at DESC;
        `;
        return await this.sqliteService.querySql<BookRecord>(query, [folderId]);
      } catch {
        return [];
      }
    }

    const allBooks = await this.sqliteService.getAllBooks();
    const bookFolders = readStorage<BookFolder[]>(STORAGE_KEYS.BOOK_FOLDERS, []);

    if (folderId === null) {
      const assignedBookIds = new Set(bookFolders.map((bf) => bf.book_id));
      return allBooks.filter((book) => !assignedBookIds.has(book.id));
    }

    const inFolderBookIds = new Set(
      bookFolders.filter((bf) => bf.folder_id === folderId).map((bf) => bf.book_id),
    );

    return allBooks.filter((book) => inFolderBookIds.has(book.id));
  }
}

export const folderRepository = FolderRepository.getInstance();
