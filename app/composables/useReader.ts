import { ref } from 'vue';
import { PdfEngine } from '../services/engines/PdfEngine';
import { EpubEngine } from '../services/engines/EpubEngine';
import { Fb2Engine } from '../services/engines/Fb2Engine';
import type { ReaderEngineInterface, BookRecord } from '../types';
import { useReaderStore } from '../stores/readerStore';
import { useBookSync } from './useBookSync';

export function useReader() {
  const activeEngine = ref<ReaderEngineInterface | null>(null);
  const readerStore = useReaderStore();
  const { queueProgress } = useBookSync();

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
      const engine = createEngine(book.format);
      activeEngine.value = engine;
      await engine.init(container, fileData);

      if (book.locator) {
        await engine.goTo(book.locator);
      }

      const location = engine.getCurrentLocation();
      readerStore.updateLocation(location);
    } finally {
      readerStore.setRendering(false);
    }
  };

  const nextPage = async (): Promise<void> => {
    if (!activeEngine.value) return;
    readerStore.setRendering(true);
    try {
      await activeEngine.value.next();
      const location = activeEngine.value.getCurrentLocation();
      readerStore.updateLocation(location);
      if (readerStore.currentBook) {
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
    readerStore.setRendering(true);
    try {
      await activeEngine.value.prev();
      const location = activeEngine.value.getCurrentLocation();
      readerStore.updateLocation(location);
      if (readerStore.currentBook) {
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
    readerStore.setRendering(true);
    try {
      await activeEngine.value.goTo(locator);
      const location = activeEngine.value.getCurrentLocation();
      readerStore.updateLocation(location);
      if (readerStore.currentBook) {
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

  const closeBook = (): void => {
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
    closeBook,
  };
}
