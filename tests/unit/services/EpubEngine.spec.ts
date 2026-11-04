import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import ePub from 'epubjs';
import { EpubEngine } from '~/services/engines/EpubEngine';
import { useReaderStore } from '~/stores/readerStore';
import type { BookRecord } from '~/types';

vi.mock('epubjs', () => {
  return {
    default: vi.fn(),
  };
});

describe('EpubEngine Pagination & Location Management', () => {
  let engine: EpubEngine;
  let container: HTMLElement;
  let mockBook: any;
  let mockRendition: any;
  let eventListeners: Record<string, ((...args: any[]) => void)[]>;
  let contentHooks: ((contents: any) => void)[];

  beforeEach(() => {
    setActivePinia(createPinia());
    container = document.createElement('div');
    document.body.appendChild(container);
    eventListeners = {};
    contentHooks = [];

    mockRendition = {
      display: vi.fn().mockResolvedValue(undefined),
      next: vi.fn().mockResolvedValue(undefined),
      prev: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      themes: {
        default: vi.fn(),
        fontSize: vi.fn(),
      },
      hooks: {
        content: {
          register: vi.fn((cb: (contents: any) => void) => {
            contentHooks.push(cb);
          }),
        },
      },
      on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        if (!eventListeners[event]) {
          eventListeners[event] = [];
        }
        eventListeners[event].push(cb);
      }),
      location: null,
    };

    mockBook = {
      ready: Promise.resolve(),
      renderTo: vi.fn().mockReturnValue(mockRendition),
      destroy: vi.fn(),
      navigation: {
        get: vi.fn((href: string) => {
          if (href.includes('ch1')) return { label: 'Chapter 1: The Beginning' };
          return null;
        }),
      },
      locations: {
        generate: vi.fn().mockResolvedValue(['loc0', 'loc1', 'loc2', 'loc3', 'loc4']),
        length: vi.fn().mockReturnValue(5),
        locationFromCfi: vi.fn((cfi: string) => {
          if (cfi.includes('p2')) return 1; // page 2 (0-indexed 1)
          if (cfi.includes('p3')) return 2; // page 3 (0-indexed 2)
          return 0; // page 1
        }),
        percentageFromCfi: vi.fn((cfi: string) => {
          if (cfi.includes('p2')) return 0.25;
          if (cfi.includes('p3')) return 0.5;
          return 0;
        }),
        cfiFromLocation: vi.fn((loc: number) => `epubcfi(/6/2[ch1]!/4/${(loc + 1) * 2})`),
      },
    };

    vi.mocked(ePub).mockReturnValue(mockBook);
    engine = new EpubEngine();
  });

  it('should initialize and emit accurate pagination data via getCurrentLocation', async () => {
    await engine.init(container, 'fake-epub-data');

    const initialLocation = engine.getCurrentLocation();
    expect(initialLocation.currentPage).toBe(1);
    expect(initialLocation.totalPages).toBe(1);
    expect(initialLocation.progressPercentage).toBe(0);

    // Simulate epubjs relocation event with valid CFI
    const relocatedLocation = {
      start: {
        cfi: 'epubcfi(/6/2[ch1]!/4/p2)',
        href: 'ch1.xhtml',
        percentage: 0.25,
      },
    };
    mockRendition.location = relocatedLocation;

    let emittedLocation: any = null;
    engine.onLocationChange = (loc) => {
      emittedLocation = loc;
    };

    // Trigger the registered relocated listener
    eventListeners['relocated']?.forEach((cb) => cb(relocatedLocation));

    expect(emittedLocation).not.toBeNull();
    expect(emittedLocation.currentPage).toBe(2);
    expect(emittedLocation.totalPages).toBe(5);
    expect(emittedLocation.progressPercentage).toBe(25);
    expect(emittedLocation.locator).toBe('epubcfi(/6/2[ch1]!/4/p2)');
    expect(emittedLocation.chapterTitle).toBe('Chapter 1: The Beginning');

    const currentLoc = engine.getCurrentLocation();
    expect(currentLoc.currentPage).toBe(2);
    expect(currentLoc.totalPages).toBe(5);
    expect(currentLoc.progressPercentage).toBe(25);
  });

  it('should fallback to location.start.displayed when locations are not generated', async () => {
    // Return 0 for locations length (e.g. before generation completes)
    mockBook.locations.length.mockReturnValue(0);

    await engine.init(container, 'fake-epub-data');

    const displayedLocation = {
      start: {
        cfi: 'epubcfi(/6/4[intro]!/2/1)',
        href: 'intro.xhtml',
        displayed: {
          page: 3,
          total: 10,
        },
      },
    };

    let emittedLocation: any = null;
    engine.onLocationChange = (loc) => {
      emittedLocation = loc;
    };

    eventListeners['relocated']?.forEach((cb) => cb(displayedLocation));

    expect(emittedLocation).not.toBeNull();
    expect(emittedLocation.currentPage).toBe(3);
    expect(emittedLocation.totalPages).toBe(10);
    expect(emittedLocation.progressPercentage).toBe(30);
  });

  it('should ignore invalid initial locators like numeric strings and fb2 paragraph IDs', async () => {
    // Numeric string from a previous PDF session (e.g. "12")
    await engine.init(container, 'fake-epub-data', '12');
    expect(mockRendition.display).toHaveBeenCalledWith(); // called with undefined / no args

    // FB2 paragraph id from a previous FB2 session
    await engine.init(container, 'fake-epub-data', 'fb2-p-4');
    expect(mockRendition.display).toHaveBeenCalledWith();

    // Valid CFI should be passed through
    await engine.init(container, 'fake-epub-data', 'epubcfi(/6/2[ch1]!/4/10)');
    expect(mockRendition.display).toHaveBeenCalledWith('epubcfi(/6/2[ch1]!/4/10)');
  });

  it('should support numeric page navigation in goTo by converting via cfiFromLocation', async () => {
    await engine.init(container, 'fake-epub-data');

    await engine.goTo('3');
    // Page 3 corresponds to 0-indexed location 2
    expect(mockBook.locations.cfiFromLocation).toHaveBeenCalledWith(2);
    expect(mockRendition.display).toHaveBeenCalledWith('epubcfi(/6/2[ch1]!/4/6)');
  });

  it('should reset state on init and destroy', async () => {
    await engine.init(container, 'fake-epub-data');

    // Simulate relocation
    const relocatedLocation = {
      start: {
        cfi: 'epubcfi(/6/2[ch1]!/4/p3)',
        href: 'ch1.xhtml',
        percentage: 0.5,
      },
    };
    eventListeners['relocated']?.forEach((cb) => cb(relocatedLocation));

    expect(engine.getCurrentLocation().currentPage).toBe(3);

    // Destroy
    engine.destroy();
    const destroyedLocation = engine.getCurrentLocation();
    expect(destroyedLocation.currentPage).toBe(1);
    expect(destroyedLocation.totalPages).toBe(1);
    expect(destroyedLocation.locator).toBe('');
    expect(destroyedLocation.progressPercentage).toBe(0);
  });

  it('should prevent stale page counts in readerStore when switching from PDF to EPUB', () => {
    const readerStore = useReaderStore();

    // 1. User was reading a PDF book with 250 pages, currently at page 42
    const mockPdf: BookRecord = {
      id: 'pdf-1',
      title: 'Large Document',
      author: 'Author',
      format: 'pdf',
      file_path: 'doc.pdf',
      cover_path: null,
      locator: '42',
      progress_percentage: 16.8,
      total_items: 250,
      last_read_at: Date.now(),
      updated_at: Date.now(),
    };

    readerStore.setBook(mockPdf);
    expect(readerStore.currentPage).toBe(42);
    expect(readerStore.totalPages).toBe(250);

    // 2. User switches to an EPUB book (which has no page count yet or spine items)
    const mockEpub: BookRecord = {
      id: 'epub-1',
      title: 'EPUB Novel',
      author: 'Writer',
      format: 'epub',
      file_path: 'novel.epub',
      cover_path: null,
      locator: '',
      progress_percentage: 0,
      total_items: 0,
      last_read_at: Date.now(),
      updated_at: Date.now(),
    };

    readerStore.setBook(mockEpub);

    // Pagination MUST be reset and not retain PDF page 42 of 250
    expect(readerStore.currentPage).toBe(1);
    expect(readerStore.totalPages).toBe(1);
    expect(readerStore.locator).toBe('');
    expect(readerStore.progressPercentage).toBe(0);

    // 3. EPUB engine loads and emits accurate location
    readerStore.updateLocation({
      locator: 'epubcfi(/6/2[title]!/4/2)',
      currentPage: 1,
      totalPages: 120,
      progressPercentage: 0.83,
    });

    expect(readerStore.currentPage).toBe(1);
    expect(readerStore.totalPages).toBe(120);
    expect(readerStore.progressPercentage).toBe(0.83);
  });

  describe('Pagination Modes (Swipe/Paginated vs. Vertical Scroll)', () => {
    it('defaults to scroll paginationMode upon initialization', async () => {
      await engine.init(container, 'fake-epub-data');

      expect(mockBook.renderTo).toHaveBeenCalledWith(container, {
        width: '100%',
        height: '100%',
        flow: 'scrolled',
        manager: 'continuous',
      });
    });

    it('configures renderTo with paginated options in paginated mode', async () => {
      await engine.setPaginationMode('paginated');
      await engine.init(container, 'fake-epub-data');

      expect(mockBook.renderTo).toHaveBeenCalledWith(container, {
        width: '100%',
        height: '100%',
        flow: 'paginated',
        manager: 'default',
        spread: 'none',
      });
    });

    it('configures renderTo with continuous scrolled options in scroll mode', async () => {
      await engine.setPaginationMode('scroll');
      await engine.init(container, 'fake-epub-data');

      expect(mockBook.renderTo).toHaveBeenCalledWith(container, {
        width: '100%',
        height: '100%',
        flow: 'scrolled',
        manager: 'continuous',
      });
    });

    it('dynamically switches paginationMode and preserves reading position', async () => {
      await engine.setPaginationMode('paginated');
      await engine.init(container, 'fake-epub-data', 'epubcfi(/6/2[ch1]!/4/10)');
      expect(engine.getCurrentLocation().locator).toBe('epubcfi(/6/2[ch1]!/4/10)');

      // Switch to scroll mode
      mockBook.renderTo.mockClear();
      mockRendition.destroy.mockClear();
      mockRendition.display.mockClear();

      await engine.setPaginationMode('scroll');

      expect(mockRendition.destroy).toHaveBeenCalled();
      expect(mockBook.renderTo).toHaveBeenCalledWith(container, {
        width: '100%',
        height: '100%',
        flow: 'scrolled',
        manager: 'continuous',
      });
      expect(mockRendition.display).toHaveBeenCalledWith('epubcfi(/6/2[ch1]!/4/10)');
    });

    it('scrolls container screen-by-screen in scroll mode instead of jumping chapters', async () => {
      await engine.setPaginationMode('scroll');
      await engine.init(container, 'fake-epub-data');

      const epubContainer = document.createElement('div');
      epubContainer.className = 'epub-container';
      Object.defineProperty(epubContainer, 'clientHeight', { value: 800, writable: true });
      Object.defineProperty(epubContainer, 'scrollHeight', { value: 3000, writable: true });
      Object.defineProperty(epubContainer, 'scrollTop', { value: 100, writable: true });
      const scrollBySpy = vi.fn();
      epubContainer.scrollBy = scrollBySpy;
      container.appendChild(epubContainer);

      // next() when not at bottom
      await engine.next();
      expect(scrollBySpy).toHaveBeenCalledWith({
        top: Math.round(800 * 0.85),
        behavior: 'smooth',
      });
      expect(mockRendition.next).not.toHaveBeenCalled();

      // prev() when not at top
      scrollBySpy.mockClear();
      await engine.prev();
      expect(scrollBySpy).toHaveBeenCalledWith({
        top: -Math.round(800 * 0.85),
        behavior: 'smooth',
      });
      expect(mockRendition.prev).not.toHaveBeenCalled();

      // next() when at bottom boundary
      scrollBySpy.mockClear();
      epubContainer.scrollTop = 2200; // 2200 + 800 = 3000 >= 3000 - 10
      await engine.next();
      expect(mockRendition.next).toHaveBeenCalled();

      // prev() when at top boundary
      epubContainer.scrollTop = 5; // <= 10
      await engine.prev();
      expect(mockRendition.prev).toHaveBeenCalled();
    });

    it('directly calls rendition next and prev in paginated mode', async () => {
      await engine.setPaginationMode('paginated');
      await engine.init(container, 'fake-epub-data');

      await engine.next();
      expect(mockRendition.next).toHaveBeenCalledTimes(1);

      await engine.prev();
      expect(mockRendition.prev).toHaveBeenCalledTimes(1);
    });

    it('detects horizontal swipe gestures inside iframe in paginated mode', async () => {
      await engine.setPaginationMode('paginated');
      await engine.init(container, 'fake-epub-data');

      const nextSpy = vi.spyOn(engine, 'next').mockResolvedValue(undefined);
      const prevSpy = vi.spyOn(engine, 'prev').mockResolvedValue(undefined);

      const fakeDoc = document.implementation.createHTMLDocument();
      const fakeIframe = document.createElement('iframe');
      container.appendChild(fakeIframe);
      const fakeWin = {
        frameElement: fakeIframe,
        getSelection: () => null,
      };

      const mockContents = {
        document: fakeDoc,
        window: fakeWin,
        addStylesheetRules: vi.fn(),
      };

      // Trigger content hook
      contentHooks.forEach((cb) => cb(mockContents));

      // 1. Swipe Left (Next)
      const touchStartEvent = new TouchEvent('touchstart', {
        touches: [{ clientX: 200, clientY: 100 } as any],
      });
      fakeDoc.dispatchEvent(touchStartEvent);

      const touchEndEvent = new TouchEvent('touchend', {
        changedTouches: [{ clientX: 120, clientY: 102 } as any],
      });
      fakeDoc.dispatchEvent(touchEndEvent);

      expect(nextSpy).toHaveBeenCalled();
      expect(prevSpy).not.toHaveBeenCalled();

      // 2. Swipe Right (Prev)
      nextSpy.mockClear();
      prevSpy.mockClear();

      const touchStartRight = new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 100 } as any],
      });
      fakeDoc.dispatchEvent(touchStartRight);

      const touchEndRight = new TouchEvent('touchend', {
        changedTouches: [{ clientX: 180, clientY: 98 } as any],
      });
      fakeDoc.dispatchEvent(touchEndRight);

      expect(prevSpy).toHaveBeenCalled();
      expect(nextSpy).not.toHaveBeenCalled();
    });

    it('does not trigger swipe page turn in scroll mode', async () => {
      await engine.setPaginationMode('scroll');
      await engine.init(container, 'fake-epub-data');

      const nextSpy = vi.spyOn(engine, 'next').mockResolvedValue(undefined);
      const prevSpy = vi.spyOn(engine, 'prev').mockResolvedValue(undefined);

      const fakeDoc = document.implementation.createHTMLDocument();
      const fakeIframe = document.createElement('iframe');
      container.appendChild(fakeIframe);
      const fakeWin = {
        frameElement: fakeIframe,
        getSelection: () => null,
      };

      const mockContents = {
        document: fakeDoc,
        window: fakeWin,
        addStylesheetRules: vi.fn(),
      };

      contentHooks.forEach((cb) => cb(mockContents));

      const touchStartEvent = new TouchEvent('touchstart', {
        touches: [{ clientX: 200, clientY: 100 } as any],
      });
      fakeDoc.dispatchEvent(touchStartEvent);

      const touchEndEvent = new TouchEvent('touchend', {
        changedTouches: [{ clientX: 100, clientY: 100 } as any],
      });
      fakeDoc.dispatchEvent(touchEndEvent);

      expect(nextSpy).not.toHaveBeenCalled();
      expect(prevSpy).not.toHaveBeenCalled();
    });

    it('sets pan-y touchAction on doc and touch scroll styling on epub-container in scroll mode', async () => {
      await engine.setPaginationMode('scroll');
      await engine.init(container, 'fake-epub-data');

      const fakeDoc = document.implementation.createHTMLDocument();
      const fakeIframe = document.createElement('iframe');
      container.appendChild(fakeIframe);
      const fakeWin = {
        frameElement: fakeIframe,
        getSelection: () => null,
      };

      const mockContents = {
        document: fakeDoc,
        window: fakeWin,
        addStylesheetRules: vi.fn(),
      };

      contentHooks.forEach((cb) => cb(mockContents));

      expect(fakeDoc.documentElement.style.touchAction).toBe('pan-y');
    });
  });
});
