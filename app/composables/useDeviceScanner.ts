import { ref } from 'vue';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { DeviceFileScannerService } from '../services/scanner/DeviceFileScannerService';
import { useLibraryStore } from '../stores/libraryStore';
import type { ScannedFile } from '../types';

export function useDeviceScanner() {
  const isScanning = ref(false);
  const scanProgress = ref(0);
  const scannedFiles = ref<ScannedFile[]>([]);
  const scannerService = new DeviceFileScannerService();
  const libraryStore = useLibraryStore();

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

  const importFromBlob = async (file: File): Promise<void> => {
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

      const tempPath = `temp_${file.name}`;
      await Filesystem.writeFile({
        path: tempPath,
        data: base64,
        directory: Directory.Documents,
      });

      const imported = await scannerService.importBookFile(tempPath, Directory.Documents, existingIds);
      if (imported) {
        await libraryStore.addBook(imported);
      }
    } finally {
      isScanning.value = false;
    }
  };

  return {
    isScanning,
    scanProgress,
    scannedFiles,
    scanDevice,
    importFiles,
    importFromBlob,
  };
}
