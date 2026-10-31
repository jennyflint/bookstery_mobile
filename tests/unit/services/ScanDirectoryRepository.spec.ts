import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ScanDirectoryRepository,
  normalizeDirectoryUri,
} from '../../../app/services/database/ScanDirectoryRepository';

describe('ScanDirectoryRepository', () => {
  let repo: ScanDirectoryRepository;
  let mockSqliteService: {
    init: ReturnType<typeof vi.fn>;
    isNativePlatform: ReturnType<typeof vi.fn>;
    querySql: ReturnType<typeof vi.fn>;
    runSql: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    mockSqliteService = {
      init: vi.fn().mockResolvedValue(undefined),
      isNativePlatform: vi.fn().mockReturnValue(false),
      querySql: vi.fn().mockResolvedValue([]),
      runSql: vi.fn().mockResolvedValue(undefined),
    };

    repo = new ScanDirectoryRepository(mockSqliteService as any);
  });

  describe('normalizeDirectoryUri', () => {
    it('should trim and strip trailing slashes', () => {
      expect(normalizeDirectoryUri('  Documents/Books/  ')).toBe('Documents/Books');
      expect(normalizeDirectoryUri('Downloads/')).toBe('Downloads');
      expect(normalizeDirectoryUri('Documents\\')).toBe('Documents');
      expect(normalizeDirectoryUri('/')).toBe('/');
    });
  });

  describe('CRUD operations in web/localStorage fallback', () => {
    it('should add, retrieve, toggle, and remove scan directories', async () => {
      const dir1 = await repo.addDirectory('Documents/Books', 'My Books');
      expect(dir1.id).toBe(1);
      expect(dir1.uri).toBe('Documents/Books');
      expect(dir1.display_name).toBe('My Books');
      expect(dir1.is_active).toBe(1);

      const all = await repo.getAllDirectories();
      expect(all.length).toBe(1);

      const duplicate = await repo.addDirectory('Documents/Books/', 'Duplicate Books');
      expect(duplicate.id).toBe(1);
      expect((await repo.getAllDirectories()).length).toBe(1);

      await repo.toggleDirectory(dir1.id, false);
      const activeAfterToggle = await repo.getActiveDirectories();
      expect(activeAfterToggle.length).toBe(0);

      await repo.updateLastScanned(dir1.id, 999999);
      const updated = (await repo.getAllDirectories())[0];
      expect(updated.last_scanned_at).toBe(999999);

      await repo.removeDirectory(dir1.id);
      expect((await repo.getAllDirectories()).length).toBe(0);
    });

    it('should manage scanner settings with defaults', async () => {
      const defaultSettings = await repo.getSettings();
      expect(defaultSettings.auto_scan_on_startup).toBe(1);
      expect(defaultSettings.scan_subdirectories).toBe(1);

      const updated = await repo.updateSettings({
        auto_scan_on_startup: 0,
        scan_subdirectories: 0,
      });
      expect(updated.auto_scan_on_startup).toBe(0);
      expect(updated.scan_subdirectories).toBe(0);

      const fetched = await repo.getSettings();
      expect(fetched.auto_scan_on_startup).toBe(0);
      expect(fetched.scan_subdirectories).toBe(0);
    });
  });
});
