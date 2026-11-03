import { defineStore } from 'pinia';
import { ScanDirectoryRepository } from '../services/database/ScanDirectoryRepository';
import { AutoScanService } from '../services/scanner/AutoScanService';
import { useLibraryStore } from './libraryStore';
import type { ScanDirectory, ScannerSettings, ScanResultSummary } from '../types';

export const useScannerStore = defineStore('scanner', {
  state: () => ({
    directories: [] as ScanDirectory[],
    settings: {
      id: 1,
      auto_scan_on_startup: 1,
      scan_subdirectories: 1,
      updated_at: 0,
    } as ScannerSettings,
    isScanning: false,
    lastScanSummary: null as ScanResultSummary | null,
    currentCheckedCount: 0,
    currentCheckingFile: '',
    showNotification: false,
    isInitialized: false,
    permissionDenied: false,
  }),

  getters: {
    activeDirectories(state): ScanDirectory[] {
      return state.directories.filter((d) => d.is_active === 1);
    },
    hasActiveDirectories(state): boolean {
      return state.directories.some((d) => d.is_active === 1);
    },
  },

  actions: {
    async init(): Promise<void> {
      if (this.isInitialized) {
        return;
      }
      const repo = ScanDirectoryRepository.getInstance();
      this.directories = await repo.getAllDirectories();
      this.settings = await repo.getSettings();
      this.isInitialized = true;

      // Reclaim any redundant sandbox storage in the background on startup
      const scanner = AutoScanService.getInstance();
      scanner.cleanupDuplicatedSandboxBooks().catch((err) => {
        console.warn('[scannerStore] Background sandbox cleanup error:', err);
      });
    },

    async refreshDirectories(): Promise<void> {
      const repo = ScanDirectoryRepository.getInstance();
      this.directories = await repo.getAllDirectories();
    },

    async addFolder(uri: string, displayName: string): Promise<ScanDirectory | null> {
      const repo = ScanDirectoryRepository.getInstance();
      const created = await repo.addDirectory(uri, displayName);
      await this.refreshDirectories();
      return created;
    },

    async removeFolder(id: number): Promise<void> {
      const repo = ScanDirectoryRepository.getInstance();
      await repo.removeDirectory(id);
      this.directories = this.directories.filter((d) => d.id !== id);
    },

    async toggleFolder(id: number, isActive: boolean): Promise<void> {
      const repo = ScanDirectoryRepository.getInstance();
      await repo.toggleDirectory(id, isActive);
      const target = this.directories.find((d) => d.id === id);
      if (target) {
        target.is_active = isActive ? 1 : 0;
      }
    },

    async updateSettings(
      partial: Partial<Pick<ScannerSettings, 'auto_scan_on_startup' | 'scan_subdirectories'>>,
    ): Promise<void> {
      const repo = ScanDirectoryRepository.getInstance();
      this.settings = await repo.updateSettings(partial);
    },

    async runStartupScan(): Promise<ScanResultSummary | null> {
      await this.init();
      if (this.settings.auto_scan_on_startup === 0 || !this.hasActiveDirectories) {
        return null;
      }
      return this.executeScan(false);
    },

    async runManualScan(): Promise<ScanResultSummary> {
      await this.init();
      return this.executeScan(true);
    },

    async executeScan(interactive: boolean = true): Promise<ScanResultSummary> {
      if (this.isScanning) {
        return (
          this.lastScanSummary || {
            scannedFilesCount: 0,
            newBooksCount: 0,
            updatedBooksCount: 0,
            skippedBooksCount: 0,
            failedCount: 0,
            newBookIds: [],
          }
        );
      }

      this.isScanning = true;
      this.currentCheckedCount = 0;
      this.currentCheckingFile = '';

      try {
        const scanner = AutoScanService.getInstance();

        // Without storage access every folder read fails silently, so surface it instead of scanning.
        const hasAccess = await scanner.ensureFilesystemPermissions(interactive);
        this.permissionDenied = !hasAccess;
        if (!hasAccess) {
          return {
            scannedFilesCount: 0,
            newBooksCount: 0,
            updatedBooksCount: 0,
            skippedBooksCount: 0,
            failedCount: 0,
            newBookIds: [],
          };
        }

        const summary = await scanner.scanAllActiveDirectories((count, fileName) => {
          this.currentCheckedCount = count;
          this.currentCheckingFile = fileName;
        });

        this.lastScanSummary = summary;
        await this.refreshDirectories();

        if (summary.newBooksCount > 0 || summary.updatedBooksCount > 0) {
          const libraryStore = useLibraryStore();
          await libraryStore.loadBooks();
          if (summary.newBooksCount > 0) {
            this.showNotification = true;
          }
        }

        return summary;
      } finally {
        this.isScanning = false;
        this.currentCheckingFile = '';
      }
    },

    dismissNotification(): void {
      this.showNotification = false;
    },
  },
});
