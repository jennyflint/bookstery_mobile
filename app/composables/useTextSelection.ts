import { onMounted, onUnmounted, getCurrentInstance } from 'vue';
import { useReaderStore } from '../stores/readerStore';
import type { TextSelectionDetail } from '../types';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function useTextSelection() {
  const readerStore = useReaderStore();

  const handleSelection = (): void => {
    if (typeof window === 'undefined') return;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      const activeSelection = window.getSelection();
      if (!activeSelection || activeSelection.isCollapsed) {
        if (readerStore.selection) {
          readerStore.setSelection(null);
        }
        return;
      }

      const selectedText = activeSelection.toString().trim();
      if (!selectedText) {
        if (readerStore.selection) {
          readerStore.setSelection(null);
        }
        return;
      }

      let detail: TextSelectionDetail = {
        text: selectedText,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      };

      try {
        const range = activeSelection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          detail = {
            text: selectedText,
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        }
      } catch {
      }

      readerStore.setSelection(detail);
    }, 150);
  };

  const bindIframeSelection = (iframe: HTMLIFrameElement): void => {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      doc.addEventListener('selectionchange', () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
          const sel = doc.getSelection();
          if (!sel || sel.isCollapsed) {
            if (readerStore.selection) {
              readerStore.setSelection(null);
            }
            return;
          }

          const text = sel.toString().trim();
          if (!text) {
            if (readerStore.selection) {
              readerStore.setSelection(null);
            }
            return;
          }

          let detail: TextSelectionDetail = {
            text,
            x: 0,
            y: 0,
            width: 0,
            height: 0,
          };

          try {
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const iframeRect = iframe.getBoundingClientRect();
            detail = {
              text,
              x: Math.round(iframeRect.left + rect.left + rect.width / 2),
              y: Math.round(iframeRect.top + rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
          } catch {
          }

          readerStore.setSelection(detail);
        }, 150);
      });
    } catch {
    }
  };

  const clearSelection = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    readerStore.setSelection(null);

    if (typeof window !== 'undefined') {
      try {
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
        }
      } catch {
      }

      try {
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach((iframe) => {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          iframeDoc?.getSelection()?.removeAllRanges();
        });
      } catch {
      }
    }
  };

  if (getCurrentInstance()) {
    onMounted(() => {
      if (typeof document !== 'undefined') {
        document.addEventListener('selectionchange', handleSelection);
      }
    });

    onUnmounted(() => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('selectionchange', handleSelection);
      }
    });
  }

  return {
    handleSelection,
    bindIframeSelection,
    clearSelection,
  };
}
