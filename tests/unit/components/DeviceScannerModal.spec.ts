import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { ref } from 'vue';
import DeviceScannerModal from '../../../app/components/library/DeviceScannerModal.vue';
import type { ScannedFile } from '../../../app/types';

const mockScanDevice = vi.fn();
const mockImportFiles = vi.fn();
const mockClearDuplicateNotice = vi.fn();
const mockScannedFiles = ref<ScannedFile[]>([]);
const mockIsScanning = ref(false);
const mockScanProgress = ref(0);
const mockDuplicateNotice = ref<string | null>(null);
const mockHasStoragePermissionError = ref(false);

vi.mock('../../../app/composables/useDeviceScanner', () => ({
  useDeviceScanner: () => ({
    isScanning: mockIsScanning,
    scanProgress: mockScanProgress,
    scannedFiles: mockScannedFiles,
    duplicateNotice: mockDuplicateNotice,
    hasStoragePermissionError: mockHasStoragePermissionError,
    scanDevice: mockScanDevice,
    importFiles: mockImportFiles,
    importBook: vi.fn(),
    importFromBlob: vi.fn(),
    importNativeFiles: vi.fn(),
    clearDuplicateNotice: mockClearDuplicateNotice,
  }),
}));

describe('DeviceScannerModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    mockScannedFiles.value = [];
    mockIsScanning.value = false;
    mockScanProgress.value = 0;
    mockDuplicateNotice.value = null;
    mockHasStoragePermissionError.value = false;
  });

  it('renders modal when isOpen is true and triggers scan on startScan button click', async () => {
    const scannedList: ScannedFile[] = [
      {
        name: 'Novel.epub',
        path: '/storage/emulated/0/Download/Novel.epub',
        size: 2048,
        format: 'epub',
        isDuplicate: false,
      },
      {
        name: 'Existing.pdf',
        path: '/storage/emulated/0/Download/Existing.pdf',
        size: 4096,
        format: 'pdf',
        isDuplicate: true,
      },
    ];
    mockScanDevice.mockImplementation(async () => {
      mockScannedFiles.value = scannedList;
      return scannedList;
    });

    const wrapper = mount(DeviceScannerModal, {
      props: { isOpen: true },
      global: {
        mocks: {
          t: (key: string, params?: Record<string, unknown>) => {
            if (params?.count !== undefined) return `${key}:${params.count}`;
            return key;
          },
        },
      },
    });

    expect(wrapper.find('[data-testid="device-scanner-modal"]').exists()).toBe(true);

    const scanBtn = wrapper.findAll('button').find((b) => b.text().includes('scanner.startScan'));
    expect(scanBtn).toBeDefined();
    await scanBtn!.trigger('click');
    await flushPromises();

    expect(mockScanDevice).toHaveBeenCalledTimes(1);
    const checkboxes = wrapper.findAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);
    expect((checkboxes[0].element as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[0].element as HTMLInputElement).disabled).toBe(false);
    expect((checkboxes[1].element as HTMLInputElement).disabled).toBe(true);
  });

  it('displays permission warning banner when storage permission error occurs', async () => {
    mockScanDevice.mockImplementation(async () => {
      mockHasStoragePermissionError.value = true;
      return [];
    });

    const wrapper = mount(DeviceScannerModal, {
      props: { isOpen: true },
      global: {
        mocks: {
          t: (key: string) => key,
        },
      },
    });

    const scanBtn = wrapper.findAll('button').find((b) => b.text().includes('scanner.startScan'));
    await scanBtn!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('scanner.storagePermissionError');
  });

  it('imports selected files and emits imported and close events', async () => {
    const scannedList: ScannedFile[] = [
      {
        name: 'Novel.epub',
        path: '/storage/emulated/0/Download/Novel.epub',
        size: 2048,
        format: 'epub',
        isDuplicate: false,
      },
    ];
    mockScannedFiles.value = scannedList;
    mockScanDevice.mockResolvedValue(scannedList);
    mockImportFiles.mockResolvedValue({ importedCount: 1, duplicateCount: 0 });

    const wrapper = mount(DeviceScannerModal, {
      props: { isOpen: true },
      global: {
        mocks: {
          t: (key: string, params?: Record<string, unknown>) => {
            if (params?.count !== undefined) return `${key}:${params.count}`;
            return key;
          },
        },
      },
    });

    const scanBtn = wrapper.findAll('button').find((b) => b.text().includes('scanner.startScan'));
    await scanBtn!.trigger('click');
    await flushPromises();

    const importSelectedBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('scanner.importSelected'));
    expect(importSelectedBtn).toBeDefined();
    await importSelectedBtn!.trigger('click');
    await flushPromises();

    expect(mockImportFiles).toHaveBeenCalledWith([scannedList[0]]);
    expect(wrapper.emitted('imported')).toBeTruthy();
    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
