import { ref } from 'vue';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { DeviceFileScannerService } from '../services/scanner/DeviceFileScannerService';
import { FileHashService } from '../services/scanner/FileHashService';
import { CoverGenerationQueueService } from '../services/covers/CoverGenerationQueueService';
import { useLibraryStore } from '../stores/libraryStore';
import type { AddBookResult, BookRecord, ImportFilesResult, ScannedFile } from '../types';

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

              const fileData = await Filesystem.readFile({
                path: file.path,
                directory: Directory.Documents,
              });

              coverQueue.enqueue(imported.id, imported.format, fileData.data).then((coverPath) => {
                if (coverPath) {
                  libraryStore.updateCover(imported.id, coverPath);
                }
              });
            } else if (addResult.isDuplicate) {
              duplicateCount++;
            }
          } else {
            duplicateCount++;
          }
        } catch {
        }
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
      const uint8 = new Uint8Array(arrayBuffer);

      let binaryString = '';
      for (let i = 0; i < uint8.length; i++) {
        binaryString += String.fromCharCode(uint8[i]);
      }
      const base64 = btoa(binaryString);

      const hash = await FileHashService.calculateSha256(base64);
      const existingByHash = libraryStore.findDuplicate({ id: hash });
      if (existingByHash) {
        duplicateNotice.value = existingByHash.title;
        return { success: false, isDuplicate: true, book: existingByHash };
      }

      const tempPath = `${file.name}`;
      await Filesystem.writeFile({
        path: tempPath,
        data: base64,
        directory: Directory.Documents,
      });

      const imported = await scannerService.importBookFile(tempPath, Directory.Documents, libraryStore.books);
      if (imported) {
        const addResult = await libraryStore.addBook(imported);
        if (!addResult.success && addResult.isDuplicate) {
          duplicateNotice.value = imported.title;
          return { success: false, isDuplicate: true, book: addResult.book };
        }

        const coverPath = await coverQueue.enqueue(imported.id, imported.format, arrayBuffer);
        if (coverPath) {
          imported.cover_path = coverPath;
          await libraryStore.updateCover(imported.id, coverPath);
        }
        return { success: true, book: imported };
      }

      duplicateNotice.value = candidateTitle;
      return { success: false, isDuplicate: true };
    } finally {
      isScanning.value = false;
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
    clearDuplicateNotice,
  };
}
