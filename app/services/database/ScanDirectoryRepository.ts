import { SqliteService } from './SqliteService';
import type { ScanDirectory, ScannerSettings } from '../../types';

const STORAGE_KEYS = {
  SCAN_DIRECTORIES: 'bookstery_web_scan_directories',
  SCANNER_SETTINGS: 'bookstery_web_scanner_settings',
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

export function normalizeDirectoryUri(uri: string): string {
  const trimmed = uri.trim();
  if (trimmed.length > 1 && (trimmed.endsWith('/') || trimmed.endsWith('\\'))) {
    return trimmed.slice(0, -1);
  }
  return trimmed;
}

export class ScanDirectoryRepository {
  private static instance: ScanDirectoryRepository | null = null;
  private readonly sqliteService: SqliteService;

  constructor(sqliteService: SqliteService = SqliteService.getInstance()) {
    this.sqliteService = sqliteService;
  }

  static getInstance(): ScanDirectoryRepository {
    if (!ScanDirectoryRepository.instance) {
      ScanDirectoryRepository.instance = new ScanDirectoryRepository();
    }
    return ScanDirectoryRepository.instance;
  }

  async getAllDirectories(): Promise<ScanDirectory[]> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        const query = `
          SELECT id, uri, display_name, is_active, last_scanned_at, created_at
          FROM scan_directories
          ORDER BY created_at ASC;
        `;
        return await this.sqliteService.querySql<ScanDirectory>(query);
      } catch {}
    }

    const list = readStorage<ScanDirectory[]>(STORAGE_KEYS.SCAN_DIRECTORIES, []);
    return [...list].sort((a, b) => a.created_at - b.created_at);
  }

  async getActiveDirectories(): Promise<ScanDirectory[]> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        const query = `
          SELECT id, uri, display_name, is_active, last_scanned_at, created_at
          FROM scan_directories
          WHERE is_active = 1
          ORDER BY created_at ASC;
        `;
        return await this.sqliteService.querySql<ScanDirectory>(query);
      } catch {}
    }

    const list = readStorage<ScanDirectory[]>(STORAGE_KEYS.SCAN_DIRECTORIES, []);
    return list.filter((item) => item.is_active === 1).sort((a, b) => a.created_at - b.created_at);
  }

  async getDirectoryByUri(uri: string): Promise<ScanDirectory | null> {
    const normalized = normalizeDirectoryUri(uri);
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        const query = `
          SELECT id, uri, display_name, is_active, last_scanned_at, created_at
          FROM scan_directories
          WHERE uri = ?
          LIMIT 1;
        `;
        const rows = await this.sqliteService.querySql<ScanDirectory>(query, [normalized]);
        return rows.length > 0 ? rows[0] : null;
      } catch {
        return null;
      }
    }

    const list = readStorage<ScanDirectory[]>(STORAGE_KEYS.SCAN_DIRECTORIES, []);
    return list.find((item) => normalizeDirectoryUri(item.uri) === normalized) || null;
  }

  async addDirectory(uri: string, displayName: string): Promise<ScanDirectory> {
    const normalizedUri = normalizeDirectoryUri(uri);
    const trimmedName = displayName.trim() || normalizedUri;
    const existing = await this.getDirectoryByUri(normalizedUri);

    if (existing) {
      if (existing.is_active === 0) {
        await this.toggleDirectory(existing.id, true);
        existing.is_active = 1;
      }
      return existing;
    }

    const now = Date.now();
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      const query = `
        INSERT INTO scan_directories (uri, display_name, is_active, last_scanned_at, created_at)
        VALUES (?, ?, 1, NULL, ?);
      `;
      await this.sqliteService.runSql(query, [normalizedUri, trimmedName, now]);
      const created = await this.getDirectoryByUri(normalizedUri);
      if (created) {
        return created;
      }
    }

    const list = readStorage<ScanDirectory[]>(STORAGE_KEYS.SCAN_DIRECTORIES, []);
    const nextId = list.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    const newRecord: ScanDirectory = {
      id: nextId,
      uri: normalizedUri,
      display_name: trimmedName,
      is_active: 1,
      last_scanned_at: null,
      created_at: now,
    };
    list.push(newRecord);
    writeStorage(STORAGE_KEYS.SCAN_DIRECTORIES, list);
    return newRecord;
  }

  async removeDirectory(id: number): Promise<void> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        await this.sqliteService.runSql('DELETE FROM scan_directories WHERE id = ?;', [id]);
        return;
      } catch {}
    }

    const list = readStorage<ScanDirectory[]>(STORAGE_KEYS.SCAN_DIRECTORIES, []);
    const filtered = list.filter((item) => item.id !== id);
    writeStorage(STORAGE_KEYS.SCAN_DIRECTORIES, filtered);
  }

  async toggleDirectory(id: number, isActive: boolean): Promise<void> {
    const val = isActive ? 1 : 0;
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        await this.sqliteService.runSql('UPDATE scan_directories SET is_active = ? WHERE id = ?;', [
          val,
          id,
        ]);
        return;
      } catch {}
    }

    const list = readStorage<ScanDirectory[]>(STORAGE_KEYS.SCAN_DIRECTORIES, []);
    const item = list.find((d) => d.id === id);
    if (item) {
      item.is_active = val;
      writeStorage(STORAGE_KEYS.SCAN_DIRECTORIES, list);
    }
  }

  async updateLastScanned(id: number, timestamp: number): Promise<void> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        await this.sqliteService.runSql(
          'UPDATE scan_directories SET last_scanned_at = ? WHERE id = ?;',
          [timestamp, id],
        );
        return;
      } catch {}
    }

    const list = readStorage<ScanDirectory[]>(STORAGE_KEYS.SCAN_DIRECTORIES, []);
    const item = list.find((d) => d.id === id);
    if (item) {
      item.last_scanned_at = timestamp;
      writeStorage(STORAGE_KEYS.SCAN_DIRECTORIES, list);
    }
  }

  async getSettings(): Promise<ScannerSettings> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        const query = `
          SELECT id, auto_scan_on_startup, scan_subdirectories, updated_at
          FROM scanner_settings
          WHERE id = 1;
        `;
        const rows = await this.sqliteService.querySql<ScannerSettings>(query);
        if (rows.length > 0) {
          return rows[0];
        }
      } catch {}
    }

    const fallback: ScannerSettings = {
      id: 1,
      auto_scan_on_startup: 1,
      scan_subdirectories: 1,
      updated_at: Date.now(),
    };
    return readStorage<ScannerSettings>(STORAGE_KEYS.SCANNER_SETTINGS, fallback);
  }

  async updateSettings(
    settings: Partial<Pick<ScannerSettings, 'auto_scan_on_startup' | 'scan_subdirectories'>>,
  ): Promise<ScannerSettings> {
    const current = await this.getSettings();
    const autoScan =
      settings.auto_scan_on_startup !== undefined
        ? settings.auto_scan_on_startup
        : current.auto_scan_on_startup;
    const scanSubdirs =
      settings.scan_subdirectories !== undefined
        ? settings.scan_subdirectories
        : current.scan_subdirectories;
    const now = Date.now();

    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        const query = `
          INSERT INTO scanner_settings (id, auto_scan_on_startup, scan_subdirectories, updated_at)
          VALUES (1, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            auto_scan_on_startup = excluded.auto_scan_on_startup,
            scan_subdirectories = excluded.scan_subdirectories,
            updated_at = excluded.updated_at;
        `;
        await this.sqliteService.runSql(query, [autoScan, scanSubdirs, now]);
        return {
          id: 1,
          auto_scan_on_startup: autoScan,
          scan_subdirectories: scanSubdirs,
          updated_at: now,
        };
      } catch {}
    }

    const updated: ScannerSettings = {
      id: 1,
      auto_scan_on_startup: autoScan,
      scan_subdirectories: scanSubdirs,
      updated_at: now,
    };
    writeStorage(STORAGE_KEYS.SCANNER_SETTINGS, updated);
    return updated;
  }
}
