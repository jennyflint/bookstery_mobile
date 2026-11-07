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

    it('extracts exact blockId, partType, and character offsets in handleSelection and syncs to highlightStore', () => {
      const readerStore = useReaderStore();
      const highlightStore = useHighlightStore();
      const { handleSelection } = useTextSelection();

      const bubble = document.createElement('div');
      bubble.setAttribute('data-block-id', 'bubble-42');
      bubble.setAttribute('data-part-type', 'dialogue');
      bubble.textContent = 'Я певен, що треба йти';
      document.body.appendChild(bubble);

      const range = document.createRange();
      const textNode = bubble.firstChild as Text;
      // Select the single letter "е" inside "певен" (index 3 to 4)
      range.setStart(textNode, 3);
      range.setEnd(textNode, 4);

      vi.spyOn(window, 'getSelection').mockReturnValue({
        toString: () => 'е',
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => range,
        removeAllRanges: vi.fn(),
      } as unknown as Selection);

      handleSelection();
      vi.advanceTimersByTime(SELECTION_SETTLE_MS);

      expect(readerStore.selection).not.toBeNull();
      expect(readerStore.selection?.text).toBe('е');
      expect(readerStore.selection?.blockId).toBe('bubble-42');
      expect(readerStore.selection?.partType).toBe('dialogue');
      expect(readerStore.selection?.startOffset).toBe(3);
      expect(readerStore.selection?.endOffset).toBe(4);

      expect(highlightStore.activeSelection).not.toBeNull();
      expect(highlightStore.activeSelection?.text).toBe('е');
      expect(highlightStore.activeSelection?.blockId).toBe('bubble-42');
      expect(highlightStore.activeSelection?.partType).toBe('dialogue');
      expect(highlightStore.activeSelection?.startOffset).toBe(3);
      expect(highlightStore.activeSelection?.endOffset).toBe(4);

      bubble.remove();
    });

    it('dismisses active selection on book exit or page navigation', () => {
      const readerStore = useReaderStore();
      const highlightStore = useHighlightStore();
      const { dismissSelection } = useTextSelection();

      readerStore.setSelection({
        text: 'Sample selection',
        locator: '1',
        blockId: 'block-1',
        startOffset: 0,
        endOffset: 6,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      });
      highlightStore.setActiveSelection({
        text: 'Sample selection',
        locator: '1',
        format: 'epub',
        blockId: 'block-1',
        startOffset: 0,
        endOffset: 6,
        x: 0,
        y: 0,
      });

      expect(readerStore.selection).not.toBeNull();
      expect(highlightStore.activeSelection).not.toBeNull();

      dismissSelection();

      expect(readerStore.selection).toBeNull();
      expect(highlightStore.activeSelection).toBeNull();
      expect(highlightStore.selectedHighlight).toBeNull();
    });

    it('clearSelection resets both readerStore.selection and highlightStore.activeSelection', () => {
      const readerStore = useReaderStore();
      const highlightStore = useHighlightStore();
      const { clearSelection } = useTextSelection();

      readerStore.setSelection({
        text: 'Temporary selected word',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      });
      highlightStore.setActiveSelection({
        text: 'Temporary selected word',
        locator: '1',
        format: 'epub',
        x: 0,
        y: 0,
      });

      expect(readerStore.selection).not.toBeNull();
      expect(highlightStore.activeSelection).not.toBeNull();

      clearSelection();

      expect(readerStore.selection).toBeNull();
      expect(highlightStore.activeSelection).toBeNull();
    });

    it('applyEngineSelection always updates highlightStore.activeSelection even without locator or blockId', () => {
      const readerStore = useReaderStore();
      const highlightStore = useHighlightStore();
      const { applyEngineSelection } = useTextSelection();

      highlightStore.setActiveSelection({
        text: 'Previous old paragraph selection',
        locator: '1',
        format: 'epub',
        x: 0,
        y: 0,
      });

      applyEngineSelection({
        text: 'New selected word in iframe',
      });

      expect(readerStore.selection?.text).toBe('New selected word in iframe');
      expect(highlightStore.activeSelection?.text).toBe('New selected word in iframe');
      expect(highlightStore.activeSelection?.locator).toBe('1');
    });
  });
});
