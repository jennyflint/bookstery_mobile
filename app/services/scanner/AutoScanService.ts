import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { FileHashService } from './FileHashService';
import { ScanDirectoryRepository, normalizeDirectoryUri } from '../database/ScanDirectoryRepository';
import { SqliteService } from '../database/SqliteService';
import { BookRepository } from '../database/BookRepository';
import { CoverGenerationQueueService } from '../covers/CoverGenerationQueueService';
import type {
  BookFormat,
  BookRecord,
  CrawledBookFile,
  ScanDirectory,
  ScanResultSummary,
} from '../../types';

export function deriveDisplayNameFromUri(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    if (decoded.includes(':')) {
      const colonParts = decoded.split(':');
      const lastPart = colonParts[colonParts.length - 1];
      const segments = lastPart.split('/').filter(Boolean);
      if (segments.length > 0) {
        return segments[segments.length - 1];
      }
    }
    const clean = decoded.replace(/\/+$/, '');
    const segments = clean.split('/').filter(Boolean);
    if (segments.length > 0) {
      return segments[segments.length - 1];
    }
  } catch {}
  return uri;
}

export class AutoScanService {
  private static instance: AutoScanService | null = null;
  private readonly directoryRepository: ScanDirectoryRepository;
  private readonly sqliteService: SqliteService;
  private readonly bookRepository: BookRepository;
  private readonly coverQueue: CoverGenerationQueueService;

  constructor(
    directoryRepository: ScanDirectoryRepository = ScanDirectoryRepository.getInstance(),
    sqliteService: SqliteService = SqliteService.getInstance(),
    bookRepository: BookRepository = BookRepository.getInstance(),
    coverQueue: CoverGenerationQueueService = CoverGenerationQueueService.getInstance(),
  ) {
    this.directoryRepository = directoryRepository;
    this.sqliteService = sqliteService;
    this.bookRepository = bookRepository;
    this.coverQueue = coverQueue;
  }

  static getInstance(): AutoScanService {
    if (!AutoScanService.instance) {
      AutoScanService.instance = new AutoScanService();
    }
    return AutoScanService.instance;
  }

  isSupportedFile(fileName: string): boolean {
    const lower = fileName.toLowerCase();
    return (
      lower.endsWith('.pdf') ||
      lower.endsWith('.epub') ||
      lower.endsWith('.fb2') ||
      lower.endsWith('.fb2.zip')
    );
  }

  determineFormat(fileName: string): BookFormat | null {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.pdf')) {
      return 'pdf';
    }
    if (lower.endsWith('.epub')) {
      return 'epub';
    }
    if (lower.endsWith('.fb2') || lower.endsWith('.fb2.zip')) {
      return 'fb2';
    }
    return null;
  }

  async ensureFilesystemPermissions(): Promise<boolean> {
    try {
      if (!Capacitor.isNativePlatform()) {
        return true;
      }

      const status = await Filesystem.checkPermissions();
      if (status.publicStorage === 'granted') {
        return true;
      }

      const requestResult = await Filesystem.requestPermissions();
      return requestResult.publicStorage === 'granted';
    } catch {
      return true;
    }
  }

  async validateDirectoryAccess(uri: string): Promise<boolean> {
    const normalized = normalizeDirectoryUri(uri);
    if (!normalized) {
      return false;
    }

    const hasPermission = await this.ensureFilesystemPermissions();
    if (!hasPermission) {
      return false;
    }

    const { path, directory } = this.resolveDirectoryTarget(normalized);

    try {
      await Filesystem.readdir({
        path,
        directory,
      });
      return true;
    } catch {
      if (normalized.startsWith('content://') || normalized.startsWith('file://')) {
        try {
          await Filesystem.readdir({
            path: normalized,
          });
          return true;
        } catch {}
      }
      return false;
    }
  }

  async scanAllActiveDirectories(
    onProgress?: (scannedFilesCount: number, currentFileName: string) => void,
  ): Promise<ScanResultSummary> {
    const hasPermission = await this.ensureFilesystemPermissions();
    if (!hasPermission) {
      return this.createEmptySummary();
    }

    const settings = await this.directoryRepository.getSettings();
    if (settings.auto_scan_on_startup === 0) {
      return this.createEmptySummary();
    }

    const activeDirs = await this.directoryRepository.getActiveDirectories();
    if (activeDirs.length === 0) {
      return this.createEmptySummary();
    }

    const combinedSummary = this.createEmptySummary();

    for (const dir of activeDirs) {
      const dirSummary = await this.scanDirectoryInternal(
        dir.uri,
        settings.scan_subdirectories === 1,
        onProgress,
        combinedSummary.scannedFilesCount,
      );

      combinedSummary.scannedFilesCount += dirSummary.scannedFilesCount;
      combinedSummary.newBooksCount += dirSummary.newBooksCount;
      combinedSummary.updatedBooksCount += dirSummary.updatedBooksCount;
      combinedSummary.skippedBooksCount += dirSummary.skippedBooksCount;
      combinedSummary.failedCount += dirSummary.failedCount;
      combinedSummary.newBookIds.push(...dirSummary.newBookIds);

      await this.directoryRepository.updateLastScanned(dir.id, Date.now());
      await this.yieldThread();
    }

    return combinedSummary;
  }

  async scanSingleDirectory(
    dirUri: string,
    onProgress?: (scannedFilesCount: number, currentFileName: string) => void,
  ): Promise<ScanResultSummary> {
    const hasPermission = await this.ensureFilesystemPermissions();
    if (!hasPermission) {
      return this.createEmptySummary();
    }

    const settings = await this.directoryRepository.getSettings();
    const isRecursive = settings.scan_subdirectories === 1;

    const summary = await this.scanDirectoryInternal(dirUri, isRecursive, onProgress, 0);

    const record = await this.directoryRepository.getDirectoryByUri(dirUri);
    if (record) {
      await this.directoryRepository.updateLastScanned(record.id, Date.now());
    }

    return summary;
  }

  private async scanDirectoryInternal(
    dirUri: string,
    isRecursive: boolean,
    onProgress?: (scannedFilesCount: number, currentFileName: string) => void,
    baseFileCount: number = 0,
  ): Promise<ScanResultSummary> {
    const summary = this.createEmptySummary();
    const crawledFiles = await this.crawlDirectory(dirUri, isRecursive);

    if (crawledFiles.length === 0) {
      return summary;
    }

    await this.sqliteService.init();
    const existingBooks = await this.bookRepository.getBooks();
    const existingByPath = new Map<string, BookRecord>();
    const existingById = new Map<string, BookRecord>();

    for (const book of existingBooks) {
      existingByPath.set(book.file_path, book);
      existingById.set(book.id, book);
    }

    let progressCounter = baseFileCount;

    for (const file of crawledFiles) {
      summary.scannedFilesCount++;
      progressCounter++;

      if (onProgress) {
        onProgress(progressCounter, file.name);
      }

      await this.yieldThread();

      const existingRecordByPath = existingByPath.get(file.path);
      if (
        existingRecordByPath &&
        existingRecordByPath.file_size !== undefined &&
        existingRecordByPath.file_size !== null &&
        existingRecordByPath.file_size === file.size
      ) {
        summary.skippedBooksCount++;
        continue;
      }

      try {
        const fileContent = await this.readFileData(file.path, dirUri);
        await this.yieldThread();

        const hash = await FileHashService.calculateSha256(fileContent);

        const existingRecordByHash = existingById.get(hash);
        if (existingRecordByHash) {
          await this.sqliteService.updateFilePathAndSize(
            existingRecordByHash.id,
            file.path,
            file.size,
          );
          existingRecordByHash.file_path = file.path;
          existingRecordByHash.file_size = file.size;
          existingByPath.set(file.path, existingRecordByHash);
          summary.updatedBooksCount++;
          continue;
        }

        const title = this.extractTitleFromFileName(file.name);
        const initialLocator =
          file.format === 'pdf' ? '1' : file.format === 'fb2' ? 'fb2-p-0' : '';
        const now = Date.now();

        const newBook: BookRecord = {
          id: hash,
          title,
          author: null,
          format: file.format,
          file_path: file.path,
          cover_path: null,
          locator: initialLocator,
          progress_percentage: 0,
          total_items: 0,
          last_read_at: now,
          updated_at: now,
          is_pinned: 0,
          pinned_at: null,
          file_size: file.size,
          file_hash: hash,
        };

        await this.sqliteService.upsertBook(newBook);
        existingById.set(newBook.id, newBook);
        existingByPath.set(newBook.file_path, newBook);

        try {
          await this.coverQueue.enqueue(newBook.id, newBook.format, fileContent);
        } catch {}

        summary.newBooksCount++;
        summary.newBookIds.push(newBook.id);
      } catch {
        summary.failedCount++;
      }

      await this.yieldThread();
    }

    return summary;
  }

  private async crawlDirectory(
    dirUri: string,
    isRecursive: boolean,
    currentSubPath: string = '',
  ): Promise<CrawledBookFile[]> {
    const results: CrawledBookFile[] = [];
    const normalized = normalizeDirectoryUri(dirUri);
    const { path: basePath, directory } = this.resolveDirectoryTarget(normalized);

    const targetPath = currentSubPath
      ? basePath
        ? `${basePath}/${currentSubPath}`
        : currentSubPath
      : basePath;

    try {
      const readResult = await Filesystem.readdir({
        path: targetPath,
        directory,
      });

      const isContentUri = dirUri.startsWith('content://');

      for (const entry of readResult.files) {
        const entryRelative = currentSubPath ? `${currentSubPath}/${entry.name}` : entry.name;
        const entryUri = (entry as { uri?: string }).uri;
        const entryFullPath =
          isContentUri && entryUri
            ? entryUri
            : targetPath
              ? `${targetPath}/${entry.name}`
              : entry.name;

        if (entry.type === 'directory') {
          if (isRecursive) {
            await this.yieldThread();
            const nextSubPath = entryUri || entryRelative;
            const nested = await this.crawlDirectory(dirUri, isRecursive, nextSubPath);
            results.push(...nested);
          }
        } else if (this.isSupportedFile(entry.name)) {
          const format = this.determineFormat(entry.name);
          if (format) {
            let fileSize = entry.size || 0;
            let mtime = entry.mtime;

            if (fileSize === 0) {
              try {
                const statResult = await Filesystem.stat({
                  path: entryFullPath,
                  directory,
                });
                fileSize = statResult.size || 0;
                mtime = statResult.mtime;
              } catch {}
            }

            results.push({
              name: entry.name,
              path: entryFullPath,
              size: fileSize,
              mtime,
              format,
            });
          }
        }
      }
    } catch {}

    return results;
  }

  private async readFileData(
    filePath: string,
    dirUri: string,
  ): Promise<string | ArrayBuffer | Uint8Array | Blob> {
    const { directory } = this.resolveDirectoryTarget(normalizeDirectoryUri(dirUri));

    if ((filePath.startsWith('content://') || filePath.startsWith('file://')) && !directory) {
      const result = await Filesystem.readFile({
        path: filePath,
      });
      return result.data;
    }

    try {
      const result = await Filesystem.readFile({
        path: filePath,
        directory,
      });
      return result.data;
    } catch (err) {
      if (filePath.startsWith('content://') || filePath.startsWith('file://')) {
        const fallback = await Filesystem.readFile({
          path: filePath,
        });
        return fallback.data;
      }
      throw err;
    }
  }

  resolveDirectoryTarget(uri: string): {
    path: string;
    directory?: Directory;
  } {
    let decoded = uri;
    try {
      decoded = decodeURIComponent(uri);
    } catch {}

    // 1. Android SAF tree URI: content://.../tree/...
    if (decoded.includes('/tree/')) {
      const treePart = decoded.split('/tree/')[1] || '';
      const cleanTreePart = treePart.split('?')[0];

      if (cleanTreePart.includes(':')) {
        const colonIndex = cleanTreePart.indexOf(':');
        const afterColon = cleanTreePart.substring(colonIndex + 1);
        const relPath = afterColon.replace(/^\/+/, '').replace(/\/+$/, '');
        return {
          path: relPath,
          directory: Directory.ExternalStorage,
        };
      }

      const relPath = cleanTreePart.replace(/^\/+/, '').replace(/\/+$/, '');
      return {
        path: relPath,
        directory: Directory.ExternalStorage,
      };
    }

    // 2. Normalize raw: or file://
    let cleaned = decoded;
    if (cleaned.startsWith('raw:')) {
      cleaned = cleaned.slice(4);
    }
    if (cleaned.startsWith('file://')) {
      cleaned = cleaned.slice(7);
    }

    // 3. Android primary storage path: /storage/emulated/0/...
    if (cleaned.startsWith('/storage/emulated/0')) {
      const relPath = cleaned
        .slice('/storage/emulated/0'.length)
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
      return {
        path: relPath,
        directory: Directory.ExternalStorage,
      };
    }

    // 4. Keyword mappings (Documents, Data, ExternalStorage)
    const lower = cleaned.toLowerCase().replace(/^\/+/, '');
    if (lower === 'documents') {
      return { path: '', directory: Directory.Documents };
    }
    if (lower.startsWith('documents/')) {
      return { path: cleaned.replace(/^\/+/, '').slice(10), directory: Directory.Documents };
    }

    if (lower === 'data') {
      return { path: '', directory: Directory.Data };
    }
    if (lower.startsWith('data/')) {
      return { path: cleaned.replace(/^\/+/, '').slice(5), directory: Directory.Data };
    }

    if (
      lower === 'externalstorage' ||
      lower === 'external_storage' ||
      lower === 'external'
    ) {
      return { path: '', directory: Directory.ExternalStorage };
    }
    if (lower.startsWith('externalstorage/')) {
      return { path: cleaned.replace(/^\/+/, '').slice(16), directory: Directory.ExternalStorage };
    }
    if (lower.startsWith('external_storage/')) {
      return { path: cleaned.replace(/^\/+/, '').slice(17), directory: Directory.ExternalStorage };
    }
    if (lower.startsWith('external/')) {
      return { path: cleaned.replace(/^\/+/, '').slice(9), directory: Directory.ExternalStorage };
    }

    return { path: uri };
  }

  private extractTitleFromFileName(fileName: string): string {
    return fileName
      .replace(/\.(pdf|epub|fb2\.zip|fb2)$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();
  }

  private createEmptySummary(): ScanResultSummary {
    return {
      scannedFilesCount: 0,
      newBooksCount: 0,
      updatedBooksCount: 0,
      skippedBooksCount: 0,
      failedCount: 0,
      newBookIds: [],
    };
  }

  private async yieldThread(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
