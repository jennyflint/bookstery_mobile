import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { CoverExtractorService } from './CoverExtractorService';
import { SqliteService } from '../database/SqliteService';
import type { BookFormat } from '../../types';

interface CoverTask {
  bookId: string;
  format: BookFormat;
  fileData: Uint8Array | ArrayBuffer | Blob | string;
  resolve: (coverPath: string | null) => void;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  const len = bytes.length;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    let chunkStr = '';
    for (let j = 0; j < chunk.length; j++) {
      chunkStr += String.fromCharCode(chunk[j]);
    }
    binary += chunkStr;
  }
  return btoa(binary);
}

export class CoverGenerationQueueService {
  private static instance: CoverGenerationQueueService | null = null;
  private queue: CoverTask[] = [];
  private isProcessing: boolean = false;
  private readonly extractor: CoverExtractorService;
  private readonly sqliteService: SqliteService;
  private readonly coversDir: string;

  constructor(
    extractor: CoverExtractorService = new CoverExtractorService(),
    sqliteService: SqliteService = SqliteService.getInstance(),
    coversDir: string = '/covers',
  ) {
    this.extractor = extractor;
    this.sqliteService = sqliteService;
    this.coversDir = coversDir;
  }

  static getInstance(): CoverGenerationQueueService {
    if (!CoverGenerationQueueService.instance) {
      CoverGenerationQueueService.instance = new CoverGenerationQueueService();
    }
    return CoverGenerationQueueService.instance;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get isProcessingCovers(): boolean {
    return this.isProcessing;
  }

  async enqueue(
    bookId: string,
    format: BookFormat,
    fileData: Uint8Array | ArrayBuffer | Blob | string,
  ): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      this.queue.push({
        bookId,
        format,
        fileData,
        resolve,
      });

      if (!this.isProcessing) {
        this.processNext();
      }
    });
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) {
        break;
      }

      try {
        const coverBytes = await this.extractor.extractCover(task.format, task.fileData);

        if (coverBytes && coverBytes.length > 0) {
          const relativePath = await this.saveCoverFile(task.bookId, coverBytes);
          await this.sqliteService.updateCoverPath(task.bookId, relativePath);
          task.resolve(relativePath);
        } else {
          await this.sqliteService.updateCoverPath(task.bookId, null);
          task.resolve(null);
        }
      } catch (err) {
        console.warn(`[CoverGenerationQueueService] Cover extraction failed for book ${task.bookId}:`, err);
        try {
          await this.sqliteService.updateCoverPath(task.bookId, null);
        } catch {}
        task.resolve(null);
      }
    }

    this.isProcessing = false;
  }

  private async saveCoverFile(bookId: string, coverBytes: Uint8Array): Promise<string> {
    const isCustomDir = this.coversDir !== '/covers';
    const relativePath = isCustomDir
      ? `${this.coversDir.replace(/\/+$/, '')}/${bookId}.webp`
      : `/covers/${bookId}.webp`;
    const storagePath = isCustomDir
      ? `${this.coversDir.replace(/\/+$/, '')}/${bookId}.webp`
      : `public/covers/${bookId}.webp`;
    const base64Data = uint8ArrayToBase64(coverBytes);

    if (!Capacitor.isNativePlatform() && typeof fetch !== 'undefined') {
      try {
        await fetch('/api/covers/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            bookId,
            base64: base64Data,
          }),
        });
      } catch {}
    }

    try {
      await Filesystem.writeFile({
        path: storagePath,
        data: base64Data,
        directory: Directory.Data,
        recursive: true,
      });
    } catch (fsErr) {
      console.warn(`[CoverGenerationQueueService] Native filesystem write warning:`, fsErr);
    }

    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`bookstery_cover_${bookId}`, `data:image/webp;base64,${base64Data}`);
      } catch {}
    }

    return relativePath;
  }

  clear(): void {
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      task?.resolve(null);
    }
    this.isProcessing = false;
  }
}
