import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileHashService } from './FileHashService';
import type { BookFormat, BookRecord, ScannedFile } from '../../types';

export class DeviceFileScannerService {
  private readonly supportedExtensions = ['.pdf', '.epub', '.fb2', '.fb2.zip'];

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

  async scanDirectory(path: string = '', directory: Directory = Directory.Documents): Promise<ScannedFile[]> {
    const results: ScannedFile[] = [];

    try {
      const readResult = await Filesystem.readdir({
        path,
        directory,
      });

      for (const file of readResult.files) {
        const fullPath = path ? `${path}/${file.name}` : file.name;

        if (file.type === 'directory') {
          const subResults = await this.scanDirectory(fullPath, directory);
          results.push(...subResults);
        } else {
          const format = this.determineFormat(file.name);
          if (format) {
            results.push({
              name: file.name,
              path: fullPath,
              size: file.size || 0,
              format,
            });
          }
        }
      }
    } catch {
    }

    return results;
  }

  isDuplicate(
    candidate: { id?: string; title?: string; author?: string | null; file_path?: string },
    existingBooksOrIds: Set<string> | BookRecord[],
  ): boolean {
    if (existingBooksOrIds instanceof Set) {
      return Boolean(candidate.id && existingBooksOrIds.has(candidate.id));
    }

    const candidateTitle = candidate.title?.trim().toLowerCase();
    const candidateAuthor = candidate.author?.trim().toLowerCase() || null;

    return existingBooksOrIds.some((book) => {
      if (candidate.id && book.id === candidate.id) {
        return true;
      }
      if (candidate.file_path && book.file_path === candidate.file_path) {
        return true;
      }
      if (candidateTitle && book.title.trim().toLowerCase() === candidateTitle) {
        const bookAuthor = book.author?.trim().toLowerCase() || null;
        if (!candidateAuthor && !bookAuthor) {
          return true;
        }
        if (candidateAuthor && bookAuthor && candidateAuthor === bookAuthor) {
          return true;
        }
      }
      return false;
    });
  }

  async importBookFile(
    sourcePath: string,
    sourceDirectory: Directory,
    existingBooksOrIds: Set<string> | BookRecord[],
  ): Promise<BookRecord | null> {
    const fileName = sourcePath.split('/').pop() || 'book';
    const format = this.determineFormat(fileName);

    if (!format) {
      throw new Error(`Unsupported book format for file: ${fileName}`);
    }

    const title = fileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');

    // Fast-path duplicate check by title & path before reading entire file if existing records are provided
    if (this.isDuplicate({ title, file_path: sourcePath }, existingBooksOrIds)) {
      return null;
    }

    const fileData = await Filesystem.readFile({
      path: sourcePath,
      directory: sourceDirectory,
    });

    const rawString = typeof fileData.data === 'string' ? fileData.data : '';
    const hash = await FileHashService.calculateSha256(rawString);

    const destinationPath = `books/${hash}_${fileName}`;
    if (
      this.isDuplicate(
        { id: hash, title, file_path: destinationPath },
        existingBooksOrIds,
      )
    ) {
      return null;
    }

    await Filesystem.writeFile({
      path: destinationPath,
      data: fileData.data,
      directory: Directory.Data,
      recursive: true,
    });

    const initialLocator = format === 'pdf' ? '1' : format === 'fb2' ? 'fb2-p-0' : '';
    const now = Date.now();

    const bookRecord: BookRecord = {
      id: hash,
      title,
      author: null,
      format,
      file_path: destinationPath,
      cover_path: null,
      locator: initialLocator,
      progress_percentage: 0,
      total_items: 0,
      last_read_at: now,
      updated_at: now,
    };

    return bookRecord;
  }
}
