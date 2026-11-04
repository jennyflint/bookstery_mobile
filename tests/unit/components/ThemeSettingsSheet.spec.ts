import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ThemeSettingsSheet from '~/components/reader/ThemeSettingsSheet.vue';
import { useReaderStore } from '~/stores/readerStore';
import { useSettingsStore, SETTINGS_STORAGE_KEY } from '~/stores/useSettingsStore';

const READER_STORAGE_KEY = 'bookstery_reader_settings';

describe('ThemeSettingsSheet pagination mode controls', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  const createWrapper = () => {
    return mount(ThemeSettingsSheet, {
      props: {
        isOpen: true,
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          SyncButton: true,
          ScreenControlSettings: true,
        },
        mocks: {
          t: (key: string) => key,
        },
      },
    });
  };

  it('renders with default scroll pagination mode active', () => {
    const wrapper = createWrapper();
    const readerStore = useReaderStore();
    expect(readerStore.settings.paginationMode).toBe('scroll');

    const scrollBtn = wrapper.find('[data-testid="pagination-mode-scroll"]');
    const paginatedBtn = wrapper.find('[data-testid="pagination-mode-paginated"]');

    expect(scrollBtn.classes()).toContain('bg-white');
    expect(scrollBtn.classes()).toContain('text-indigo-600');
    expect(paginatedBtn.classes()).toContain('text-zinc-600');
  });

  it('selects paginated mode, emits change-pagination, and persists to localStorage', async () => {
    const wrapper = createWrapper();
    const readerStore = useReaderStore();
    const settingsStore = useSettingsStore();

    const paginatedBtn = wrapper.find('[data-testid="pagination-mode-paginated"]');
    await paginatedBtn.trigger('click');

    expect(readerStore.settings.paginationMode).toBe('paginated');
    expect(settingsStore.paginationMode).toBe('paginated');
    expect(wrapper.emitted('change-pagination')?.[0]).toEqual(['paginated']);

    const readerStored = JSON.parse(localStorage.getItem(READER_STORAGE_KEY) || '{}');
    const settingsStored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
    expect(readerStored.paginationMode).toBe('paginated');
    expect(settingsStored.paginationMode).toBe('paginated');
  });

  it('selects scroll mode, emits change-pagination, and persists to localStorage', async () => {
    const wrapper = createWrapper();
    const readerStore = useReaderStore();
    readerStore.setPaginationMode('paginated');
    await wrapper.vm.$nextTick();

    const scrollBtn = wrapper.find('[data-testid="pagination-mode-scroll"]');
    await scrollBtn.trigger('click');

    expect(readerStore.settings.paginationMode).toBe('scroll');
    expect(wrapper.emitted('change-pagination')?.[0]).toEqual(['scroll']);

    const readerStored = JSON.parse(localStorage.getItem(READER_STORAGE_KEY) || '{}');
    expect(readerStored.paginationMode).toBe('scroll');
  });
});
