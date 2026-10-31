import { defineStore } from 'pinia';
import type {
  BookRecord,
  ReaderLocation,
  ReaderPaginationMode,
  ReaderSettings,
  ReaderTheme,
  TextSelectionDetail,
} from '../types';

const STORAGE_KEY = 'bookstery_reader_settings';

const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'light',
  fontSize: 18,
  fontFamily: 'serif',
  lineHeight: 1.6,
  paginationMode: 'scroll',
  customBackgroundColor: '#ffffff',
  customTextColor: '#18181b',
};

function getStoredSettings(): ReaderSettings {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
  }
  return { ...DEFAULT_SETTINGS };
}

function persistSettings(settings: ReaderSettings): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
  }
}

export const useReaderStore = defineStore('reader', {
  state: () => ({
    currentBook: null as BookRecord | null,
    locator: '',
    progressPercentage: 0,
    currentPage: 1,
    totalPages: 1,
    settings: getStoredSettings(),
    isImmersiveMode: true,
    isRendering: false,
    selection: null as TextSelectionDetail | null,
  }),
  getters: {
    currentThemeColors: (state): { bg: string; text: string } => {
      if (state.settings.theme === 'custom') {
        return {
          bg: state.settings.customBackgroundColor || '#ffffff',
          text: state.settings.customTextColor || '#18181b',
        };
      }
      switch (state.settings.theme) {
        case 'sepia':
          return { bg: '#f4ecd8', text: '#433422' };
        case 'night':
          return { bg: '#18181b', text: '#f4f4f5' };
        case 'oled':
          return { bg: '#000000', text: '#e4e4e7' };
        case 'light':
        default:
          return { bg: '#ffffff', text: '#18181b' };
      }
    },
  },
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
    setPaginationMode(mode: ReaderPaginationMode): void {
      this.settings.paginationMode = mode;
      persistSettings(this.settings);
    },
    setCustomBackgroundColor(color: string): void {
      this.settings.customBackgroundColor = color;
      this.settings.theme = 'custom';
      persistSettings(this.settings);
    },
    setCustomTextColor(color: string): void {
      this.settings.customTextColor = color;
      this.settings.theme = 'custom';
      persistSettings(this.settings);
    },
    setTheme(theme: ReaderTheme): void {
      this.settings.theme = theme;
      if (theme === 'light') {
        this.settings.customBackgroundColor = '#ffffff';
        this.settings.customTextColor = '#18181b';
      } else if (theme === 'sepia') {
        this.settings.customBackgroundColor = '#f4ecd8';
        this.settings.customTextColor = '#433422';
      } else if (theme === 'night') {
        this.settings.customBackgroundColor = '#18181b';
        this.settings.customTextColor = '#f4f4f5';
      } else if (theme === 'oled') {
        this.settings.customBackgroundColor = '#000000';
        this.settings.customTextColor = '#e4e4e7';
      }
      persistSettings(this.settings);
    },
    setFontSize(size: number): void {
      this.settings.fontSize = Math.min(Math.max(size, 12), 36);
      persistSettings(this.settings);
    },
    setFontFamily(family: string): void {
      this.settings.fontFamily = family;
      persistSettings(this.settings);
    },
    setSelection(selection: TextSelectionDetail | null): void {
      this.selection = selection;
    },
    setRendering(val: boolean): void {
      this.isRendering = val;
    },
    resetToDefault(): void {
      this.settings = { ...DEFAULT_SETTINGS };
      persistSettings(this.settings);
    },
  },
});
