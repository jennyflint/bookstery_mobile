import { SqliteService } from './SqliteService';
import type {
  CreateHighlightInput,
  HighlightColor,
  HighlightRecord,
} from '../../types';

const STORAGE_KEYS = {
  HIGHLIGHTS: 'bookstery_web_highlights',
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

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export class HighlightRepository {
  private static instance: HighlightRepository | null = null;
  private sqliteService: SqliteService;

  constructor(sqliteService?: SqliteService) {
    this.sqliteService = sqliteService || SqliteService.getInstance();
  }

  static getInstance(): HighlightRepository {
    if (!HighlightRepository.instance) {
      HighlightRepository.instance = new HighlightRepository();
    }
    return HighlightRepository.instance;
  }

  async createHighlight(input: CreateHighlightInput): Promise<HighlightRecord> {
    await this.sqliteService.init();

    const now = Date.now();
    const highlight: HighlightRecord = {
      id: input.id || generateUuid(),
      book_id: input.book_id,
      format: input.format,
      locator: input.locator,
      selected_text: input.selected_text,
      color: input.color,
      note: input.note !== undefined ? input.note : null,
      created_at: now,
      updated_at: now,
    };

    if (this.sqliteService.isNativePlatform()) {
      const query = `
        INSERT INTO highlights (id, book_id, format, locator, selected_text, color, note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;
      await this.sqliteService.runSql(query, [
        highlight.id,
        highlight.book_id,
        highlight.format,
        highlight.locator,
        highlight.selected_text,
        highlight.color,
        highlight.note,
        highlight.created_at,
        highlight.updated_at,
      ]);
      return highlight;
    }

    const items = readStorage<HighlightRecord[]>(STORAGE_KEYS.HIGHLIGHTS, []);
    items.unshift(highlight);
    writeStorage(STORAGE_KEYS.HIGHLIGHTS, items);
    return highlight;
  }

  async getHighlightsByBook(bookId: string): Promise<HighlightRecord[]> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      const query = `
        SELECT * FROM highlights
        WHERE book_id = ?
        ORDER BY created_at DESC;
      `;
      return await this.sqliteService.querySql<HighlightRecord>(query, [bookId]);
    }

    const items = readStorage<HighlightRecord[]>(STORAGE_KEYS.HIGHLIGHTS, []);
    return items
      .filter((item) => item.book_id === bookId)
      .sort((a, b) => b.created_at - a.created_at);
  }

  async getHighlightById(id: string): Promise<HighlightRecord | null> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      const rows = await this.sqliteService.querySql<HighlightRecord>(
        'SELECT * FROM highlights WHERE id = ?;',
        [id],
      );
      return rows.length > 0 ? rows[0] : null;
    }

    const items = readStorage<HighlightRecord[]>(STORAGE_KEYS.HIGHLIGHTS, []);
    const found = items.find((item) => item.id === id);
    return found ? { ...found } : null;
  }

  async updateNote(id: string, note: string | null): Promise<HighlightRecord> {
    await this.sqliteService.init();

    const existing = await this.getHighlightById(id);
    if (!existing) {
      throw new Error('Highlight not found');
    }

    const now = Date.now();
    const updatedNote = note !== undefined ? note : null;

    if (this.sqliteService.isNativePlatform()) {
      const query = `
        UPDATE highlights
        SET note = ?, updated_at = ?
        WHERE id = ?;
      `;
      await this.sqliteService.runSql(query, [updatedNote, now, id]);
      return {
        ...existing,
        note: updatedNote,
        updated_at: now,
      };
    }

    const items = readStorage<HighlightRecord[]>(STORAGE_KEYS.HIGHLIGHTS, []);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error('Highlight not found');
    }

    items[index] = {
      ...items[index],
      note: updatedNote,
      updated_at: now,
    };
    writeStorage(STORAGE_KEYS.HIGHLIGHTS, items);
    return items[index];
  }

  async updateColor(id: string, color: HighlightColor): Promise<HighlightRecord> {
    await this.sqliteService.init();

    const existing = await this.getHighlightById(id);
    if (!existing) {
      throw new Error('Highlight not found');
    }

    const now = Date.now();

    if (this.sqliteService.isNativePlatform()) {
      const query = `
        UPDATE highlights
        SET color = ?, updated_at = ?
        WHERE id = ?;
      `;
      await this.sqliteService.runSql(query, [color, now, id]);
      return {
        ...existing,
        color,
        updated_at: now,
      };
    }

    const items = readStorage<HighlightRecord[]>(STORAGE_KEYS.HIGHLIGHTS, []);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error('Highlight not found');
    }

    items[index] = {
      ...items[index],
      color,
      updated_at: now,
    };
    writeStorage(STORAGE_KEYS.HIGHLIGHTS, items);
    return items[index];
  }

  async deleteHighlight(id: string): Promise<void> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      await this.sqliteService.runSql('DELETE FROM highlights WHERE id = ?;', [id]);
      return;
    }

    const items = readStorage<HighlightRecord[]>(STORAGE_KEYS.HIGHLIGHTS, []);
    const filtered = items.filter((item) => item.id !== id);
    writeStorage(STORAGE_KEYS.HIGHLIGHTS, filtered);
  }
}
