import { onMounted, onUnmounted } from 'vue';
import { useReaderStore } from '../stores/readerStore';
import type { TextSelectionDetail } from '../types';

export function useTextSelection() {
  const readerStore = useReaderStore();

  const handleSelection = (): void => {
    if (typeof window === 'undefined') return;

    const activeSelection = window.getSelection();
    if (!activeSelection || activeSelection.isCollapsed) {
      return;
    }

    const selectedText = activeSelection.toString().trim();
    if (!selectedText) {
      return;
    }

    try {
      const range = activeSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      if (rect.width > 0 && rect.height > 0) {
        const detail: TextSelectionDetail = {
          text: selectedText,
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
        readerStore.setSelection(detail);
      }
    } catch {
    }
  };

  const bindIframeSelection = (iframe: HTMLIFrameElement): void => {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      doc.addEventListener('selectionchange', () => {
        const sel = doc.getSelection();
        if (!sel || sel.isCollapsed) return;

        const text = sel.toString().trim();
        if (!text) return;

        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const iframeRect = iframe.getBoundingClientRect();

        const detail: TextSelectionDetail = {
          text,
          x: Math.round(iframeRect.left + rect.left + rect.width / 2),
          y: Math.round(iframeRect.top + rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
        readerStore.setSelection(detail);
      });
    } catch {
    }
  };

  const clearSelection = (): void => {
    readerStore.setSelection(null);
    if (typeof window !== 'undefined') {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
      }
    }
  };

  onMounted(() => {
    if (typeof document !== 'undefined') {
      document.addEventListener('selectionchange', handleSelection);
      document.addEventListener('mouseup', handleSelection);
      document.addEventListener('touchend', handleSelection);
    }
  });

  onUnmounted(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('selectionchange', handleSelection);
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('touchend', handleSelection);
    }
  });

  return {
    handleSelection,
    bindIframeSelection,
    clearSelection,
  };
}
