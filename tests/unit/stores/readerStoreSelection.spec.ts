import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useReaderStore } from '~/stores/readerStore';
import { useHighlightStore } from '~/stores/highlightStore';
import { registerEngineSelectionClearer } from '~/services/selection/SelectionGuard';
import type { BookRecord } from '~/types';

describe('readerStore selection state management', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    registerEngineSelectionClearer(null);
    vi.restoreAllMocks();
  });

  it('centralized clearTextSelection() resets all selection state and getters to empty', () => {
    const readerStore = useReaderStore();
    const highlightStore = useHighlightStore();

    readerStore.setSelection({
      text: 'Selected text excerpt',
      locator: 'epubcfi(/6/4[chap01]!/4/2/10:5)',
      contextSentence: 'This is the surrounding context sentence.',
      x: 100,
      y: 200,
      width: 50,
      height: 20,
    });

    highlightStore.setActiveSelection({
      text: 'Selected text excerpt',
      locator: 'epubcfi(/6/4[chap01]!/4/2/10:5)',
      format: 'epub',
      x: 100,
      y: 200,
    });

    highlightStore.selectedHighlight = {
      id: 'hl-1',
      book_id: 'book-1',
      selected_text: 'Highlighted excerpt',
      color: 'yellow',
      locator: '1',
      format: 'pdf',
      note: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    expect(readerStore.selectedText).toBe('Selected text excerpt');
    expect(readerStore.selectedCfi).toBe('epubcfi(/6/4[chap01]!/4/2/10:5)');
    expect(readerStore.selectedCfiOrPage).toBe('epubcfi(/6/4[chap01]!/4/2/10:5)');
    expect(readerStore.selectionContext).toBe('This is the surrounding context sentence.');
    expect(readerStore.selectionContextSentence).toBe('This is the surrounding context sentence.');
    expect(highlightStore.activeSelection).not.toBeNull();
    expect(highlightStore.selectedHighlight).not.toBeNull();

    readerStore.clearTextSelection();

    expect(readerStore.selection).toBeNull();
    expect(readerStore.selectedText).toBe('');
    expect(readerStore.selectedCfi).toBe('');
    expect(readerStore.selectedCfiOrPage).toBe('');
    expect(readerStore.selectionContext).toBe('');
    expect(readerStore.selectionContextSentence).toBe('');
    expect(highlightStore.activeSelection).toBeNull();
    expect(highlightStore.selectedHighlight).toBeNull();
  });

  it('safely clears native window and iframe selections, and calls registered engine selection clearer', () => {
    const removeRangeMock = vi.fn();
    vi.spyOn(window, 'getSelection').mockReturnValue({
      removeAllRanges: removeRangeMock,
    } as unknown as Selection);

    const iframeRemoveRangeMock = vi.fn();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    if (iframe.contentWindow) {
      vi.spyOn(iframe.contentWindow, 'getSelection').mockReturnValue({
        removeAllRanges: iframeRemoveRangeMock,
      } as unknown as Selection);
    }

    const engineClearerMock = vi.fn();
    registerEngineSelectionClearer(engineClearerMock);

    const readerStore = useReaderStore();
    readerStore.clearTextSelection();

    expect(removeRangeMock).toHaveBeenCalled();
    expect(engineClearerMock).toHaveBeenCalled();

    document.body.removeChild(iframe);
  });

  it('automatically clears selection when switching books via setBook()', () => {
    const readerStore = useReaderStore();
    const clearSpy = vi.spyOn(readerStore, 'clearTextSelection');

    readerStore.setSelection({
      text: 'Text from Book 1',
      locator: '1',
      x: 0,
      y: 0,
    });

    const book1: BookRecord = {
      id: 'book-1',
      title: 'First Book',
      author: 'Author A',
      format: 'epub',
      file_path: 'b1.epub',
      file_size: 100,
      total_items: 10,
      cover_path: null,
      locator: '1',
      progress_percentage: 0,
      last_read_at: Date.now(),
      updated_at: Date.now(),
    };
    readerStore.setBook(book1);

    expect(clearSpy).toHaveBeenCalled();
    expect(readerStore.selectedText).toBe('');
    expect(readerStore.selection).toBeNull();
  });

  it('automatically clears selection when turning page via goToPage()', async () => {
    const readerStore = useReaderStore();
    readerStore.totalPages = 10;
    const clearSpy = vi.spyOn(readerStore, 'clearTextSelection');

    readerStore.setSelection({
      text: 'Text on page 1',
      locator: '1',
      x: 0,
      y: 0,
    });

    await readerStore.goToPage(2);

    expect(clearSpy).toHaveBeenCalled();
    expect(readerStore.selectedText).toBe('');
    expect(readerStore.currentPage).toBe(2);
  });

  it('automatically clears selection when updateLocation() detects page or locator turn', () => {
    const readerStore = useReaderStore();
    readerStore.locator = '1';
    readerStore.currentPage = 1;

    readerStore.setSelection({
      text: 'Text before page relocation',
      locator: '1',
      x: 0,
      y: 0,
    });

    readerStore.updateLocation({
      locator: '2',
      progressPercentage: 50,
      currentPage: 2,
    });

    expect(readerStore.selection).toBeNull();
    expect(readerStore.selectedText).toBe('');
  });
});
