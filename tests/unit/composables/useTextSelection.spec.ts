import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTextSelection } from '~/composables/useTextSelection';
import { useReaderStore } from '~/stores/readerStore';
import { useHighlightStore } from '~/stores/highlightStore';
import {
  SELECTION_SETTLE_MS,
  SELECTION_TAP_LOCK_MS,
  isWithinSelectionLock,
  markSelectionActivity,
  resetSelectionActivity,
  shouldIgnoreReaderTap,
  extractContextSentence,
} from '~/services/selection/SelectionGuard';

const mockWindowSelection = (text: string): void => {
  vi.spyOn(window, 'getSelection').mockReturnValue({
    toString: () => text,
    isCollapsed: text.length === 0,
    rangeCount: 0,
    removeAllRanges: vi.fn(),
  } as unknown as Selection);
};

describe('Selection lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    resetSelectionActivity();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('SelectionGuard', () => {
    it('locks reader taps for 400ms after a non-empty selection', () => {
      mockWindowSelection('');
      markSelectionActivity();
      expect(isWithinSelectionLock()).toBe(true);
      expect(shouldIgnoreReaderTap()).toBe(true);

      vi.advanceTimersByTime(SELECTION_TAP_LOCK_MS + 1);
      expect(isWithinSelectionLock()).toBe(false);
      expect(shouldIgnoreReaderTap()).toBe(false);
    });

    it('ignores taps while a native selection is active', () => {
      mockWindowSelection('selected words');
      expect(shouldIgnoreReaderTap()).toBe(true);
    });

    it('ignores taps when the source (iframe) window holds a selection', () => {
      mockWindowSelection('');
      const iframeWin = {
        getSelection: () => ({ toString: () => 'epub text' }),
      } as unknown as Window;
      expect(shouldIgnoreReaderTap(iframeWin)).toBe(true);
    });

    it('extracts the surrounding sentence of a selection', () => {
      const p = document.createElement('p');
      p.textContent = 'First sentence here. The quick brown fox jumps. Last one!';
      document.body.appendChild(p);
      const range = document.createRange();
      range.setStart(p.firstChild as Text, 25);
      range.setEnd(p.firstChild as Text, 36);
      expect(extractContextSentence(range, 'quick brown')).toBe('The quick brown fox jumps.');
      p.remove();
    });
  });

  describe('useTextSelection', () => {
    it('keeps selection sticky when selectionchange reports an empty selection', () => {
      const readerStore = useReaderStore();
      const { handleSelection } = useTextSelection();

      mockWindowSelection('Sticky text');
      handleSelection();
      vi.advanceTimersByTime(SELECTION_SETTLE_MS);
      expect(readerStore.selectedText).toBe('Sticky text');

      vi.restoreAllMocks();
      mockWindowSelection('');
      handleSelection();
      vi.advanceTimersByTime(SELECTION_SETTLE_MS);
      expect(readerStore.selectedText).toBe('Sticky text');
    });

    it('applies EPUB engine selections to the shared state', () => {
      const readerStore = useReaderStore();
      const highlightStore = useHighlightStore();
      const { applyEngineSelection } = useTextSelection();

      applyEngineSelection({
        text: ' EPUB words ',
        locator: 'epubcfi(/6/4!/4/2,/1:0,/1:10)',
        contextSentence: 'Some EPUB words here.',
      });

      expect(readerStore.selectedText).toBe('EPUB words');
      expect(readerStore.selectedCfiOrPage).toBe('epubcfi(/6/4!/4/2,/1:0,/1:10)');
      expect(readerStore.selectionContextSentence).toBe('Some EPUB words here.');
      expect(highlightStore.activeSelection?.locator).toBe('epubcfi(/6/4!/4/2,/1:0,/1:10)');
    });

    it('ignores the click fired right after a selection gesture', () => {
      const readerStore = useReaderStore();
      const { applyEngineSelection, handleReaderTap } = useTextSelection();
      mockWindowSelection('');
      applyEngineSelection({ text: 'Fresh selection' });

      const onTap = vi.fn();
      expect(handleReaderTap(onTap)).toBe(true);
      vi.advanceTimersByTime(SELECTION_SETTLE_MS * 2);

      expect(onTap).not.toHaveBeenCalled();
      expect(readerStore.selectedText).toBe('Fresh selection');
    });

    it('dismisses the selection on a later page tap after verifying no selection exists', () => {
      const readerStore = useReaderStore();
      const { applyEngineSelection, handleReaderTap, registerSelectionClearer } = useTextSelection();
      const engineClearer = vi.fn();
      registerSelectionClearer(engineClearer);
      mockWindowSelection('');
      applyEngineSelection({ text: 'Old selection' });

      vi.advanceTimersByTime(SELECTION_TAP_LOCK_MS + 1);
      const onTap = vi.fn();
      expect(handleReaderTap(onTap)).toBe(true);
      expect(readerStore.selectedText).toBe('Old selection');

      vi.advanceTimersByTime(SELECTION_SETTLE_MS);
      expect(onTap).not.toHaveBeenCalled();
      expect(readerStore.selection).toBeNull();
      expect(engineClearer).toHaveBeenCalled();
      registerSelectionClearer(null);
    });

    it('runs the tap action when no selection is shown', () => {
      const { handleReaderTap } = useTextSelection();
      mockWindowSelection('');
      const onTap = vi.fn();
      expect(handleReaderTap(onTap)).toBe(false);
      expect(onTap).toHaveBeenCalledOnce();
    });
  });
});
