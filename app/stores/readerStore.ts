import { defineStore } from 'pinia';
import type { BookRecord, ReaderLocation, ReaderSettings, ReaderTheme, TextSelectionDetail } from '../types';

export const useReaderStore = defineStore('reader', {
  state: () => ({
    currentBook: null as BookRecord | null,
    locator: '',
    progressPercentage: 0,
    currentPage: 1,
    totalPages: 1,
    settings: {
      theme: 'light' as ReaderTheme,
      fontSize: 18,
      fontFamily: 'serif',
      lineHeight: 1.6,
    } as ReaderSettings,
    isImmersiveMode: true,
    isRendering: false,
    selection: null as TextSelectionDetail | null,
  }),
  actions: {
    setBook(book: BookRecord): void {
      this.currentBook = book;
      this.locator = book.locator;
      this.progressPercentage = book.progress_percentage;
    },
    updateLocation(location: ReaderLocation): void {
      this.locator = location.locator;
      this.progressPercentage = location.progressPercentage;
      if (location.currentPage !== undefined) {
        this.currentPage = location.currentPage;
      }
      if (location.totalPages !== undefined) {
        this.totalPages = location.totalPages;
      }
    },
    toggleImmersiveMode(): void {
      this.isImmersiveMode = !this.isImmersiveMode;
    },
    setImmersiveMode(val: boolean): void {
      this.isImmersiveMode = val;
    },
    setTheme(theme: ReaderTheme): void {
      this.settings.theme = theme;
    },
    setFontSize(size: number): void {
      this.settings.fontSize = Math.min(Math.max(size, 12), 36);
    },
    setFontFamily(family: string): void {
      this.settings.fontFamily = family;
    },
    setSelection(selection: TextSelectionDetail | null): void {
      this.selection = selection;
    },
    setRendering(val: boolean): void {
      this.isRendering = val;
    },
  },
});
