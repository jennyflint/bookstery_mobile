/**
 * SelectionGuard
 *
 * Framework-agnostic helpers that coordinate the native text selection lifecycle
 * across the top-level reader document (PDF text layer, PDF reflow, FB2) and
 * isolated EPUB iframes rendered by epubjs.
 *
 * The main problem it solves: lifting a finger / mouse after selecting text fires a
 * synthetic `click` / `touchend` that bubbles to the reader tap handlers, which used to
 * toggle the UI or clear the selection immediately. Tap handlers must consult
 * `shouldIgnoreReaderTap()` before doing anything.
 */

/** Taps arriving within this window after a selection change are treated as part of the selection gesture. */
export const SELECTION_TAP_LOCK_MS = 400;

/** Delay used to debounce `selectionchange` and to verify a dismissal tap. */
export const SELECTION_SETTLE_MS = 150;

let lastSelectionTimestamp = 0;
let registeredEngineClearer: (() => void) | null = null;

/** Registers a global engine clearer (e.g. EPUB rendition) to execute on native selection clear. */
export function registerEngineSelectionClearer(clearer: (() => void) | null): void {
  registeredEngineClearer = clearer;
}

/** Records that a non-empty selection was observed right now. */
export function markSelectionActivity(timestamp: number = Date.now()): void {
  lastSelectionTimestamp = timestamp;
}

/** Returns the timestamp of the last observed non-empty selection. */
export function getLastSelectionTimestamp(): number {
  return lastSelectionTimestamp;
}

/** Resets the selection lock (used when the selection is explicitly dismissed). */
export function resetSelectionActivity(): void {
  lastSelectionTimestamp = 0;
}

/** True when a non-empty selection was observed within the lock window. */
export function isWithinSelectionLock(
  lockMs: number = SELECTION_TAP_LOCK_MS,
  now: number = Date.now(),
): boolean {
  return lastSelectionTimestamp > 0 && now - lastSelectionTimestamp < lockMs;
}

/** Reads the trimmed selected text of a window, swallowing cross-origin errors. */
export function getWindowSelectionText(win: Window | null | undefined): string {
  if (!win) return '';
  try {
    return win.getSelection()?.toString().trim() ?? '';
  } catch {
    return '';
  }
}

/** Lists same-origin iframe windows of the top-level document (EPUB chapters). */
function getIframeWindows(): Window[] {
  if (typeof document === 'undefined') return [];
  const windows: Window[] = [];
  document.querySelectorAll('iframe').forEach((iframe) => {
    try {
      if (iframe.contentWindow && iframe.contentDocument) {
        windows.push(iframe.contentWindow);
      }
    } catch {
      // Cross-origin iframe: ignore.
    }
  });
  return windows;
}

/** True when the top-level document or any same-origin iframe holds a non-empty selection. */
export function hasActiveNativeSelection(): boolean {
  if (typeof window === 'undefined') return false;
  if (getWindowSelectionText(window).length > 0) return true;
  return getIframeWindows().some((win) => getWindowSelectionText(win).length > 0);
}

/**
 * True when a reader tap/click must NOT trigger page actions (toggle UI, turn page,
 * dismiss selection) because it is part of a text selection gesture.
 */
export function shouldIgnoreReaderTap(extraWindow?: Window | null): boolean {
  if (extraWindow && getWindowSelectionText(extraWindow).length > 0) return true;
  return hasActiveNativeSelection() || isWithinSelectionLock();
}

/** Removes native selections from the top-level document, all same-origin iframes, and registered engines. */
export function clearAllNativeSelections(): void {
  if (typeof window === 'undefined') return;
  try {
    window.getSelection()?.removeAllRanges();
  } catch {
    // Ignore: selection API unavailable.
  }
  for (const win of getIframeWindows()) {
    try {
      win.getSelection()?.removeAllRanges();
    } catch {
      // Ignore: iframe already detached.
    }
  }
  try {
    registeredEngineClearer?.();
  } catch {
    // Engine may already be detached.
  }
}

const BLOCK_SELECTOR = 'p, li, blockquote, dd, dt, td, th, h1, h2, h3, h4, h5, h6, div';
const SENTENCE_TERMINATORS = /[.!?…]/;

/**
 * Extracts the sentence surrounding a selection range, using the closest block
 * element as context. Falls back to the selected text itself.
 */
export function extractContextSentence(range: Range, selectedText: string): string {
  try {
    const startNode = range.startContainer;
    const startElement =
      startNode.nodeType === Node.ELEMENT_NODE ? (startNode as Element) : startNode.parentElement;
    const block = startElement?.closest(BLOCK_SELECTOR) ?? startElement;
    const blockText = (block?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const needle = selectedText.replace(/\s+/g, ' ').trim();
    if (!blockText || !needle) return needle;

    const index = blockText.indexOf(needle);
    if (index < 0) return needle;

    let start = index;
    while (start > 0 && !SENTENCE_TERMINATORS.test(blockText.charAt(start - 1))) {
      start--;
    }
    let end = index + needle.length;
    while (end < blockText.length && !SENTENCE_TERMINATORS.test(blockText.charAt(end))) {
      end++;
    }
    if (end < blockText.length) end++;

    return blockText.slice(start, end).trim();
  } catch {
    return selectedText.trim();
  }
}
