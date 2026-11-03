import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useScannerStore } from '../../../app/stores/scannerStore';

describe('scannerStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('should initialize with default state and load settings', async () => {
    const store = useScannerStore();
    expect(store.directories).toEqual([]);
    expect(store.isScanning).toBe(false);

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
});
