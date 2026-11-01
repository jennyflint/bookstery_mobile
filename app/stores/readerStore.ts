import { defineStore } from 'pinia';
import type {
  BookRecord,
  ReaderLocation,
  ReaderPaginationMode,
  ReaderSettings,
  ReaderTheme,
  ReflowBlock,
  ReflowFontFamily,
  ReflowTheme,
  TextSelectionDetail,
} from '../types';

const STORAGE_KEY = 'bookstery_reader_settings';
const REFLOW_STORAGE_KEY = 'bookstery_reflow_settings';

interface StoredReflowSettings {
  isReflowMode?: boolean;
  reflowFontSize?: number;
  reflowLineHeight?: number;
  reflowFontFamily?: ReflowFontFamily;
  reflowTheme?: ReflowTheme;
}

const DEFAULT_REFLOW_SETTINGS: Required<StoredReflowSettings> = {
  isReflowMode: false,
  reflowFontSize: 18,
  reflowLineHeight: 1.65,
  reflowFontFamily: 'serif',
  reflowTheme: 'light',
};

function getStoredReflowSettings(): Required<StoredReflowSettings> {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_REFLOW_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(REFLOW_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_REFLOW_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
  }
  return { ...DEFAULT_REFLOW_SETTINGS };
}

function persistReflowSettings(settings: StoredReflowSettings): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(REFLOW_STORAGE_KEY, JSON.stringify(settings));
  } catch {
  }
}

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
  state: () => {
    const initialReflow = getStoredReflowSettings();
    return {
      currentBook: null as BookRecord | null,
      locator: '',
      progressPercentage: 0,
      currentPage: 1,
      totalPages: 1,
      currentChapterTitle: null as string | null,
      pageNavigator: null as ((page: number) => Promise<void> | void) | null,
      settings: getStoredSettings(),
      isImmersiveMode: true,
      isRendering: false,
      selection: null as TextSelectionDetail | null,
      isReflowMode: initialReflow.isReflowMode,
      reflowFontSize: initialReflow.reflowFontSize,
      reflowLineHeight: initialReflow.reflowLineHeight,
      reflowFontFamily: initialReflow.reflowFontFamily,
      reflowTheme: initialReflow.reflowTheme,
      reflowCache: new Map<number, ReflowBlock[]>(),
    };
  },
  getters: {
    reflowThemeColors: (state): { bg: string; text: string } => {
      switch (state.reflowTheme) {
        case 'sepia':
          return { bg: '#f8f1e3', text: '#433422' };
        case 'dark':
          return { bg: '#111827', text: '#f3f4f6' };
        case 'light':
        default:
          return { bg: '#ffffff', text: '#111827' };
      }
    },
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
    saveReflowState(): void {
      persistReflowSettings({
        isReflowMode: this.isReflowMode,
        reflowFontSize: this.reflowFontSize,
        reflowLineHeight: this.reflowLineHeight,
        reflowFontFamily: this.reflowFontFamily,
        reflowTheme: this.reflowTheme,
      });
    },
    setReflowMode(val: boolean): void {
      this.isReflowMode = val;
      this.saveReflowState();
    },
    toggleReflowMode(): void {
      this.isReflowMode = !this.isReflowMode;
      this.saveReflowState();
    },
    setReflowFontSize(size: number): void {
      this.reflowFontSize = Math.min(28, Math.max(14, Math.round(size)));
      this.saveReflowState();
    },
    setReflowLineHeight(height: number): void {
      const clamped = Math.min(2.0, Math.max(1.4, Math.round(height * 100) / 100));
      this.reflowLineHeight = clamped;
      this.saveReflowState();
    },
    setReflowFontFamily(fontFamily: ReflowFontFamily): void {
      this.reflowFontFamily = fontFamily;
      this.saveReflowState();
    },
    setReflowTheme(theme: ReflowTheme): void {
      this.reflowTheme = theme;
      this.saveReflowState();
    },
    getCachedReflowBlocks(page: number): ReflowBlock[] | undefined {
      return this.reflowCache.get(page);
    },
    setCachedReflowBlocks(page: number, blocks: ReflowBlock[]): void {
      this.reflowCache.set(page, blocks);
    },
    clearReflowCache(): void {
      this.reflowCache.clear();
    },
    setBook(book: BookRecord): void {
      this.clearReflowCache();
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
      if (location.chapterTitle !== undefined) {
        this.currentChapterTitle = location.chapterTitle;
      }
    },
    setChapterTitle(title: string | null): void {
      this.currentChapterTitle = title;
    },
    registerPageNavigator(navigator: ((page: number) => Promise<void> | void) | null): void {
      this.pageNavigator = navigator;
    },
    async goToPage(targetPage: number): Promise<void> {
      const total = Math.max(1, this.totalPages);
      const clampedPage = Math.max(1, Math.min(total, Math.round(targetPage)));
      this.currentPage = clampedPage;
      this.locator = String(clampedPage);
      this.progressPercentage =
        total > 0 ? Number(((clampedPage / total) * 100).toFixed(2)) : 0;
      if (this.pageNavigator) {
        await this.pageNavigator(clampedPage);
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
