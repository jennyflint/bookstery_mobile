import { defineStore } from 'pinia';
import { CollectionRepository } from '../services/database/CollectionRepository';
import type { BookRecord, Collection, CollectionFilter, CollectionWithCount } from '../types';

export const useCollectionStore = defineStore('collection', {
  state: () => ({
    collections: [] as CollectionWithCount[],
    selectedCollectionId: 'all' as CollectionFilter,
    currentBooks: [] as BookRecord[],
    isLoading: false,
  }),

  getters: {
    selectedCollection(state): CollectionWithCount | null {
      if (typeof state.selectedCollectionId !== 'number') {
        return null;
      }
      return state.collections.find((c) => c.id === state.selectedCollectionId) || null;
    },
    totalCollectionsCount(state): number {
      return state.collections.length;
    },
  },

  actions: {
    async fetchCollections(): Promise<void> {
      this.isLoading = true;
      try {
        const repo = CollectionRepository.getInstance();
        this.collections = await repo.getAllCollectionsWithCounts();
        if (this.selectedCollectionId !== 'all') {
          await this.loadCollectionBooks(this.selectedCollectionId);
        }
      } finally {
        this.isLoading = false;
      }
    },

    async loadCollectionBooks(filter: CollectionFilter): Promise<void> {
      const repo = CollectionRepository.getInstance();
      if (filter === 'all') {
        this.currentBooks = [];
        return;
      }
      const collectionId = filter === 'uncollected' ? null : filter;
      this.currentBooks = await repo.getBooksByCollection(collectionId);
    },

    async createCollection(name: string): Promise<Collection> {
      this.isLoading = true;
      try {
        const repo = CollectionRepository.getInstance();
        const created = await repo.createCollection(name);
        await this.fetchCollections();
        return created;
      } finally {
        this.isLoading = false;
      }
    },

    async renameCollection(id: number, newName: string): Promise<void> {
      this.isLoading = true;
      try {
        const repo = CollectionRepository.getInstance();
        await repo.renameCollection(id, newName);
        await this.fetchCollections();
      } finally {
        this.isLoading = false;
      }
    },

    async deleteCollection(id: number): Promise<void> {
      this.isLoading = true;
      try {
        const repo = CollectionRepository.getInstance();
        await repo.deleteCollection(id);
        if (this.selectedCollectionId === id) {
          this.selectedCollectionId = 'all';
          this.currentBooks = [];
        }
        await this.fetchCollections();
      } finally {
        this.isLoading = false;
      }
    },

    async updateBookCollections(bookId: string, collectionIds: number[]): Promise<void> {
      this.isLoading = true;
      try {
        const repo = CollectionRepository.getInstance();
        await repo.assignBookToCollections(bookId, collectionIds);
        await this.fetchCollections();
      } finally {
        this.isLoading = false;
      }
    },

    async getBookCollectionIds(bookId: string): Promise<number[]> {
      const repo = CollectionRepository.getInstance();
      return await repo.getBookCollectionIds(bookId);
    },

    async removeBookFromCollection(bookId: string, collectionId: number): Promise<void> {
      const currentCollectionIds = await this.getBookCollectionIds(bookId);
      const updated = currentCollectionIds.filter((id) => id !== collectionId);
      await this.updateBookCollections(bookId, updated);
      if (this.selectedCollectionId === collectionId) {
        await this.loadCollectionBooks(collectionId);
      }
    },

    setSelectedCollection(id: CollectionFilter): void {
      this.selectedCollectionId = id;
      this.loadCollectionBooks(id);
    },
  },
});
