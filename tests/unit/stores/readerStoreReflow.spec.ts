import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useReaderStore } from '~/stores/readerStore';
import type { ReflowBlock } from '~/types';

describe('ReaderStore Reflow Mode & Typography Settings', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('should initialize reflow state with default values', () => {
    const store = useReaderStore();
    expect(store.isReflowMode).toBe(false);
    expect(store.reflowFontSize).toBe(18);
    expect(store.reflowLineHeight).toBe(1.65);
    expect(store.reflowFontFamily).toBe('serif');
    expect(store.reflowTheme).toBe('light');
    expect(store.reflowCache.size).toBe(0);
  });

  it('should toggle reflow mode and persist in localStorage', () => {
    const store = useReaderStore();
    store.toggleReflowMode();
    expect(store.isReflowMode).toBe(true);

    const raw = localStorage.getItem('bookstery_reflow_settings');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.isReflowMode).toBe(true);

    store.setReflowMode(false);
    expect(store.isReflowMode).toBe(false);
  });

  it('should clamp reflowFontSize between 14 and 28', () => {
    const store = useReaderStore();
    store.setReflowFontSize(10);
    expect(store.reflowFontSize).toBe(14);

    store.setReflowFontSize(35);
    expect(store.reflowFontSize).toBe(28);

    store.setReflowFontSize(22);
    expect(store.reflowFontSize).toBe(22);
  });

  it('should clamp reflowLineHeight between 1.4 and 2.0', () => {
    const store = useReaderStore();
    store.setReflowLineHeight(1.2);
    expect(store.reflowLineHeight).toBe(1.4);

    store.setReflowLineHeight(2.5);
    expect(store.reflowLineHeight).toBe(2.0);

    store.setReflowLineHeight(1.75);
    expect(store.reflowLineHeight).toBe(1.75);
  });

  it('should update reflow font family and theme', () => {
    const store = useReaderStore();
    store.setReflowFontFamily('sans');
    expect(store.reflowFontFamily).toBe('sans');

    store.setReflowTheme('sepia');
    expect(store.reflowTheme).toBe('sepia');
    expect(store.reflowThemeColors).toEqual({ bg: '#f8f1e3', text: '#433422' });

    store.setReflowTheme('dark');
    expect(store.reflowTheme).toBe('dark');
    expect(store.reflowThemeColors).toEqual({ bg: '#111827', text: '#f3f4f6' });
  });

  it('should cache ReflowBlock[] per page and clear cache when changing book', () => {
    const store = useReaderStore();
    const blocks: ReflowBlock[] = [
      { id: '1', type: 'h2', text: 'Title', pageNumber: 1 },
      { id: '2', type: 'p', text: 'Paragraph', pageNumber: 1 },
    ];

    expect(store.getCachedReflowBlocks(1)).toBeUndefined();
    store.setCachedReflowBlocks(1, blocks);
    expect(store.getCachedReflowBlocks(1)).toEqual(blocks);

    store.clearReflowCache();
    expect(store.getCachedReflowBlocks(1)).toBeUndefined();
  });
});
