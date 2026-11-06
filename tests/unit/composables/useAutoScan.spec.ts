import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useAutoScan } from '../../../app/composables/useAutoScan';
import { useScannerStore } from '../../../app/stores/scannerStore';

describe('useAutoScan Composable', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should register native appStateChange listener on native platform', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    let registeredCallback: ((state: { isActive: boolean }) => void) | null = null;
    const removeSpy = vi.fn();

    vi.spyOn(App, 'addListener').mockImplementation(async (_event: string, callback: any) => {
      registeredCallback = callback;
      return { remove: removeSpy };
    });

    const { setupLifecycleListener, teardownLifecycleListener, scannerStore } = useAutoScan();
    const runStartupScanSpy = vi.spyOn(scannerStore, 'runStartupScan').mockResolvedValue(null);

    await setupLifecycleListener();
    expect(App.addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function));

    // Foreground entry with isActive: true triggers scan
    if (registeredCallback) {
      (registeredCallback as any)({ isActive: true });
    }
    expect(runStartupScanSpy).toHaveBeenCalledTimes(1);

    // Background entry (isActive: false) should NOT trigger scan
    if (registeredCallback) {
      (registeredCallback as any)({ isActive: false });
    }
    expect(runStartupScanSpy).toHaveBeenCalledTimes(1);

    teardownLifecycleListener();
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('should enforce cooldown guard on rapid foreground resume events', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    const { handleAppResume, scannerStore } = useAutoScan();
    const runStartupScanSpy = vi.spyOn(scannerStore, 'runStartupScan').mockResolvedValue(null);

    // First call
    await handleAppResume();
    expect(runStartupScanSpy).toHaveBeenCalledTimes(1);

    // Immediate second call should be ignored by cooldown guard
    await handleAppResume();
    expect(runStartupScanSpy).toHaveBeenCalledTimes(1);
  });

  it('should skip resume scan if a scan is already in progress', async () => {
    const { handleAppResume, scannerStore } = useAutoScan();
    scannerStore.isScanning = true;
    const runStartupScanSpy = vi.spyOn(scannerStore, 'runStartupScan').mockResolvedValue(null);

    await handleAppResume();
    expect(runStartupScanSpy).not.toHaveBeenCalled();
  });
});
