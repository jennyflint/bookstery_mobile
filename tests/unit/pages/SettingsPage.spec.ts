import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SettingsPage from '~/pages/settings.vue';
import { useReaderStore } from '~/stores/readerStore';
import { useSettingsStore, SETTINGS_STORAGE_KEY } from '~/stores/useSettingsStore';
import { useAppThemeStore } from '~/stores/appThemeStore';

const READER_STORAGE_KEY = 'bookstery_reader_settings';

describe('SettingsPage pagination mode and reset', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  const createWrapper = () => {
    return mount(SettingsPage, {
      global: {
        plugins: [createPinia()],
        stubs: {
          AppLogo: true,
          LanguageSwitcher: true,
          GoogleSignInButton: true,
          SyncStatusBadge: true,
          ScanDirectoriesSettings: true,
          ScreenControlSettings: true,
          AiSettingsModal: true,
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

    const scrollBtn = wrapper.find('[data-testid="settings-pagination-scroll"]');
    const paginatedBtn = wrapper.find('[data-testid="settings-pagination-paginated"]');

    expect(scrollBtn.classes()).toContain('bg-white');
    expect(scrollBtn.classes()).toContain('text-indigo-600');
    expect(paginatedBtn.classes()).toContain('text-zinc-600');
  });

  it('switches to paginated mode on click, updates styles and persists to localStorage', async () => {
    const wrapper = createWrapper();
    const readerStore = useReaderStore();
    const settingsStore = useSettingsStore();

    const paginatedBtn = wrapper.find('[data-testid="settings-pagination-paginated"]');
    await paginatedBtn.trigger('click');

    expect(readerStore.settings.paginationMode).toBe('paginated');
    expect(settingsStore.paginationMode).toBe('paginated');

    const readerStored = JSON.parse(localStorage.getItem(READER_STORAGE_KEY) || '{}');
    const settingsStored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
    expect(readerStored.paginationMode).toBe('paginated');
    expect(settingsStored.paginationMode).toBe('paginated');

    expect(paginatedBtn.classes()).toContain('bg-white');
    expect(paginatedBtn.classes()).toContain('text-indigo-600');
  });

  it('switches back to scroll mode on click, updates styles and persists to localStorage', async () => {
    const wrapper = createWrapper();
    const readerStore = useReaderStore();
    readerStore.setPaginationMode('paginated');
    await wrapper.vm.$nextTick();

    const scrollBtn = wrapper.find('[data-testid="settings-pagination-scroll"]');
    await scrollBtn.trigger('click');

    expect(readerStore.settings.paginationMode).toBe('scroll');

    const readerStored = JSON.parse(localStorage.getItem(READER_STORAGE_KEY) || '{}');
    const settingsStored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
    expect(readerStored.paginationMode).toBe('scroll');
    expect(settingsStored.paginationMode).toBe('scroll');

    expect(scrollBtn.classes()).toContain('bg-white');
    expect(scrollBtn.classes()).toContain('text-indigo-600');
  });

  it('resets appThemeStore, readerStore and useSettingsStore to default scroll mode on reset button click', async () => {
    const wrapper = createWrapper();
    const readerStore = useReaderStore();
    const settingsStore = useSettingsStore();
    const appThemeStore = useAppThemeStore();

    // Modify settings away from defaults
    readerStore.setPaginationMode('paginated');
    appThemeStore.setButtonColor('#ff0000');
    expect(readerStore.settings.paginationMode).toBe('paginated');
    expect(settingsStore.paginationMode).toBe('paginated');

    // Find reset to default button
    const resetBtn = wrapper.find('[data-testid="settings-reset-defaults"]');
    expect(resetBtn.exists()).toBe(true);

    await resetBtn.trigger('click');

    expect(readerStore.settings.paginationMode).toBe('scroll');
    expect(settingsStore.paginationMode).toBe('scroll');
    expect(appThemeStore.buttonColor).toBe('#4f46e5');

    const readerStored = JSON.parse(localStorage.getItem(READER_STORAGE_KEY) || '{}');
    expect(readerStored.paginationMode).toBe('scroll');
  });
});
