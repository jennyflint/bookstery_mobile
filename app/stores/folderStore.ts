import { defineStore } from 'pinia';
import { FolderRepository } from '../services/database/FolderRepository';
import type { BookRecord, Folder, FolderFilter, FolderWithCount } from '../types';

export const useFolderStore = defineStore('folder', {
  state: () => ({
    folders: [] as FolderWithCount[],
    selectedFolderId: 'all' as FolderFilter,
    currentBooks: [] as BookRecord[],
    isLoading: false,
  }),

  getters: {
    selectedFolder(state): FolderWithCount | null {
      if (typeof state.selectedFolderId !== 'number') {
        return null;
      }
      return state.folders.find((f) => f.id === state.selectedFolderId) || null;
    },
    totalFoldersCount(state): number {
      return state.folders.length;
    },
  },

  actions: {
    async fetchFolders(): Promise<void> {
      this.isLoading = true;
      try {
        const repo = FolderRepository.getInstance();
        this.folders = await repo.getAllFoldersWithCounts();
        if (this.selectedFolderId !== 'all') {
          await this.loadFolderBooks(this.selectedFolderId);
        }
      } finally {
        this.isLoading = false;
      }
    },

    async loadFolderBooks(filter: FolderFilter): Promise<void> {
      const repo = FolderRepository.getInstance();
      if (filter === 'all') {
        this.currentBooks = [];
        return;
      }
      const folderId = filter === 'uncategorized' ? null : filter;
      this.currentBooks = await repo.getBooksByFolder(folderId);
    },

    async createFolder(name: string): Promise<Folder> {
      this.isLoading = true;
      try {
        const repo = FolderRepository.getInstance();
        const created = await repo.createFolder(name);
        await this.fetchFolders();
        return created;
      } finally {
        this.isLoading = false;
      }
    },

    async renameFolder(id: number, newName: string): Promise<void> {
      this.isLoading = true;
      try {
        const repo = FolderRepository.getInstance();
        await repo.renameFolder(id, newName);
        await this.fetchFolders();
      } finally {
        this.isLoading = false;
      }
    },

    async deleteFolder(id: number): Promise<void> {
      this.isLoading = true;
      try {
        const repo = FolderRepository.getInstance();
        await repo.deleteFolder(id);
        if (this.selectedFolderId === id) {
          this.selectedFolderId = 'all';
          this.currentBooks = [];
        }
        await this.fetchFolders();
      } finally {
        this.isLoading = false;
      }
    },

    async updateBookFolders(bookId: string, folderIds: number[]): Promise<void> {
      this.isLoading = true;
      try {
        const repo = FolderRepository.getInstance();
        await repo.assignBookToFolders(bookId, folderIds);
        await this.fetchFolders();
      } finally {
        this.isLoading = false;
      }
    },

    async getBookFolderIds(bookId: string): Promise<number[]> {
      const repo = FolderRepository.getInstance();
      return await repo.getBookFolderIds(bookId);
    },

    async removeBookFromFolder(bookId: string, folderId: number): Promise<void> {
      const currentFolderIds = await this.getBookFolderIds(bookId);
      const updated = currentFolderIds.filter((id) => id !== folderId);
      await this.updateBookFolders(bookId, updated);
      if (this.selectedFolderId === folderId) {
        await this.loadFolderBooks(folderId);
      }
    },

    setSelectedFolder(id: FolderFilter): void {
      this.selectedFolderId = id;
      this.loadFolderBooks(id);
    },
  },
});
