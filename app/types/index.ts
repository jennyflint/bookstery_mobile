export * from './auth';
export * from './sync';

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
  onLocationChange?: (location: ReaderLocation) => void;
  destroy(): void;
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
