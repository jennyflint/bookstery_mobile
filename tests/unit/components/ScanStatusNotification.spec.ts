import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ScanStatusNotification from '../../../app/components/common/ScanStatusNotification.vue';
import { useScannerStore } from '../../../app/stores/scannerStore';

const mockRouterReplace = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
    push: vi.fn(),
  }),
}));

describe('ScanStatusNotification Component', () => {
  const originalUseI18n = (globalThis as unknown as { useI18n: unknown }).useI18n;

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();

    (
      globalThis as unknown as { useI18n: () => { t: (k: string, params?: any) => string } }
    ).useI18n = () => ({
      t: (key: string, params?: Record<string, any>) => {
        if (key === 'scanner.scanningTooltipTitle') {
          return `Scanning books in background... (${params?.count ?? 0})`;
        }
        if (key === 'scanner.scanningTooltipPreparing') {
          return 'Checking Downloads and storage folders...';
        }
        if (key === 'scanner.foundNewBooksNotification') {
          return `Found ${params?.count ?? 0} new books in your library`;
        }
        if (key === 'scanner.viewNewBooks') {
          return 'View Books';
        }
        if (key === 'scanner.dismiss') {
          return 'Dismiss';
        }
        return key;
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as unknown as { useI18n: unknown }).useI18n = originalUseI18n;
  });

  it('renders nothing by default when not scanning and notification is closed', () => {
    const wrapper = mount(ScanStatusNotification);
    expect(wrapper.find('[data-testid="scan-progress-tooltip"]').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
  });

  it('renders live progress tooltip with spinner and fallback message while discovering files', async () => {
    const store = useScannerStore();
    store.isScanning = true;
    store.currentCheckedCount = 0;
    store.currentCheckingFile = '';

    const wrapper = mount(ScanStatusNotification);

    const tooltip = wrapper.find('[data-testid="scan-progress-tooltip"]');
    expect(tooltip.exists()).toBe(true);
    expect(tooltip.attributes('role')).toBe('status');
    expect(tooltip.attributes('aria-live')).toBe('polite');
    expect(tooltip.find('.animate-spin').exists()).toBe(true);

    expect(wrapper.text()).toContain('Scanning books in background... (0)');
    expect(wrapper.text()).toContain('Checking Downloads and storage folders...');
  });

  it('updates live progress tooltip with file count and current checking file', async () => {
    const store = useScannerStore();
    store.isScanning = true;
    store.currentCheckedCount = 42;
    store.currentCheckingFile = 'my_book.epub';

    const wrapper = mount(ScanStatusNotification);

    expect(wrapper.text()).toContain('Scanning books in background... (42)');
    expect(wrapper.text()).toContain('my_book.epub');
  });

  it('renders completed notification banner when scanning completes with new books and auto-dismisses after 6s', async () => {
    const store = useScannerStore();
    store.isScanning = false;
    store.lastScanSummary = {
      scannedFilesCount: 50,
      newBooksCount: 3,
      updatedBooksCount: 0,
      skippedBooksCount: 47,
      failedCount: 0,
      newBookIds: ['1', '2', '3'],
    };
    store.showNotification = true;

    const wrapper = mount(ScanStatusNotification);

    expect(wrapper.find('[data-testid="scan-progress-tooltip"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Found 3 new books in your library');
    expect(wrapper.text()).toContain('View Books');

    // Click "View Books" navigates to home and dismisses notification
    const buttons = wrapper.findAll('button');
    const viewBtn = buttons.find((btn) => btn.text().includes('View Books'));
    expect(viewBtn).toBeDefined();
    await viewBtn?.trigger('click');

    expect(mockRouterReplace).toHaveBeenCalledWith('/');
    expect(store.showNotification).toBe(false);
  });

  it('auto-dismisses notification banner after 6 seconds timer', async () => {
    const store = useScannerStore();
    store.isScanning = false;
    store.lastScanSummary = {
      scannedFilesCount: 10,
      newBooksCount: 2,
      updatedBooksCount: 0,
      skippedBooksCount: 8,
      failedCount: 0,
      newBookIds: ['1', '2'],
    };

    mount(ScanStatusNotification);

    // Trigger watcher by toggling showNotification
    store.showNotification = true;
    await vi.advanceTimersByTimeAsync(3000);
    expect(store.showNotification).toBe(true);

    await vi.advanceTimersByTimeAsync(3000);
    expect(store.showNotification).toBe(false);
  });
});
