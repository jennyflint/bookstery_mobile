import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ScanDirectoriesSettings from '../../../app/components/settings/ScanDirectoriesSettings.vue';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { useScannerStore } from '../../../app/stores/scannerStore';
import { AutoScanService } from '../../../app/services/scanner/AutoScanService';

describe('ScanDirectoriesSettings Component', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should render toggle switches and action buttons without manual text inputs', () => {
    const wrapper = mount(ScanDirectoriesSettings, {
      global: {
        mocks: {
          t: (key: string) => key,
        },
      },
    });

    expect(wrapper.find('[data-testid="toggle-auto-scan"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="toggle-recursive-scan"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-folder-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="manual-scan-btn"]').exists()).toBe(true);
    expect(wrapper.find('input[type="text"]').exists()).toBe(false);
  });

  it('should trigger native FilePicker.pickDirectory when add folder button is clicked', async () => {
    vi.spyOn(FilePicker, 'pickDirectory').mockResolvedValue({
      path: 'content://com.android.externalstorage.documents/tree/primary%3ABooks',
    });
    vi.spyOn(AutoScanService.getInstance(), 'validateDirectoryAccess').mockResolvedValue(true);

    const wrapper = mount(ScanDirectoriesSettings, {
      global: {
        mocks: {
          t: (key: string) => key,
        },
      },
    });

    const addBtn = wrapper.find('[data-testid="add-folder-btn"]');
    await addBtn.trigger('click');
    await flushPromises();

    expect(FilePicker.pickDirectory).toHaveBeenCalledTimes(1);

    const store = useScannerStore();
    expect(store.directories.length).toBe(1);
    expect(store.directories[0].display_name).toBe('Books');
    expect(store.directories[0].uri).toBe(
      'content://com.android.externalstorage.documents/tree/primary%3ABooks',
    );
  });
});
