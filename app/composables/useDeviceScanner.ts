import { ref } from 'vue';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { DeviceFileScannerService } from '../services/scanner/DeviceFileScannerService';
import { FileHashService } from '../services/scanner/FileHashService';
import { AutoScanService } from '../services/scanner/AutoScanService';
import { ScanDirectoryRepository } from '../services/database/ScanDirectoryRepository';
import { CoverGenerationQueueService } from '../services/covers/CoverGenerationQueueService';
import { useLibraryStore } from '../stores/libraryStore';
import type { AddBookResult, BookRecord, ImportFilesResult, ScannedFile } from '../types';

/**
 * Memory-safe conversion of Blob or File to Base64 without string iteration spikes
 */
async function blobToBase64(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function useDeviceScanner() {
  const isScanning = ref(false);
  const scanProgress = ref(0);
  const scannedFiles = ref<ScannedFile[]>([]);
  const duplicateNotice = ref<string | null>(null);
  const scannerService = new DeviceFileScannerService();
  const libraryStore = useLibraryStore();
  const coverQueue = CoverGenerationQueueService.getInstance();

  const scanDevice = async (): Promise<ScannedFile[]> => {
    isScanning.value = true;
    scannedFiles.value = [];
    try {
      await libraryStore.loadBooks();
      const documentsFiles = await scannerService.scanDirectory('', Directory.Documents);
      const dataFiles = await scannerService.scanDirectory('', Directory.Data);
      const combined = [...documentsFiles, ...dataFiles];

      try {
        const repo = ScanDirectoryRepository.getInstance();
        const activeDirs = await repo.getActiveDirectories();
        const autoScanner = AutoScanService.getInstance();
        for (const dir of activeDirs) {
          const { path, directory } = autoScanner.resolveDirectoryTarget(dir.uri);
          const dirFiles = await scannerService.scanDirectory(path, directory);
          combined.push(...dirFiles);
        }
      } catch {}

      const uniqueMap = new Map<string, ScannedFile>();
      for (const f of combined) {
        const title = f.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
        const isDuplicate = libraryStore.isDuplicate({
          title,
          file_path: f.path,
        });
        f.isDuplicate = isDuplicate;
        uniqueMap.set(f.path, f);
      }
      scannedFiles.value = Array.from(uniqueMap.values());
      return scannedFiles.value;
    } finally {
      isScanning.value = false;
    }
  };

  const importFiles = async (files: ScannedFile[]): Promise<ImportFilesResult> => {
    isScanning.value = true;
    scanProgress.value = 0;
    let importedCount = 0;
    let duplicateCount = 0;

    try {
      await libraryStore.loadBooks();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.isDuplicate) {
          duplicateCount++;
          scanProgress.value = Math.round(((i + 1) / files.length) * 100);
          continue;
        }

        try {
          const imported = await scannerService.importBookFile(
            file.path,
            Directory.Documents,
            libraryStore.books,
          );
          if (imported) {
            const addResult = await libraryStore.addBook(imported);
            if (addResult.success) {
              importedCount++;

              let fileContent: string | ArrayBuffer | Uint8Array | Blob | undefined;
              try {
                const readRes = await Filesystem.readFile({
                  path: imported.file_path,
                  directory: Directory.Data,
                });
                fileContent = readRes.data;
              } catch {
                try {
                  const readRes = await Filesystem.readFile({
                    path: file.path,
                    directory: Directory.Documents,
                  });
                  fileContent = readRes.data;
                } catch {}
              }

              if (fileContent) {
                coverQueue.enqueue(imported.id, imported.format, fileContent).then((coverPath) => {
                  if (coverPath) {
                    libraryStore.updateCover(imported.id, coverPath);
                  }
                });
              }
            } else if (addResult.isDuplicate) {
              duplicateCount++;
            }
          } else {
            duplicateCount++;
          }
        } catch {}
        scanProgress.value = Math.round(((i + 1) / files.length) * 100);
      }
      return { importedCount, duplicateCount };
    } finally {
      isScanning.value = false;
      scanProgress.value = 0;
    }
  };

  const importBook = async (file: File): Promise<AddBookResult> => {
    isScanning.value = true;
    duplicateNotice.value = null;
    try {
      await libraryStore.loadBooks();

      const candidateTitle = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
      const existingByTitle = libraryStore.findDuplicate({ title: candidateTitle });
      if (existingByTitle) {
        duplicateNotice.value = candidateTitle;
        return { success: false, isDuplicate: true, book: existingByTitle };
      }

      const arrayBuffer = await file.arrayBuffer();
      const base64 = await blobToBase64(file);

      const hash = await FileHashService.calculateSha256(base64);
      const existingByHash = libraryStore.findDuplicate({ id: hash });
      if (existingByHash) {
        duplicateNotice.value = existingByHash.title;
        return { success: false, isDuplicate: true, book: existingByHash };
      }

      const format = scannerService.determineFormat(file.name);
      if (!format) {
        duplicateNotice.value = candidateTitle;
        return { success: false, isDuplicate: false };
      }

      const destinationPath = `books/${hash}_${file.name}`;
      await Filesystem.writeFile({
        path: destinationPath,
        data: base64,
        directory: Directory.Data,
        recursive: true,
      });

      const initialLocator = format === 'pdf' ? '1' : format === 'fb2' ? 'fb2-p-0' : '';
      const now = Date.now();

      const bookRecord: BookRecord = {
        id: hash,
        title: candidateTitle,
        author: null,
        format,
        file_path: destinationPath,
        cover_path: null,
        locator: initialLocator,
        progress_percentage: 0,
        total_items: 0,
        last_read_at: now,
        updated_at: now,
        file_size: file.size,
        file_hash: hash,
      };

      const addResult = await libraryStore.addBook(bookRecord);
      if (!addResult.success && addResult.isDuplicate) {
        duplicateNotice.value = bookRecord.title;
        return { success: false, isDuplicate: true, book: addResult.book };
      }

      try {
        const coverPath = await coverQueue.enqueue(bookRecord.id, bookRecord.format, arrayBuffer);
        if (coverPath) {
          bookRecord.cover_path = coverPath;
          await libraryStore.updateCover(bookRecord.id, coverPath);
        }
      } catch {}

      return { success: true, book: bookRecord };
    } finally {
      isScanning.value = false;
    }
  };

  const importNativeFiles = async (
    files: Array<{ name: string; path?: string; data?: string; size?: number }>,
  ): Promise<{ importedCount: number; duplicates: string[] }> => {
    isScanning.value = true;
    scanProgress.value = 0;
    let importedCount = 0;
    const duplicates: string[] = [];

    try {
      await libraryStore.loadBooks();

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const fileName = f.name;
        const candidateTitle = fileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');

        const existingByTitle = libraryStore.findDuplicate({ title: candidateTitle });
        if (existingByTitle) {
          duplicates.push(candidateTitle);
          scanProgress.value = Math.round(((i + 1) / files.length) * 100);
          continue;
        }

        let base64Data = f.data;
        if (!base64Data && f.path) {
          try {
            const readRes = await Filesystem.readFile({ path: f.path });
            base64Data = typeof readRes.data === 'string' ? readRes.data : '';
          } catch {}
        }

        if (!base64Data) {
          scanProgress.value = Math.round(((i + 1) / files.length) * 100);
          continue;
        }

        const hash = await FileHashService.calculateSha256(base64Data);
        const existingByHash = libraryStore.findDuplicate({ id: hash });
        if (existingByHash) {
          duplicates.push(existingByHash.title);
          scanProgress.value = Math.round(((i + 1) / files.length) * 100);
          continue;
        }

        const format = scannerService.determineFormat(fileName);
        if (!format) {
          scanProgress.value = Math.round(((i + 1) / files.length) * 100);
          continue;
        }

        const destinationPath = `books/${hash}_${fileName}`;
        await Filesystem.writeFile({
          path: destinationPath,
          data: base64Data,
          directory: Directory.Data,
          recursive: true,
        });

        const initialLocator = format === 'pdf' ? '1' : format === 'fb2' ? 'fb2-p-0' : '';
        const now = Date.now();

        const bookRecord: BookRecord = {
          id: hash,
          title: candidateTitle,
          author: null,
          format,
          file_path: destinationPath,
          cover_path: null,
          locator: initialLocator,
          progress_percentage: 0,
          total_items: 0,
          last_read_at: now,
          updated_at: now,
          file_size: f.size || base64Data.length,
          file_hash: hash,
        };

        const addResult = await libraryStore.addBook(bookRecord);
        if (addResult.success) {
          importedCount++;
          coverQueue
            .enqueue(bookRecord.id, bookRecord.format, base64Data)
            .then((coverPath) => {
              if (coverPath) {
                libraryStore.updateCover(bookRecord.id, coverPath);
              }
            })
            .catch(() => {});
        } else if (addResult.isDuplicate) {
          duplicates.push(candidateTitle);
        }

        scanProgress.value = Math.round(((i + 1) / files.length) * 100);
      }

      return { importedCount, duplicates };
    } finally {
      isScanning.value = false;
      scanProgress.value = 0;
    }
  };

  const importFromBlob = async (file: File): Promise<AddBookResult> => {
    return await importBook(file);
  };

  const clearDuplicateNotice = () => {
    duplicateNotice.value = null;
  };

  return {
    isScanning,
    scanProgress,
    scannedFiles,
    duplicateNotice,
    scanDevice,
    importFiles,
    importBook,
    importFromBlob,
    importNativeFiles,
    clearDuplicateNotice,
  };
}
