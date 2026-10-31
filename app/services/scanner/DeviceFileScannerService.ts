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

  async importBookFile(
    sourcePath: string,
    sourceDirectory: Directory,
    existingBookIds: Set<string>,
  ): Promise<BookRecord | null> {
    const fileName = sourcePath.split('/').pop() || 'book';
    const format = this.determineFormat(fileName);

    if (!format) {
      throw new Error(`Unsupported book format for file: ${fileName}`);
    }

    const fileData = await Filesystem.readFile({
      path: sourcePath,
      directory: sourceDirectory,
    });

    const rawString = typeof fileData.data === 'string' ? fileData.data : '';
    const hash = await FileHashService.calculateSha256(rawString);

    if (existingBookIds.has(hash)) {
      return null;
    }

    const destinationPath = `books/${hash}_${fileName}`;
    await Filesystem.writeFile({
      path: destinationPath,
      data: fileData.data,
      directory: Directory.Data,
      recursive: true,
    });

    const title = fileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
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
