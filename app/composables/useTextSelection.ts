import { onMounted, onUnmounted, getCurrentInstance, watch } from 'vue';
import { useReaderStore } from '../stores/readerStore';
import { useHighlightStore } from '../stores/highlightStore';
import {
  SELECTION_SETTLE_MS,
  clearAllNativeSelections,
  extractContextSentence,
  getWindowSelectionText,
  hasActiveNativeSelection,
  isWithinSelectionLock,
  markSelectionActivity,
  registerEngineSelectionClearer,
  resetSelectionActivity,
  shouldIgnoreReaderTap,
} from '../services/selection/SelectionGuard';
import type { BookFormat, EngineSelectionDetail, TextSelectionDetail } from '../types';

/*
 * Module-level state: the selection lifecycle is global to the reader page, while
 * `useTextSelection()` is called from several components. Listeners are ref-counted
 * so the document is only observed once.
 */
let documentDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let dismissVerifyTimer: ReturnType<typeof setTimeout> | null = null;
let listenerRefCount = 0;
let engineSelectionClearer: (() => void) | null = null;
let registeredSelectionHandler: (() => void) | null = null;
const boundIframeDocuments = new WeakSet<Document>();

/** Marks the selection lock when a gesture ends while text is still selected. */
const handleGestureEnd = (event: Event): void => {
  const target = event.target as Node | null;
  const win = target?.ownerDocument?.defaultView ?? (typeof window !== 'undefined' ? window : null);
  if (getWindowSelectionText(win).length > 0 || getWindowSelectionText(window).length > 0) {
    markSelectionActivity();
  }
};

export function useTextSelection() {
  const readerStore = useReaderStore();
  const highlightStore = useHighlightStore();

  const buildDetail = (
    sel: Selection,
    text: string,
    offset: { left: number; top: number } = { left: 0, top: 0 },
  ): TextSelectionDetail => {
    let blockId: string | undefined;
    let partType: string | undefined;
    let startOffset: number | undefined;
    let endOffset: number | undefined;

    const detail: TextSelectionDetail = {
      text,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      locator: readerStore.locator || String(readerStore.currentPage),
    };
    try {
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        detail.contextSentence = extractContextSentence(range, text);

        const startNode = range.startContainer;
        const startElem = (
          startNode.nodeType === Node.ELEMENT_NODE
            ? startNode
            : startNode.parentElement
        ) as HTMLElement | null;

        const blockContainer =
          startElem?.closest<HTMLElement>(
            '[data-block-id], [data-message-id], [data-line-index], .pdf-text-layer span, .djvu-text-layer span, .textLayer span, [id^="fb2-p-"], [id^="mobi-p-"], [id^="reflow-"]',
          ) ??
          startElem?.closest<HTMLElement>(
            'p, h1, h2, h3, h4, h5, h6, [data-part-type]',
          );

        if (blockContainer) {
          blockId =
            blockContainer.getAttribute('data-block-id') ||
            blockContainer.getAttribute('data-message-id') ||
            blockContainer.getAttribute('data-line-index') ||
            (blockContainer.id ? blockContainer.id : undefined);

          const partElem = startElem?.closest<HTMLElement>('[data-part-type]');
          partType =
            partElem?.getAttribute('data-part-type') ||
            blockContainer.getAttribute('data-part-type') ||
            undefined;

          try {
            const preRange = range.cloneRange();
            preRange.selectNodeContents(blockContainer);
            preRange.setEnd(range.startContainer, range.startOffset);
            startOffset = preRange.toString().length;
            endOffset = startOffset + range.toString().length;
          } catch {
            // Measurement range error fallback
          }
        }

        const rect = range.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          detail.x = Math.round(offset.left + rect.left + rect.width / 2);
          detail.y = Math.round(offset.top + rect.top);
          detail.width = Math.round(rect.width);
          detail.height = Math.round(rect.height);
        }
      }
    } catch {
      // Range geometry is optional.
    }

    detail.blockId = blockId;
    detail.partType = partType;
    detail.startOffset = startOffset;
    detail.endOffset = endOffset;

    return detail;
  };

  /**
   * Top-level document `selectionchange` handler (PDF text layer, PDF reflow, FB2).
   * Selection state is sticky: an empty / collapsed selection NEVER clears the state here,
   * because Android WebView emits transient empty selections while dragging handles or when
   * the selection bar mounts. Dismissal is explicit (close button, action, page tap, page turn).
   */
  const handleSelection = (): void => {
    if (typeof window === 'undefined') return;

    if (getWindowSelectionText(window).length > 0) {
      markSelectionActivity();
    }

    if (documentDebounceTimer) {
      clearTimeout(documentDebounceTimer);
    }

    documentDebounceTimer = setTimeout(() => {
      documentDebounceTimer = null;
      const activeSelection = window.getSelection();
      if (!activeSelection || activeSelection.isCollapsed) return;

      const selectedText = activeSelection.toString().trim();
      if (!selectedText) return;

      markSelectionActivity();
      cancelPendingDismiss();
      const detail = buildDetail(activeSelection, selectedText);
      readerStore.setSelection(detail);
      highlightStore.setActiveSelection({
        ...detail,
        locator: detail.locator || readerStore.locator || String(readerStore.currentPage),
        format: (readerStore.currentBook?.format || 'epub') as BookFormat,
      });
    }, SELECTION_SETTLE_MS);
  };

  /**
   * Applies a selection reported by an engine that renders into its own document
   * (EPUB iframes). Updates the same reactive state used for PDF selections.
   */
  const applyEngineSelection = (detail: EngineSelectionDetail): void => {
    const text = detail.text.trim();
    if (!text) return;

    markSelectionActivity();
    cancelPendingDismiss();

    const rect = detail.rect ?? { x: 0, y: 0, width: 0, height: 0 };
    readerStore.setSelection({
      text,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      locator: detail.locator,
      contextSentence: detail.contextSentence,
      blockId: detail.blockId,
      partType: detail.partType,
      startOffset: detail.startOffset,
      endOffset: detail.endOffset,
    });

    highlightStore.setActiveSelection({
      text,
      locator: detail.locator || readerStore.locator || String(readerStore.currentPage || 1),
      format: (readerStore.currentBook?.format || 'epub') as BookFormat,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      blockId: detail.blockId,
      partType: detail.partType,
      startOffset: detail.startOffset,
      endOffset: detail.endOffset,
    });
  };

  /**
   * Binds sticky selection tracking to a same-origin iframe document.
   * Kept for engines that only expose their iframe element.
   */
  const bindIframeSelection = (iframe: HTMLIFrameElement): void => {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc || boundIframeDocuments.has(doc)) return;
      boundIframeDocuments.add(doc);

      let iframeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

      doc.addEventListener('selectionchange', () => {
        const win = doc.defaultView;
        if (getWindowSelectionText(win).length > 0) {
          markSelectionActivity();
        }
        if (iframeDebounceTimer) {
          clearTimeout(iframeDebounceTimer);
        }
        iframeDebounceTimer = setTimeout(() => {
          iframeDebounceTimer = null;
          const sel = doc.getSelection();
          if (!sel || sel.isCollapsed) return;
          const text = sel.toString().trim();
          if (!text) return;

          const iframeRect = iframe.getBoundingClientRect();
          const detail = buildDetail(sel, text, { left: iframeRect.left, top: iframeRect.top });
          applyEngineSelection({
            text,
            locator: readerStore.selection?.locator,
            contextSentence: detail.contextSentence,
            rect: { x: detail.x, y: detail.y, width: detail.width ?? 0, height: detail.height ?? 0 },
            blockId: detail.blockId,
            partType: detail.partType,
            startOffset: detail.startOffset,
            endOffset: detail.endOffset,
          });
        }, SELECTION_SETTLE_MS);
      });
      doc.addEventListener('mouseup', handleGestureEnd, true);
      doc.addEventListener('touchend', handleGestureEnd, true);
    } catch {
      // Cross-origin or detached iframe: ignore.
    }
  };

  /** Registers the active engine's own selection clearer (e.g. EPUB `rendition.getContents()`). */
  const registerSelectionClearer = (clearer: (() => void) | null): void => {
    engineSelectionClearer = clearer;
    registerEngineSelectionClearer(clearer);
  };

  function cancelPendingDismiss(): void {
    if (dismissVerifyTimer) {
      clearTimeout(dismissVerifyTimer);
      dismissVerifyTimer = null;
    }
  }

  /** Clears reactive selection state and all native selections (top-level + iframes). */
  const clearSelection = (): void => {
    if (documentDebounceTimer) {
      clearTimeout(documentDebounceTimer);
      documentDebounceTimer = null;
    }
    cancelPendingDismiss();
    resetSelectionActivity();
    readerStore.clearTextSelection();
    highlightStore.setActiveSelection(null);

    try {
      engineSelectionClearer?.();
    } catch {
      // Engine may already be destroyed.
    }
    clearAllNativeSelections();
  };

  /** Clears the selection and every related highlight state, hiding the selection bar. */
  const dismissSelection = (): void => {
    clearSelection();
    highlightStore.setActiveSelection(null);
    highlightStore.selectedHighlight = null;
  };

  const hasStickySelection = (): boolean =>
    !!readerStore.selection || !!highlightStore.activeSelection || !!highlightStore.selectedHighlight;

  /**
   * Central reader tap guard shared by the viewport, PDF reflow view and EPUB iframes.
   *
   * - Ignores taps that are part of a selection gesture (active native selection, or a
   *   non-empty selection observed within the last 400ms).
   * - If a sticky selection is shown, the tap only dismisses it, after verifying (150ms later)
   *   that no new selection is being made in the document or any EPUB iframe.
   * - Otherwise runs `onTap` (toggle UI, etc.).
   *
   * @returns true when the tap was consumed by the selection lifecycle.
   */
  const handleReaderTap = (onTap?: () => void, sourceWindow?: Window | null): boolean => {
    if (shouldIgnoreReaderTap(sourceWindow)) {
      return true;
    }

    if (hasStickySelection()) {
      cancelPendingDismiss();
      dismissVerifyTimer = setTimeout(() => {
        dismissVerifyTimer = null;
        const sourceHasSelection = getWindowSelectionText(sourceWindow).length > 0;
        if (!sourceHasSelection && !hasActiveNativeSelection() && !isWithinSelectionLock()) {
          dismissSelection();
        }
      }, SELECTION_SETTLE_MS);
      return true;
    }

    onTap?.();
    return false;
  };

  if (getCurrentInstance()) {
    watch(
      () => readerStore.currentBook?.id,
      (newId, oldId) => {
        if (newId !== oldId) {
          dismissSelection();
        }
      },
    );

    watch(
      () => readerStore.currentPage,
      (newPage, oldPage) => {
        if (newPage !== oldPage) {
          dismissSelection();
        }
      },
    );

    onMounted(() => {
      if (typeof document === 'undefined') return;
      if (listenerRefCount === 0) {
        registeredSelectionHandler = handleSelection;
        document.addEventListener('selectionchange', registeredSelectionHandler);
        document.addEventListener('mouseup', handleGestureEnd, true);
        document.addEventListener('touchend', handleGestureEnd, true);
      }
      listenerRefCount++;
    });

    onUnmounted(() => {
      if (typeof document === 'undefined') return;
      listenerRefCount = Math.max(0, listenerRefCount - 1);
      if (listenerRefCount === 0) {
        if (documentDebounceTimer) {
          clearTimeout(documentDebounceTimer);
          documentDebounceTimer = null;
        }
        cancelPendingDismiss();
        if (registeredSelectionHandler) {
          document.removeEventListener('selectionchange', registeredSelectionHandler);
          registeredSelectionHandler = null;
        }
        document.removeEventListener('mouseup', handleGestureEnd, true);
        document.removeEventListener('touchend', handleGestureEnd, true);
        dismissSelection();
      }
    });
  }

  return {
    handleSelection,
    applyEngineSelection,
    bindIframeSelection,
    registerSelectionClearer,
    clearSelection,
    dismissSelection,
    clearTextSelection: dismissSelection,
    hasStickySelection,
    handleReaderTap,
  };
}
