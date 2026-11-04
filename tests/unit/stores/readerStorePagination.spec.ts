import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useReaderStore } from '~/stores/readerStore';
import { useSettingsStore, SETTINGS_STORAGE_KEY } from '~/stores/useSettingsStore';

const READER_STORAGE_KEY = 'bookstery_reader_settings';

describe('readerStore pagination mode and persistence', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes paginationMode to scroll by default when localStorage is empty', () => {
    const readerStore = useReaderStore();
    expect(readerStore.settings.paginationMode).toBe('scroll');
  });

  it('restores saved paginationMode paginated from bookstery_reader_settings', () => {
    localStorage.setItem(
      READER_STORAGE_KEY,
      JSON.stringify({
        paginationMode: 'paginated',
      }),
    );

    const readerStore = useReaderStore();
    expect(readerStore.settings.paginationMode).toBe('paginated');
  });

  it('restores saved paginationMode scroll from bookstery_reader_settings', () => {
    localStorage.setItem(
      READER_STORAGE_KEY,
      JSON.stringify({
        paginationMode: 'scroll',
      }),
    );

    const readerStore = useReaderStore();
    expect(readerStore.settings.paginationMode).toBe('scroll');
  });

  it('normalizes legacy buttons mode to paginated from storage', () => {
    localStorage.setItem(
      READER_STORAGE_KEY,
      JSON.stringify({
        paginationMode: 'buttons',
      }),
    );

    const readerStore = useReaderStore();
    expect(readerStore.settings.paginationMode).toBe('paginated');
  });

  it('falls back to bookstery_screen_control_settings when reader storage has invalid mode', () => {
    localStorage.setItem(
      READER_STORAGE_KEY,
      JSON.stringify({
        paginationMode: 'invalid-mode',
      }),
    );
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        paginationMode: 'paginated',
      }),
    );

    const readerStore = useReaderStore();
    expect(readerStore.settings.paginationMode).toBe('paginated');
  });

  it('falls back to scroll when neither storage key has a valid paginationMode', () => {
    localStorage.setItem(
      READER_STORAGE_KEY,
      JSON.stringify({
        paginationMode: 'unknown-mode',
      }),
    );
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        paginationMode: 'corrupt-value',
      }),
    );

    const readerStore = useReaderStore();
    expect(readerStore.settings.paginationMode).toBe('scroll');
  });

  it('persists paginationMode and syncs with settingsStore without infinite recursion', () => {
    const readerStore = useReaderStore();
    const settingsStore = useSettingsStore();

    expect(readerStore.settings.paginationMode).toBe('scroll');
    expect(settingsStore.paginationMode).toBe('scroll');

    readerStore.setPaginationMode('paginated');

    expect(readerStore.settings.paginationMode).toBe('paginated');
    expect(settingsStore.paginationMode).toBe('paginated');

    const readerStored = JSON.parse(localStorage.getItem(READER_STORAGE_KEY) || '{}');
    const settingsStored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');

    expect(readerStored.paginationMode).toBe('paginated');
    expect(settingsStored.paginationMode).toBe('paginated');

    readerStore.setPaginationMode('scroll');

    expect(readerStore.settings.paginationMode).toBe('scroll');
    expect(settingsStore.paginationMode).toBe('scroll');

    const readerStoredScroll = JSON.parse(localStorage.getItem(READER_STORAGE_KEY) || '{}');
    const settingsStoredScroll = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');

    expect(readerStoredScroll.paginationMode).toBe('scroll');
    expect(settingsStoredScroll.paginationMode).toBe('scroll');
  });

  it('resets paginationMode to scroll and syncs with settingsStore on resetToDefault', () => {
    const readerStore = useReaderStore();
    const settingsStore = useSettingsStore();

    readerStore.setPaginationMode('paginated');
    expect(readerStore.settings.paginationMode).toBe('paginated');
    expect(settingsStore.paginationMode).toBe('paginated');

    readerStore.resetToDefault();

    expect(readerStore.settings.paginationMode).toBe('scroll');
    expect(settingsStore.paginationMode).toBe('scroll');

    const readerStored = JSON.parse(localStorage.getItem(READER_STORAGE_KEY) || '{}');
    expect(readerStored.paginationMode).toBe('scroll');
  });
});
