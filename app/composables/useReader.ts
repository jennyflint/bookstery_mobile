import { shallowRef, markRaw } from 'vue';
import { PdfEngine } from '../services/engines/PdfEngine';
import { EpubEngine } from '../services/engines/EpubEngine';
import { Fb2Engine } from '../services/engines/Fb2Engine';
import type { ReaderEngineInterface, BookRecord, ReaderPaginationMode } from '../types';
import { useReaderStore } from '../stores/readerStore';
import { useLibraryStore } from '../stores/libraryStore';
import { useBookSync } from './useBookSync';
import { useTextSelection } from './useTextSelection';

export function useReader() {
  const activeEngine = shallowRef<ReaderEngineInterface | null>(null);
  const readerStore = useReaderStore();
  const libraryStore = useLibraryStore();
  const { queueProgress } = useBookSync();
  const { clearSelection } = useTextSelection();

  const createEngine = (format: string): ReaderEngineInterface => {
    switch (format) {
      case 'pdf':
        return new PdfEngine();
      case 'epub':
        return new EpubEngine();
      case 'fb2':
        return new Fb2Engine();
      default:
        throw new Error(`Unsupported book format: ${format}`);
    }
  };

  const openBook = async (
    container: HTMLElement,
    book: BookRecord,
    fileData: Uint8Array | ArrayBuffer | string,
  ): Promise<void> => {
    readerStore.setRendering(true);
    readerStore.setBook(book);

    if (activeEngine.value) {
      activeEngine.value.destroy();
      activeEngine.value = null;
    }

    try {
      const engine = markRaw(createEngine(book.format));
      activeEngine.value = engine;

      if (engine.setPaginationMode) {
        await engine.setPaginationMode(readerStore.settings.paginationMode);
      }

      if (engine.applyTheme) {
        engine.applyTheme(readerStore.currentThemeColors);
      }

      if (engine.setFontSize) {
        await engine.setFontSize(readerStore.settings.fontSize);
      }

      await engine.init(container, fileData, book.locator);

      if (engine.applyTheme) {
        engine.applyTheme(readerStore.currentThemeColors);
      }

      if (book.locator) {
        await engine.goTo(book.locator);
      }

      const initialLoc = engine.getCurrentLocation();
      readerStore.updateLocation(initialLoc);
      readerStore.registerPageNavigator(async (page: number) => {
        await goToLocator(String(page));
      });

      // Attach location listener after initial position restoration so start position doesn't overwrite saved locator
      engine.onLocationChange = (location) => {
        readerStore.updateLocation(location);
        if (readerStore.currentBook) {
          libraryStore.updateProgress(
            readerStore.currentBook.id,
            location.locator,
            location.progressPercentage,
          );
          queueProgress(
            readerStore.currentBook.id,
            location.locator,
            location.progressPercentage,
          );
        }
      };
    } finally {
      readerStore.setRendering(false);
    }
  };

  const setPaginationMode = async (mode: ReaderPaginationMode): Promise<void> => {
    readerStore.setPaginationMode(mode);
    if (activeEngine.value?.setPaginationMode) {
      readerStore.setRendering(true);
      try {
        await activeEngine.value.setPaginationMode(mode);
      } finally {
        readerStore.setRendering(false);
      }
    }
  };

  const resetZoom = (): void => {
    activeEngine.value?.resetZoom?.();
  };

  const nextPage = async (): Promise<void> => {
    if (!activeEngine.value) return;
    clearSelection();
    resetZoom();
    readerStore.setRendering(true);
    try {
      await activeEngine.value.next();
      const location = activeEngine.value.getCurrentLocation();
      readerStore.updateLocation(location);
      if (readerStore.currentBook) {
        await libraryStore.updateProgress(
          readerStore.currentBook.id,
          location.locator,
          location.progressPercentage,
        );
        await queueProgress(
          readerStore.currentBook.id,
          location.locator,
          location.progressPercentage,
        );
      }
    } finally {
      readerStore.setRendering(false);
    }
  };

  const prevPage = async (): Promise<void> => {
    if (!activeEngine.value) return;
    clearSelection();
    resetZoom();
    readerStore.setRendering(true);
    try {
      await activeEngine.value.prev();
      const location = activeEngine.value.getCurrentLocation();
      readerStore.updateLocation(location);
      if (readerStore.currentBook) {
        await libraryStore.updateProgress(
          readerStore.currentBook.id,
          location.locator,
          location.progressPercentage,
        );
        await queueProgress(
          readerStore.currentBook.id,
          location.locator,
          location.progressPercentage,
        );
      }
    } finally {
      readerStore.setRendering(false);
    }
  };

  const goToLocator = async (locator: string): Promise<void> => {
    if (!activeEngine.value) return;
    clearSelection();
    resetZoom();
    readerStore.setRendering(true);
    try {
      await activeEngine.value.goTo(locator);
      const location = activeEngine.value.getCurrentLocation();
      readerStore.updateLocation(location);
      if (readerStore.currentBook) {
        await libraryStore.updateProgress(
          readerStore.currentBook.id,
          location.locator,
          location.progressPercentage,
        );
        await queueProgress(
          readerStore.currentBook.id,
          location.locator,
          location.progressPercentage,
        );
      }
    } finally {
      readerStore.setRendering(false);
    }
  };

  const goToPage = async (page: number): Promise<void> => {
    clearSelection();
    await readerStore.goToPage(page);
  };

  const applyTheme = (colors: { bg: string; text: string }): void => {
    activeEngine.value?.applyTheme?.(colors);
  };

  const applyFontSize = async (size: number): Promise<void> => {
    if (activeEngine.value?.setFontSize) {
      await activeEngine.value.setFontSize(size);
    }
  };

  const closeBook = (): void => {
    clearSelection();
    readerStore.registerPageNavigator(null);
    if (activeEngine.value) {
      activeEngine.value.destroy();
      activeEngine.value = null;
    }
  };

  return {
    activeEngine,
    openBook,
    nextPage,
    prevPage,
    goToLocator,
    goToPage,
    setPaginationMode,
    applyTheme,
    applyFontSize,
    resetZoom,
    closeBook,
  };
}
