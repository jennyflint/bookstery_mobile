import { defineStore } from 'pinia';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { SqliteService } from '../services/database/SqliteService';
import { CoverGenerationQueueService } from '../services/covers/CoverGenerationQueueService';
import type { BookFormat, BookRecord } from '../types';

export const useLibraryStore = defineStore('library', {
  state: () => ({
    books: [] as BookRecord[],
    activeBook: null as BookRecord | null,
    isLoading: false,
    searchQuery: '',
    formatFilter: 'all' as 'all' | BookFormat,
  }),
  getters: {
    filteredBooks(state): BookRecord[] {
      return state.books.filter((book) => {
        const matchesQuery = !state.searchQuery ||
          book.title.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
          (book.author && book.author.toLowerCase().includes(state.searchQuery.toLowerCase()));

        const matchesFormat = state.formatFilter === 'all' || book.format === state.formatFilter;

        return matchesQuery && matchesFormat;
      });
    },
    totalBooksCount(state): number {
      return state.books.length;
    },
  },
  actions: {
    async loadBooks(): Promise<void> {
      this.isLoading = true;
      try {
        const sqlite = SqliteService.getInstance();
        this.books = await sqlite.getAllBooks();
        this.generateMissingCovers();
      } finally {
        this.isLoading = false;
      }
    },
    async generateMissingCovers(): Promise<void> {
      const missing = this.books.filter((b) => !b.cover_path);
      if (missing.length === 0) {
        return;
      }

      const queue = CoverGenerationQueueService.getInstance();

      for (const book of missing) {
        try {
          const fileData = await Filesystem.readFile({
            path: book.file_path,
            directory: Directory.Data,
          });

          if (fileData.data) {
            queue.enqueue(book.id, book.format, fileData.data).then((coverPath) => {
              if (coverPath) {
                this.updateCover(book.id, coverPath);
              }
            });
          }
        } catch {
          try {
            const docData = await Filesystem.readFile({
              path: book.file_path,
              directory: Directory.Documents,
            });
            if (docData.data) {
              queue.enqueue(book.id, book.format, docData.data).then((coverPath) => {
                if (coverPath) {
                  this.updateCover(book.id, coverPath);
                }
              });
            }
          } catch {}
        }
      }
    },
    async addBook(book: BookRecord): Promise<void> {
      const sqlite = SqliteService.getInstance();
      await sqlite.upsertBook(book);
      const index = this.books.findIndex((b) => b.id === book.id);
      if (index !== -1) {
        this.books[index] = book;
      } else {
        this.books.unshift(book);
      }
    },
    async removeBook(id: string): Promise<void> {
      const sqlite = SqliteService.getInstance();
      await sqlite.deleteBook(id);
      this.books = this.books.filter((b) => b.id !== id);
      if (this.activeBook?.id === id) {
        this.activeBook = null;
      }
    },
    async updateProgress(bookId: string, locator: string, percentage: number): Promise<void> {
      const sqlite = SqliteService.getInstance();
      await sqlite.updateReadingPosition(bookId, locator, percentage);
      const target = this.books.find((b) => b.id === bookId);
      if (target) {
        target.locator = locator;
        target.progress_percentage = percentage;
        target.last_read_at = Date.now();
        target.updated_at = Date.now();
      }
    },
    async updateCover(bookId: string, coverPath: string | null): Promise<void> {
      const sqlite = SqliteService.getInstance();
      await sqlite.updateCoverPath(bookId, coverPath);
      const target = this.books.find((b) => b.id === bookId);
      if (target) {
        target.cover_path = coverPath;
        target.updated_at = Date.now();
      }
    },
    setActiveBook(book: BookRecord | null): void {
      this.activeBook = book;
    },
    setSearchQuery(query: string): void {
      this.searchQuery = query;
    },
    setFormatFilter(format: 'all' | BookFormat): void {
      this.formatFilter = format;
    },
  },
});
