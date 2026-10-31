export type BookFormat = 'pdf' | 'epub' | 'fb2';

export type ReaderTheme = 'light' | 'sepia' | 'night' | 'oled';

export type SyncStatus = 'pending' | 'processing' | 'synced' | 'failed';

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

export interface SyncQueueItem {
  id?: number;
  book_id: string;
  locator: string;
  progress_percentage: number;
  updated_at: number;
  status: SyncStatus;
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

export interface UserSession {
  id: number;
  email: string | null;
  display_name: string | null;
  last_sync_at: number | null;
}

export interface RemoteBookProgress {
  locator: string;
  progress_percentage: number;
  updated_at: number;
}

export interface DriveSyncPayload {
  version: number;
  device_id: string;
  updated_at: number;
  books: Record<string, RemoteBookProgress>;
}

export interface ReaderLocation {
  locator: string;
  progressPercentage: number;
  currentPage?: number;
  totalPages?: number;
}

export type ReaderPaginationMode = 'buttons' | 'scroll';

export interface ReaderEngineInterface {
  init(container: HTMLElement, data: Uint8Array | ArrayBuffer | string | Blob): Promise<void>;
  goTo(locator: string): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  getCurrentLocation(): ReaderLocation;
  setPaginationMode?(mode: ReaderPaginationMode): void | Promise<void>;
  onLocationChange?: (location: ReaderLocation) => void;
  destroy(): void;
}

export interface ReaderSettings {
  theme: ReaderTheme;
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  paginationMode: ReaderPaginationMode;
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
}

export interface TranslationResult {
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
}

export interface ConflictResolutionResult {
  winnerLocator: string;
  winnerPercentage: number;
  winnerUpdatedAt: number;
  source: 'local' | 'remote';
}

export interface GoogleUser {
  id: string;
  email: string;
  displayName: string;
  imageUrl?: string;
  accessToken: string;
}
