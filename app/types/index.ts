import type { HighlightRecord } from './highlight';

export * from './auth';
export * from './sync';
export * from './collection';
export * from './highlight';
export * from './export';
export * from './scanner';
export * from './ai';
export * from './sort';
export * from './tts';
export * from './reflow';
export * from './settings';

export type BookFormat = 'pdf' | 'epub' | 'fb2';

export type ReaderTheme = 'light' | 'sepia' | 'night' | 'oled' | 'custom';

export interface BookRecord {
  id: string;
  title: string;
  author: string | null;
  format: BookFormat;
  file_path: string;
  cover_path: string | null;
  locator: string;
  progress_percentage: number;
  total_items: number;
  last_read_at: number;
  updated_at: number;
  is_pinned?: number;
  pinned_at?: number | null;
  file_size?: number;
  file_hash?: string;
  created_at?: number;
}

export interface DictionaryItem {
  id?: number;
  book_id: string | null;
  source_text: string;
  translated_text: string;
  source_lang: string | null;
  target_lang: string;
  created_at: number;
}

export interface RemoteBookProgress {
  locator: string;
  progress_percentage: number;
  updated_at: number;
}

export interface ReaderLocation {
  locator: string;
  progressPercentage: number;
  currentPage?: number;
  totalPages?: number;
  chapterTitle?: string | null;
}

export interface ReaderProgressBarProps {
  currentPage?: number;
  totalPages?: number;
  progressPercentage?: number;
  chapterTitle?: string | null;
  locator?: string;
}

export type ReaderPaginationMode = 'buttons' | 'scroll';

export interface ReaderEngineInterface {
  init(
    container: HTMLElement,
    data: Uint8Array | ArrayBuffer | string | Blob,
    initialLocator?: string,
  ): Promise<void>;
  goTo(locator: string): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  getCurrentLocation(): ReaderLocation;
  setPaginationMode?(mode: ReaderPaginationMode): void | Promise<void>;
  applyTheme?(colors: { bg: string; text: string }): void;
  setFontSize?(size: number): void | Promise<void>;
  setHighlights?(
    highlights: HighlightRecord[],
    onHighlightClick?: (highlight: HighlightRecord) => void,
  ): void;
  setZoom?(scale: number): Promise<void>;
  getZoom?(): number;
  resetZoom?(): void;
  onLocationChange?: (location: ReaderLocation) => void;
  destroy(): void;
  getCurrentPageText?(): Promise<string> | string;
  highlightTtsSentence?(sentenceText: string, sentenceIndex: number): void;
  clearTtsHighlight?(): void;
  /** Removes native text selection inside engine-owned documents (e.g. EPUB iframes). */
  clearSelection?(): void;
  /** Fired when a non-empty native selection is made inside engine-owned documents. */
  onSelectionChange?: (detail: EngineSelectionDetail) => void;
  /** Fired when the user taps engine-owned content (only when no text selection is active). */
  onPageTap?: (detail: EnginePageTapDetail) => void;
  /** Legacy center-tap callback. */
  onCenterTap?: () => void;
}

export interface PinchZoomOptions {
  minScale?: number;
  maxScale?: number;
  doubleTapScale?: number;
  doubleTapDelayMs?: number;
  debounceMs?: number;
  onZoomRender?: (scale: number) => Promise<void> | void;
  onSwipeNext?: () => void;
  onSwipePrev?: () => void;
}

export interface ZoomableContainerElement extends HTMLElement {
  __readerSetZoom?: (scale: number) => Promise<void>;
  __readerResetZoom?: () => void;
  __onEngineResetZoom?: () => void;
}

export interface ReaderSettings {
  theme: ReaderTheme;
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  paginationMode: ReaderPaginationMode;
  customBackgroundColor: string;
  customTextColor: string;
  keepScreenAwake?: boolean;
  orientationLock?: import('./settings').ScreenOrientationMode;
  applyOrientationOnlyInReader?: boolean;
}

export interface TextSelectionDetail {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** EPUB CFI range or PDF/FB2 page locator of the selection, when known. */
  locator?: string;
  /** Sentence surrounding the selected text (used for AI context / dictionary). */
  contextSentence?: string;
}

/**
 * Selection payload emitted by reader engines (e.g. EPUB iframe content)
 * when native text selection changes inside their own document.
 */
export interface EngineSelectionDetail {
  text: string;
  /** EPUB CFI range (or page locator) of the selection. */
  locator?: string;
  contextSentence?: string;
  /** Selection bounding rect in top-level viewport coordinates. */
  rect?: { x: number; y: number; width: number; height: number };
}

/** Tap event emitted by engines that render inside their own document (iframes). */
export interface EnginePageTapDetail {
  clientX: number;
  isCenter: boolean;
}

export interface ScannedFile {
  name: string;
  path: string;
  size: number;
  format: BookFormat;
  isDuplicate?: boolean;
}

export interface AddBookResult {
  success: boolean;
  isDuplicate?: boolean;
  book?: BookRecord;
  error?: string;
}

export interface ImportFilesResult {
  importedCount: number;
  duplicateCount: number;
}

export interface TranslationResult {
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
}
