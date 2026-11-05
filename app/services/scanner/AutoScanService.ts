import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import {
  NativeReaderBridge,
  fetchBookBytes,
  isNativeReaderBridgeAvailable,
  toWebViewUrl,
} from '../NativeReaderBridge';
import { FileHashService } from './FileHashService';
import { ScanDirectoryRepository, normalizeDirectoryUri } from '../database/ScanDirectoryRepository';
import { SqliteService } from '../database/SqliteService';
import { BookRepository } from '../database/BookRepository';
import { CoverGenerationQueueService } from '../covers/CoverGenerationQueueService';
import { extractMobiMetadata } from '../covers/CoverExtractorService';
import type {
  BookFormat,
  BookRecord,
  CrawledBookFile,
  ScanDirectory,
  ScanResultSummary,
} from '../../types';

const NATIVE_SCAN_EXTENSIONS = [
  '.pdf',
  '.epub',
  '.fb2',
  '.fb2.zip',
  '.mobi',
  '.azw',
  '.azw3',
  '.kf8',
  '.djvu',
  '.djv',
];
const SANDBOX_BOOK_PATH = /^books\/[0-9a-f]{8,}_(.+)$/i;

export function deriveDisplayNameFromUri(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    if (decoded.includes(':')) {
      const colonParts = decoded.split(':');
      const lastPart = colonParts[colonParts.length - 1];
      if (lastPart) {
        const segments = lastPart.split('/').filter(Boolean);
        const lastSegment = segments[segments.length - 1];
        if (lastSegment) {
          return lastSegment;
        }
      }
    }
    const clean = decoded.replace(/\/+$/, '');
    const segments = clean.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    if (lastSegment) {
      return lastSegment;
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
  private coverTasks: Array<{ book: BookRecord; localPath: string }> = [];
  private isProcessingCovers: boolean = false;

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
      lower.endsWith('.fb2.zip') ||
      lower.endsWith('.mobi') ||
      lower.endsWith('.azw') ||
      lower.endsWith('.azw3') ||
      lower.endsWith('.kf8') ||
      lower.endsWith('.djvu') ||
      lower.endsWith('.djv')
    );
  }

  isSupportedBookFile(fileName: string): boolean {
    return this.isSupportedFile(fileName);
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
    if (
      lower.endsWith('.mobi') ||
      lower.endsWith('.azw') ||
      lower.endsWith('.azw3') ||
      lower.endsWith('.kf8')
    ) {
      return 'mobi';
    }
    if (lower.endsWith('.djvu') || lower.endsWith('.djv')) {
      return 'djvu';
    }
    return null;
  }

  detectFormat(fileName: string): BookFormat | null {
    return this.determineFormat(fileName);
  }

  /**
   * Android 11+ needs "All files access" to read documents from shared storage; older
   * versions use the regular storage runtime permission. When `requestIfMissing` is false
   * the user is never prompted (used by background scans).
   */
  async ensureFilesystemPermissions(requestIfMissing: boolean = true): Promise<boolean> {
    try {
      if (!Capacitor.isNativePlatform()) {
        return true;
      }

      if (isNativeReaderBridgeAvailable()) {
        try {
          const status = await NativeReaderBridge.checkStoragePermission();
          if (status.granted) {
            return true;
          }
          if (!requestIfMissing) {
            return false;
          }
          const requested = await NativeReaderBridge.requestStoragePermission();
          return requested.granted;
        } catch {
          // Bridge call failed: fall back to the Filesystem plugin below.
        }
      }

      const status = await Filesystem.checkPermissions();
      if (status.publicStorage === 'granted') {
        return true;
      }
      if (!requestIfMissing) {
        return false;
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

    if (isNativeReaderBridgeAvailable()) {
      try {
        await NativeReaderBridge.scanDirectory({
          uriOrPath: normalized,
          extensions: NATIVE_SCAN_EXTENSIONS,
          maxDepth: 0,
        });
        return true;
      } catch {
        // Fall through to the Filesystem based check.
      }
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

  /**
   * Cleans up redundant sandboxed copies in Directory.Data ('books/...') when the original
   * file exists in one of the active scanned directories, reclaiming device storage.
   */
  async cleanupDuplicatedSandboxBooks(scannedFiles?: CrawledBookFile[]): Promise<number> {
    try {
      await this.sqliteService.init();
      const existingBooks = await this.bookRepository.getBooks();
      const sandboxedBooks = existingBooks.filter(
        (b) => b.file_path && SANDBOX_BOOK_PATH.test(b.file_path),
      );

      let files = scannedFiles ? [...scannedFiles] : [];
      if (sandboxedBooks.length > 0) {
        if (!scannedFiles || scannedFiles.length === 0) {
          const activeDirs = await this.directoryRepository.getActiveDirectories();
          const settings = await this.directoryRepository.getSettings();
          const isRecursive = settings.scan_subdirectories === 1;
          for (const dir of activeDirs) {
            const crawled =
              (await this.crawlDirectoryNative(dir.uri, isRecursive)) ??
              (await this.crawlDirectory(dir.uri, isRecursive));
            files.push(...crawled);
          }
        }

        if (isNativeReaderBridgeAvailable()) {
          const permission = await NativeReaderBridge.checkStoragePermission().catch(() => ({ granted: false }));
          if (permission.granted) {
            const hasDownloadDir = files.some((f) => f.path.startsWith('/storage/emulated/0/Download'));
            if (!hasDownloadDir) {
              try {
                const downloadFiles = await this.crawlDirectoryNative('/storage/emulated/0/Download', true);
                if (downloadFiles && downloadFiles.length > 0) {
                  files.push(...downloadFiles);
                }
              } catch (err) {
                console.warn('[AutoScanService] Crawling Download directory failed:', err);
              }
            }
          }
        }
      }

      const fileMapByNameAndSize = new Map<string, CrawledBookFile>();
      const fileMapByName = new Map<string, CrawledBookFile>();
      for (const f of files) {
        fileMapByNameAndSize.set(`${f.name}|${f.size}`, f);
        if (!fileMapByName.has(f.name)) {
          fileMapByName.set(f.name, f);
        }
      }

      let reclaimedCount = 0;
      for (const book of sandboxedBooks) {
        const match = SANDBOX_BOOK_PATH.exec(book.file_path);
        const originalName = match?.[1];
        if (!originalName) {
          continue;
        }

        const originalFile =
          (book.file_size ? fileMapByNameAndSize.get(`${originalName}|${book.file_size}`) : undefined) ??
          fileMapByName.get(originalName);

        if (originalFile) {
          const oldSandboxPath = book.file_path;
          await this.sqliteService.updateFilePathAndSize(
            book.id,
            originalFile.path,
            originalFile.size,
          );
          book.file_path = originalFile.path;
          book.file_size = originalFile.size;

          try {
            await Filesystem.deleteFile({
              path: oldSandboxPath,
              directory: Directory.Data,
            });
            reclaimedCount++;
          } catch (delErr) {
            console.warn('[AutoScanService] Failed to delete redundant sandbox file:', delErr);
          }
        }
      }

      // Reclaim orphaned files in Directory.Data/books not referenced by any book in SQLite
      try {
        const readdirResult = await Filesystem.readdir({
          path: 'books',
          directory: Directory.Data,
        });
        if (readdirResult?.files && readdirResult.files.length > 0) {
          const allUpdatedBooks = await this.bookRepository.getBooks();
          const referencedSandboxPaths = new Set<string>();
          for (const b of allUpdatedBooks) {
            if (b.file_path && b.file_path.startsWith('books/')) {
              referencedSandboxPaths.add(b.file_path);
            }
          }

          for (const fileItem of readdirResult.files) {
            const fileName = typeof fileItem === 'string' ? fileItem : fileItem.name;
            const relativePath = `books/${fileName}`;
            if (!referencedSandboxPaths.has(relativePath)) {
              try {
                await Filesystem.deleteFile({
                  path: relativePath,
                  directory: Directory.Data,
                });
                reclaimedCount++;
              } catch (delErr) {
                console.warn('[AutoScanService] Failed to delete orphaned sandbox file:', delErr);
              }
            }
          }
        }
      } catch {
        // 'books' directory might not exist yet or readdir not supported in current environment
      }

      return reclaimedCount;
    } catch (err) {
      console.warn('[AutoScanService] cleanupDuplicatedSandboxBooks error:', err);
      return 0;
    }
  }

  async scanAllActiveDirectories(
    onProgress?: (scannedFilesCount: number, currentFileName: string) => void,
  ): Promise<ScanResultSummary> {
    const settings = await this.directoryRepository.getSettings();
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

    await this.cleanupDuplicatedSandboxBooks();

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

    await this.cleanupDuplicatedSandboxBooks();

    return summary;
  }

  private async scanDirectoryInternal(
    dirUri: string,
    isRecursive: boolean,
    onProgress?: (scannedFilesCount: number, currentFileName: string) => void,
    baseFileCount: number = 0,
  ): Promise<ScanResultSummary> {
    const summary = this.createEmptySummary();
    const nativeFiles = await this.crawlDirectoryNative(dirUri, isRecursive);
    const crawledFiles = nativeFiles ?? (await this.crawlDirectory(dirUri, isRecursive));

    if (crawledFiles.length === 0) {
      return summary;
    }

    await this.sqliteService.init();
    const existingBooks = await this.bookRepository.getBooks();
    const existingByPath = new Map<string, BookRecord>();
    const existingById = new Map<string, BookRecord>();
    const existingByNameAndSize = new Map<string, BookRecord>();

    for (const book of existingBooks) {
      existingByPath.set(book.file_path, book);
      existingById.set(book.id, book);
      if (book.file_hash) {
        existingById.set(book.file_hash, book);
      }

      const match = SANDBOX_BOOK_PATH.exec(book.file_path);
      const originalName = match ? match[1] : book.file_path.split('/').pop()?.split('\\').pop();
      if (originalName && book.file_size) {
        existingByNameAndSize.set(`${originalName}|${book.file_size}`, book);
      }
    }

    let progressCounter = baseFileCount;

    for (const file of crawledFiles) {
      summary.scannedFilesCount++;
      progressCounter++;

      if (onProgress) {
        onProgress(progressCounter, file.name);
      }

      const existingRecordByPath = existingByPath.get(file.path);
      if (
        existingRecordByPath &&
        existingRecordByPath.file_size !== undefined &&
        existingRecordByPath.file_size !== null &&
        existingRecordByPath.file_size === file.size
      ) {
        summary.skippedBooksCount++;
        if (progressCounter % 25 === 0) {
          await this.yieldThread();
        }
        continue;
      }

      try {
        await this.importNativeFile(
          file,
          summary,
          existingById,
          existingByPath,
          existingByNameAndSize,
        );
      } catch (err) {
        console.warn('[AutoScanService] Failed to process file:', file.name, err);
        summary.failedCount++;
      }

      if (progressCounter % 25 === 0) {
        await this.yieldThread();
      }
    }

    return summary;
  }

  /** Single native call instead of a JS-level recursive readdir loop. Returns null when unavailable. */
  private async crawlDirectoryNative(
    dirUri: string,
    isRecursive: boolean,
  ): Promise<CrawledBookFile[] | null> {
    if (!isNativeReaderBridgeAvailable()) {
      return null;
    }
    try {
      const result = await NativeReaderBridge.scanDirectory({
        uriOrPath: normalizeDirectoryUri(dirUri),
        extensions: NATIVE_SCAN_EXTENSIONS,
        maxDepth: isRecursive ? undefined : 0,
      });
      const files: CrawledBookFile[] = [];
      for (const entry of result.files) {
        const format = this.determineFormat(entry.name);
        if (format) {
          files.push({
            name: entry.name,
            path: entry.path || entry.uri,
            size: entry.size,
            mtime: entry.lastModified,
            format,
          });
        }
      }
      return files;
    } catch (err) {
      console.warn('[AutoScanService] Native scan failed, using the JS scanner:', err);
      return null;
    }
  }

  /** Registers one book in-place without copying or moving its content. */
  async importNativeFile(
    file: CrawledBookFile,
    summary: ScanResultSummary,
    existingById: Map<string, BookRecord>,
    existingByPath?: Map<string, BookRecord> | Set<string>,
    existingByNameAndSize?: Map<string, BookRecord>,
  ): Promise<void> {
    const pathMap = existingByPath instanceof Map ? existingByPath : new Map<string, BookRecord>();
    const nameMap = existingByNameAndSize ?? new Map<string, BookRecord>();
    const nameAndSizeKey = `${file.name}|${file.size}`;

    // 1. Check if known by (name, size)
    const existingByName = nameMap.get(nameAndSizeKey);
    if (existingByName) {
      if (SANDBOX_BOOK_PATH.test(existingByName.file_path)) {
        // Reclaim duplicate sandbox copy: point to original file and delete sandbox file
        const oldSandboxPath = existingByName.file_path;
        await this.sqliteService.updateFilePathAndSize(existingByName.id, file.path, file.size);
        existingByName.file_path = file.path;
        existingByName.file_size = file.size;
        pathMap.set(file.path, existingByName);
        try {
          await Filesystem.deleteFile({
            path: oldSandboxPath,
            directory: Directory.Data,
          });
        } catch {}
        summary.skippedBooksCount++;
      } else if (existingByName.file_path !== file.path) {
        await this.sqliteService.updateFilePathAndSize(existingByName.id, file.path, file.size);
        existingByName.file_path = file.path;
        existingByName.file_size = file.size;
        pathMap.set(file.path, existingByName);
        summary.updatedBooksCount++;
      } else {
        summary.skippedBooksCount++;
      }
      return;
    }

    // 2. Deterministic hash without copying or reading into RAM
    const hash = await FileHashService.calculateSha256(nameAndSizeKey);
    const existingByHash = existingById.get(hash);
    if (existingByHash) {
      if (SANDBOX_BOOK_PATH.test(existingByHash.file_path)) {
        const oldSandboxPath = existingByHash.file_path;
        await this.sqliteService.updateFilePathAndSize(existingByHash.id, file.path, file.size);
        existingByHash.file_path = file.path;
        existingByHash.file_size = file.size;
        pathMap.set(file.path, existingByHash);
        try {
          await Filesystem.deleteFile({
            path: oldSandboxPath,
            directory: Directory.Data,
          });
        } catch {}
        summary.skippedBooksCount++;
      } else if (existingByHash.file_path !== file.path || existingByHash.file_size !== file.size) {
        await this.sqliteService.updateFilePathAndSize(existingByHash.id, file.path, file.size);
        existingByHash.file_path = file.path;
        existingByHash.file_size = file.size;
        pathMap.set(file.path, existingByHash);
        summary.updatedBooksCount++;
      } else {
        summary.skippedBooksCount++;
      }
      return;
    }

    // 3. New book: Zero-copy direct referencing
    const now = Date.now();
    let bookTitle = this.extractTitleFromFileName(file.name);
    let bookAuthor: string | null = null;

    if (file.format === 'mobi') {
      try {
        const fileBytes = await fetchBookBytes(file.path);
        if (fileBytes && fileBytes.byteLength > 0) {
          const meta = extractMobiMetadata(fileBytes);
          if (meta.title) bookTitle = meta.title;
          if (meta.author) bookAuthor = meta.author;
        }
      } catch {}
    }

    const newBook: BookRecord = {
      id: hash,
      title: bookTitle,
      author: bookAuthor,
      format: file.format,
      file_path: file.path,
      cover_path: null,
      locator:
        file.format === 'pdf' || file.format === 'djvu'
          ? '1'
          : file.format === 'fb2'
            ? 'fb2-p-0'
            : file.format === 'mobi'
              ? 'mobi-p-0'
              : '',
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
    await this.sqliteService.updateFilePathAndSize(newBook.id, newBook.file_path, newBook.file_size);

    existingById.set(newBook.id, newBook);
    pathMap.set(file.path, newBook);
    nameMap.set(nameAndSizeKey, newBook);

    // Enqueue cover extraction asynchronously in background without blocking discovery loop
    this.enqueueCoverGeneration(newBook, file.path);

    summary.newBooksCount++;
    summary.newBookIds.push(newBook.id);
  }

  enqueueCoverGeneration(book: BookRecord, localPath: string): void {
    this.coverTasks.push({ book, localPath });
    if (!this.isProcessingCovers) {
      void this.processBackgroundCovers();
    }
  }

  private async processBackgroundCovers(): Promise<void> {
    if (this.isProcessingCovers) {
      return;
    }
    this.isProcessingCovers = true;
    while (this.coverTasks.length > 0) {
      const task = this.coverTasks.shift();
      if (task) {
        try {
          await this.generateNativeCover(task.book, task.localPath);
        } catch {}
        await this.yieldThread();
      }
    }
    this.isProcessingCovers = false;
  }

  async waitForPendingCovers(): Promise<void> {
    while (this.isProcessingCovers || this.coverTasks.length > 0) {
      await this.yieldThread();
    }
  }

  async generateNativeCover(book: BookRecord, localPath: string): Promise<void> {
    if (book.format === 'pdf') {
      try {
        const thumbnail = await NativeReaderBridge.generatePdfThumbnail({
          uriOrPath: localPath,
          bookId: book.id,
          maxWidth: 360,
        });
        const resolvedPath =
          (thumbnail as { coverPath?: string; path?: string; coverUri?: string }).coverPath ||
          thumbnail?.path ||
          (thumbnail as { coverPath?: string; path?: string; coverUri?: string }).coverUri;
        if (resolvedPath) {
          const coverUrl = toWebViewUrl(resolvedPath);
          await this.sqliteService.updateCoverPath(book.id, coverUrl);
          book.cover_path = coverUrl;
          return;
        }
      } catch {
        // Encrypted or malformed PDF: use the JS extractor below.
      }
    }

    try {
      let bytes: Uint8Array | ArrayBuffer | Blob | string | null = null;
      if (Capacitor.isNativePlatform()) {
        try {
          bytes = await fetchBookBytes(localPath);
        } catch {
          try {
            const res = await Filesystem.readFile({ path: localPath });
            bytes = res.data;
          } catch {}
        }
      } else {
        try {
          const res = await Filesystem.readFile({ path: localPath });
          bytes = res.data;
        } catch {
          try {
            bytes = await fetchBookBytes(localPath);
          } catch {}
        }
      }
      if (bytes) {
        await this.coverQueue.enqueue(book.id, book.format, bytes);
      }
    } catch {
      // A missing cover must never fail the import.
    }
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

    let readResult: { files: Array<{ name: string; type: string; size?: number; mtime?: number; uri?: string }> } | null = null;
    try {
      readResult = await Filesystem.readdir({
        path: targetPath,
        directory,
      });
    } catch {
      if (normalized.startsWith('content://') || normalized.startsWith('file://')) {
        try {
          readResult = await Filesystem.readdir({
            path: normalized,
          });
        } catch {}
      }
      if (!readResult && directory) {
        try {
          readResult = await Filesystem.readdir({
            path: targetPath,
          });
        } catch {}
      }
    }

    if (!readResult || !readResult.files) {
      return results;
    }

    try {
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
      try {
        const fallback = await Filesystem.readFile({
          path: filePath,
        });
        return fallback.data;
      } catch {
        throw err;
      }
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
      const cleanTreePart = treePart.split('?')[0] || '';

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
      .replace(/\.(pdf|epub|fb2\.zip|fb2|mobi|azw3|azw|kf8|djvu|djv)$/i, '')
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
