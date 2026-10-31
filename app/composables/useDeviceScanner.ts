import { ref } from 'vue';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { DeviceFileScannerService } from '../services/scanner/DeviceFileScannerService';
import { FileHashService } from '../services/scanner/FileHashService';
import { CoverGenerationQueueService } from '../services/covers/CoverGenerationQueueService';
import { useLibraryStore } from '../stores/libraryStore';
import type { BookRecord, ScannedFile } from '../types';

export function useDeviceScanner() {
  const isScanning = ref(false);
  const scanProgress = ref(0);
  const scannedFiles = ref<ScannedFile[]>([]);
  const scannerService = new DeviceFileScannerService();
  const libraryStore = useLibraryStore();
  const coverQueue = CoverGenerationQueueService.getInstance();

  const scanDevice = async (): Promise<ScannedFile[]> => {
    isScanning.value = true;
    scannedFiles.value = [];
    try {
      const documentsFiles = await scannerService.scanDirectory('', Directory.Documents);
      const dataFiles = await scannerService.scanDirectory('', Directory.Data);
      const combined = [...documentsFiles, ...dataFiles];

      const uniqueMap = new Map<string, ScannedFile>();
      for (const f of combined) {
        uniqueMap.set(f.path, f);
      }
      scannedFiles.value = Array.from(uniqueMap.values());
      return scannedFiles.value;
    } finally {
      isScanning.value = false;
    }
  };

  const importFiles = async (files: ScannedFile[]): Promise<number> => {
    isScanning.value = true;
    scanProgress.value = 0;
    let importedCount = 0;

    try {
      await libraryStore.loadBooks();
      const existingIds = new Set(libraryStore.books.map((b) => b.id));

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const imported = await scannerService.importBookFile(
            file.path,
            Directory.Documents,
            existingIds,
          );
          if (imported) {
            await libraryStore.addBook(imported);
            existingIds.add(imported.id);
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
          }
        } catch {
        }
        scanProgress.value = Math.round(((i + 1) / files.length) * 100);
      }
      return importedCount;
    } finally {
      isScanning.value = false;
      scanProgress.value = 0;
    }
  };

  const importBook = async (file: File): Promise<BookRecord | null> => {
    isScanning.value = true;
    try {
      await libraryStore.loadBooks();
      const existingIds = new Set(libraryStore.books.map((b) => b.id));
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);

      let binaryString = '';
      for (let i = 0; i < uint8.length; i++) {
        binaryString += String.fromCharCode(uint8[i]);
      }
      const base64 = btoa(binaryString);

      const tempPath = `${file.name}`;
      await Filesystem.writeFile({
        path: tempPath,
        data: base64,
        directory: Directory.Documents,
      });

      const imported = await scannerService.importBookFile(tempPath, Directory.Documents, existingIds);
      if (imported) {
        await libraryStore.addBook(imported);
        const coverPath = await coverQueue.enqueue(imported.id, imported.format, arrayBuffer);
        if (coverPath) {
          imported.cover_path = coverPath;
          await libraryStore.updateCover(imported.id, coverPath);
        }
        return imported;
      }

      const hash = await FileHashService.calculateSha256(base64);
      const existing = libraryStore.books.find((b) => b.id === hash);
      if (existing) {
        const coverPath = await coverQueue.enqueue(existing.id, existing.format, arrayBuffer);
        if (coverPath) {
          existing.cover_path = coverPath;
          await libraryStore.updateCover(existing.id, coverPath);
        }
        return existing;
      }
      return null;
    } finally {
      isScanning.value = false;
    }
  };

  const importFromBlob = async (file: File): Promise<void> => {
    await importBook(file);
  };

  return {
    isScanning,
    scanProgress,
    scannedFiles,
    scanDevice,
    importFiles,
    importBook,
    importFromBlob,
  };
}
