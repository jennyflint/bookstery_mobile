import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { Capacitor } from '@capacitor/core';
import { useScannerStore } from '../../../app/stores/scannerStore';
import { AutoScanService } from '../../../app/services/scanner/AutoScanService';

describe('scannerStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should initialize with default state and load settings', async () => {
    const store = useScannerStore();
    expect(store.directories).toEqual([]);
    expect(store.isScanning).toBe(false);
    expect(store.lastScanCompletedAt).toBe(0);

    await store.init();
    expect(store.isInitialized).toBe(true);
    expect(store.settings.auto_scan_on_startup).toBe(1);
    expect(store.settings.scan_subdirectories).toBe(1);
  });

  it('should add, toggle, and remove directories through store actions', async () => {
    const store = useScannerStore();
    await store.init();

    const created = await store.addFolder('Downloads', 'My Downloads');
    expect(created).not.toBeNull();
    expect(store.directories.length).toBe(1);
    expect(store.hasActiveDirectories).toBe(true);

    if (created) {
      await store.toggleFolder(created.id, false);
      expect(store.activeDirectories.length).toBe(0);

      await store.removeFolder(created.id);
      expect(store.directories.length).toBe(0);
    }
  });

  it('should update scanner settings', async () => {
    const store = useScannerStore();
    await store.init();

    await store.updateSettings({ auto_scan_on_startup: 0 });
    expect(store.settings.auto_scan_on_startup).toBe(0);

    const startupScanResult = await store.runStartupScan();
    expect(startupScanResult).toBeNull();

    // Manual scan must run even when auto_scan_on_startup is disabled
    const manualScanResult = await store.runManualScan();
    expect(manualScanResult).not.toBeNull();
  });

  describe('runStartupScan', () => {
    it('should return null and set permissionDenied to true when permission check fails', async () => {
      const store = useScannerStore();
      await store.init();

      const scannerService = AutoScanService.getInstance();
      vi.spyOn(scannerService, 'ensureFilesystemPermissions').mockResolvedValue(false);

      const result = await store.runStartupScan();
      expect(result).toBeNull();
      expect(store.permissionDenied).toBe(true);
    });

    it('should execute scan on native platform even when hasActiveDirectories is false', async () => {
      const store = useScannerStore();
      await store.init();

      const scannerService = AutoScanService.getInstance();
      vi.spyOn(scannerService, 'ensureFilesystemPermissions').mockResolvedValue(true);
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);

      const scanSpy = vi.spyOn(scannerService, 'scanAllActiveDirectories').mockResolvedValue({
        scannedFilesCount: 5,
        newBooksCount: 1,
        updatedBooksCount: 0,
        skippedBooksCount: 4,
        failedCount: 0,
        newBookIds: ['10'],
      });

      const result = await store.runStartupScan();
      expect(result).not.toBeNull();
      expect(result?.newBooksCount).toBe(1);
      expect(store.permissionDenied).toBe(false);
      expect(scanSpy).toHaveBeenCalledTimes(1);
      expect(store.lastScanCompletedAt).toBeGreaterThan(0);
    });

    it('should enforce cooldown guard within 5 seconds of previous scan', async () => {
      const store = useScannerStore();
      await store.init();

      const scannerService = AutoScanService.getInstance();
      vi.spyOn(scannerService, 'ensureFilesystemPermissions').mockResolvedValue(true);
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      vi.spyOn(scannerService, 'scanAllActiveDirectories').mockResolvedValue({
        scannedFilesCount: 0,
        newBooksCount: 0,
        updatedBooksCount: 0,
        skippedBooksCount: 0,
        failedCount: 0,
        newBookIds: [],
      });

      // First run succeeds
      const firstResult = await store.runStartupScan();
      expect(firstResult).not.toBeNull();

      // Immediate second run should be guarded by cooldown and return null
      const secondResult = await store.runStartupScan();
      expect(secondResult).toBeNull();
    });

    it('should return null when a scan is currently in progress', async () => {
      const store = useScannerStore();
      await store.init();
      store.isScanning = true;

      const result = await store.runStartupScan();
      expect(result).toBeNull();
    });
  });
});
