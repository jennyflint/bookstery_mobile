import type { HighlightRecord } from './highlight';

export * from './auth';
export * from './sync';
export * from './collection';
export * from './highlight';
export * from './export';
export * from './scanner';
export * from './ai';

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
  setHighlights?(
    highlights: HighlightRecord[],
    onHighlightClick?: (highlight: HighlightRecord) => void,
  ): void;
  setZoom?(scale: number): Promise<void>;
  getZoom?(): number;
  resetZoom?(): void;
  onLocationChange?: (location: ReaderLocation) => void;
  destroy(): void;
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
}

export interface TextSelectionDetail {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
