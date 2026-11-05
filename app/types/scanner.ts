export interface ScanDirectory {
  id: number;
  uri: string;
  display_name: string;
  is_active: number;
  last_scanned_at: number | null;
  created_at: number;
}

export interface ScannerSettings {
  id: number;
  auto_scan_on_startup: number;
  scan_subdirectories: number;
  updated_at: number;
}

export interface ScanResultSummary {
  scannedFilesCount: number;
  newBooksCount: number;
  updatedBooksCount: number;
  skippedBooksCount: number;
  failedCount: number;
  newBookIds: string[];
}

export interface CrawledBookFile {
  name: string;
  path: string;
  size: number;
  mtime?: number;
  format: 'pdf' | 'epub' | 'fb2' | 'mobi';
}
