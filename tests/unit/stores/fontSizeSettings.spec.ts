import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSettingsStore, SETTINGS_STORAGE_KEY } from '~/stores/useSettingsStore';
import { useReaderStore } from '~/stores/readerStore';

describe('Font Size Settings & Store Synchronization', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('initializes fontSize to default 18px and scale 1.0', () => {
    const settingsStore = useSettingsStore();
    const readerStore = useReaderStore();

    expect(settingsStore.fontSize).toBe(18);
    expect(settingsStore.fontScale).toBe(1.0);
    expect(readerStore.settings.fontSize).toBe(18);
    expect(readerStore.fontScale).toBe(1.0);
    expect(readerStore.reflowFontSize).toBe(18);
  });

  it('updates fontSize and computes fontScale correctly', () => {
    const settingsStore = useSettingsStore();

    settingsStore.setFontSize(24);
    expect(settingsStore.fontSize).toBe(24);
    expect(settingsStore.fontScale).toBe(1.33);

    settingsStore.setFontSize(12);
    expect(settingsStore.fontSize).toBe(12);
    expect(settingsStore.fontScale).toBe(0.67);
  });

  it('clamps fontSize within bounds [12, 32]', () => {
    const settingsStore = useSettingsStore();

    settingsStore.setFontSize(8);
    expect(settingsStore.fontSize).toBe(12);

    settingsStore.setFontSize(48);
    expect(settingsStore.fontSize).toBe(32);

    const readerStore = useReaderStore();
    readerStore.setFontSize(6);
    expect(readerStore.settings.fontSize).toBe(12);

    readerStore.setFontSize(50);
    expect(readerStore.settings.fontSize).toBe(32);
  });

  it('supports increaseFontSize, decreaseFontSize, and resetFontSize', () => {
    const settingsStore = useSettingsStore();

    settingsStore.setFontSize(18);
    settingsStore.increaseFontSize();
    expect(settingsStore.fontSize).toBe(20);

    settingsStore.decreaseFontSize();
    settingsStore.decreaseFontSize();
    expect(settingsStore.fontSize).toBe(16);

    settingsStore.resetFontSize();
    expect(settingsStore.fontSize).toBe(18);
  });

  it('synchronizes fontSize between useSettingsStore and useReaderStore', () => {
    const settingsStore = useSettingsStore();
    const readerStore = useReaderStore();

    settingsStore.setFontSize(22);
    expect(readerStore.settings.fontSize).toBe(22);
    expect(readerStore.reflowFontSize).toBe(22);

    readerStore.increaseFontSize();
    expect(readerStore.settings.fontSize).toBe(24);
    expect(settingsStore.fontSize).toBe(24);
  });

  it('persists fontSize to localStorage', () => {
    const settingsStore = useSettingsStore();
    settingsStore.setFontSize(26);

    const storedRaw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    expect(storedRaw).toBeTruthy();
    const parsed = JSON.parse(storedRaw!);
    expect(parsed.fontSize).toBe(26);
  });
});
