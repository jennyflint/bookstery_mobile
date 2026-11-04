import ePub from 'epubjs';
import type { Book, Rendition, Location, Contents } from 'epubjs';
import { BaseEngine } from './BaseEngine';
import {
  SELECTION_SETTLE_MS,
  extractContextSentence,
  getWindowSelectionText,
  markSelectionActivity,
  shouldIgnoreReaderTap,
} from '../selection/SelectionGuard';
import type {
  EnginePageTapDetail,
  EngineSelectionDetail,
  HighlightRecord,
  ReaderLocation,
  ReaderPaginationMode,
  ZoomableContainerElement,
} from '../../types';

export class EpubEngine extends BaseEngine {
  protected override paginationMode: ReaderPaginationMode = 'scroll';
  private book: Book | null = null;
  private rendition: Rendition | null = null;
  private currentCfi: string = '';
  private currentPercentage: number = 0;
  private currentPage: number = 1;
  private totalPages: number = 1;
  private currentChapterTitle: string | null = null;
  private currentColors: { bg: string; text: string } | null = null;
  private currentFontSize: number = 18;
  private currentLineHeight: number = 1.6;
  public onIframeReady?: (iframe: HTMLIFrameElement) => void;
  public onSelectionChange?: (detail: EngineSelectionDetail) => void;
  public onPageTap?: (detail: EnginePageTapDetail) => void;
  public onCenterTap?: () => void;

  override setHighlights(
    highlights: HighlightRecord[],
    onHighlightClick?: (highlight: HighlightRecord) => void,
  ): void {
    super.setHighlights(highlights, onHighlightClick);
    this.restoreHighlights();
  }

  private restoreHighlights(): void {
    if (!this.rendition || !this.rendition.annotations) {
      return;
    }

    for (const hl of this.highlights) {
      if (hl.format === 'epub' && hl.locator) {
        try {
          this.rendition.annotations.add(
            'highlight',
            hl.locator,
            {},
            () => {
              this.onHighlightClickCallback?.(hl);
            },
            'hl-' + hl.color,
          );
        } catch {}
      }
    }
  }

  /** Returns the rendered epubjs contents (one per visible iframe). */
  private getContentsList(): Contents[] {
    if (!this.rendition) return [];
    try {
      const raw = (this.rendition as unknown as { getContents?: () => Contents[] | Contents }).getContents?.();
      if (!raw) return [];
      return Array.isArray(raw) ? raw : [raw];
    } catch {
      return [];
    }
  }

  /** Offset of the iframe hosting `contents` relative to the top-level viewport. */
  private getFrameOffset(contents: Contents): { left: number; top: number } {
    try {
      const frame = contents.window?.frameElement as HTMLElement | null;
      if (frame) {
        const rect = frame.getBoundingClientRect();
        return { left: rect.left, top: rect.top };
      }
    } catch {
      // Detached iframe.
    }
    return { left: 0, top: 0 };
  }

  /**
   * Reads the current native selection inside an EPUB iframe and reports it to the
   * reader through `onSelectionChange`. Empty selections are ignored on purpose:
   * selection state is sticky and only cleared explicitly by the reader.
   */
  private emitSelectionFromContents(contents: Contents, knownCfiRange?: string): void {
    const win = contents.window;
    const sel = win?.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (!sel || !text) return;

    markSelectionActivity();

    let cfiRange = knownCfiRange ?? '';
    let contextSentence: string | undefined;
    let rect: EngineSelectionDetail['rect'];
    try {
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (!cfiRange) {
          cfiRange = contents.cfiFromRange(range);
        }
        contextSentence = extractContextSentence(range, text);
        const r = range.getBoundingClientRect();
        const offset = this.getFrameOffset(contents);
        rect = {
          x: Math.round(offset.left + r.left + r.width / 2),
          y: Math.round(offset.top + r.top),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      }
    } catch {
      // CFI / geometry are optional: the text alone is enough to show the selection bar.
    }

    this.onSelectionChange?.({
      text,
      locator: cfiRange || undefined,
      contextSentence,
      rect,
    });
  }

  /** Wires iframe content hooks and rendition events (used on init and on flow change). */
  private attachRenditionListeners(): void {
    if (!this.rendition) return;

    this.rendition.hooks.content.register((contents: Contents) => {
      const doc = contents?.document;
      const win = contents?.window;
      if (!doc || !win) return;

      if (doc.body) {
        doc.body.style.userSelect = 'text';
        doc.body.style.webkitUserSelect = 'text';
      }

      // Ensure CSS inside the iframe permits native text selection.
      try {
        void contents.addStylesheetRules(
          {
            'body, p, div, span, a, li': {
              '-webkit-user-select': 'text !important',
              'user-select': 'text !important',
            },
          },
          'bookstery-selection',
        );
      } catch {
        // Stylesheet injection is best-effort.
      }

      const iframe = win.frameElement as HTMLIFrameElement | null;
      if (iframe && this.onIframeReady) {
        this.onIframeReady(iframe);
      }

      this.injectFontSizeToDoc(doc, this.currentFontSize);

      // Pinch/pan/double-tap zoom: iframe touches must reach the viewport's gesture controller.
      if (iframe) {
        doc.documentElement.style.touchAction = this.paginationMode === 'scroll' ? 'pan-y' : 'pan-x pan-y';
        (this.container as ZoomableContainerElement | null)?.__readerBindTouchSource?.(doc, iframe);
      }

      // Horizontal swipe gesture detection for paginated mode inside EPUB iframe
      let touchStartX = 0;
      let touchStartY = 0;
      let touchStartTime = 0;
      let isMultiTouch = false;

      doc.addEventListener(
        'touchstart',
        (e: TouchEvent) => {
          if (e.touches.length > 1) {
            isMultiTouch = true;
            return;
          }
          if (e.touches.length === 1 && e.touches[0]) {
            isMultiTouch = false;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
          }
        },
        { passive: true },
      );

      doc.addEventListener(
        'touchend',
        (e: TouchEvent) => {
          if (isMultiTouch || e.touches.length > 0) {
            return;
          }

          if (this.paginationMode === 'scroll') {
            return;
          }

          if (shouldIgnoreReaderTap(win) || getWindowSelectionText(win).length > 0) {
            return;
          }

          // Ignore swipe if viewport is zoomed in
          const viewport = this.container?.closest?.('[data-testid="reader-viewport"]');
          if (viewport) {
            const scaleAttr = viewport.getAttribute('data-scale');
            if (scaleAttr && parseFloat(scaleAttr) > 1.05) {
              return;
            }
          }

          if (e.changedTouches.length === 1 && e.changedTouches[0]) {
            const touch = e.changedTouches[0];
            const deltaX = touch.clientX - touchStartX;
            const deltaY = touch.clientY - touchStartY;
            const elapsed = Date.now() - touchStartTime;

            if (
              elapsed <= 500 &&
              Math.abs(deltaX) > 45 &&
              Math.abs(deltaX) > Math.abs(deltaY) * 1.5
            ) {
              if (deltaX < 0) {
                void this.next();
              } else {
                void this.prev();
              }
            }
          }
        },
        { passive: true },
      );

      // Primary selection trigger: the iframe's own `selectionchange` (never bubbles to the parent).
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      doc.addEventListener('selectionchange', () => {
        if (getWindowSelectionText(win).length > 0) {
          markSelectionActivity();
        }
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          this.emitSelectionFromContents(contents);
        }, SELECTION_SETTLE_MS);
      });

      // Refresh the tap lock when a gesture ends with text still selected.
      const onGestureEnd = (): void => {
        if (getWindowSelectionText(win).length > 0) {
          markSelectionActivity();
        }
      };
      doc.addEventListener('mouseup', onGestureEnd, true);
      doc.addEventListener('touchend', onGestureEnd, true);

      // Keyboard navigation fallback for volume & page keys inside EPUB iframe
      doc.addEventListener('keydown', (e: KeyboardEvent) => {
        if (
          [
            'AudioVolumeDown',
            'VolumeDown',
            'AudioVolumeUp',
            'VolumeUp',
            'PageDown',
            'PageUp',
          ].includes(e.key)
        ) {
          if (typeof window !== 'undefined') {
            const forwarded = new KeyboardEvent('keydown', {
              key: e.key,
              code: e.code,
              bubbles: true,
              cancelable: true,
            });
            window.dispatchEvent(forwarded);
            if (forwarded.defaultPrevented) {
              e.preventDefault();
            }
          }
        }
      });

      doc.addEventListener('click', (event: MouseEvent) => {
        // Lifting the finger after selecting text must never toggle UI or dismiss the selection.
        if (shouldIgnoreReaderTap(win)) {
          return;
        }
        const target = event.target as Element | null;
        if (target?.closest?.('a[href]')) {
          return;
        }
        const offset = this.getFrameOffset(contents);
        const clientX = event.clientX + offset.left;
        const width = window.innerWidth;
        const isCenter = clientX > width * 0.2 && clientX < width * 0.8;

        if (this.onPageTap) {
          this.onPageTap({ clientX, isCenter });
        } else if (isCenter) {
          this.onCenterTap?.();
        }
      });
    });

    // Secondary selection trigger: epubjs' own debounced `selected` event.
    this.rendition.on('selected', (cfiRange: string, contents: Contents) => {
      if (contents) {
        this.emitSelectionFromContents(contents, cfiRange);
      }
    });

    this.rendition.on('relocated', (location: Location) => {
      this.clearSelection();
      this.updatePaginationFromLocation(location);
    });

    this.rendition.on('rendered', () => {
      this.applyScrollContainerStyles();
      this.restoreHighlights();
      if (this.rendition?.themes?.fontSize) {
        try {
          this.rendition.themes.fontSize(`${this.currentFontSize}px`);
        } catch {}
      }
      this.injectFontSizeStyles(this.currentFontSize);
    });
  }

  private isValidEpubLocator(locator?: string): boolean {
    if (!locator || typeof locator !== 'string') return false;
    const trimmed = locator.trim();
    if (!trimmed) return false;
    // Pure numeric strings (e.g. from PDF page numbers) or FB2 paragraph IDs are invalid for EPUB
    if (/^\d+$/.test(trimmed) || trimmed.startsWith('fb2-p-')) {
      return false;
    }
    return true;
  }

  private updatePaginationFromLocation(location?: Location): void {
    if (location?.start?.cfi) {
      this.currentCfi = location.start.cfi;
    }

    if (location?.start?.href && this.book?.navigation) {
      try {
        const navItem = this.book.navigation.get(location.start.href);
        if (navItem && navItem.label) {
          this.currentChapterTitle = navItem.label.trim();
        }
      } catch {}
    }

    const totalLocations = this.book?.locations?.length?.() || 0;

    if (totalLocations > 0 && this.currentCfi) {
      const locIndex = (this.book?.locations?.locationFromCfi(this.currentCfi) as unknown) as number;
      this.totalPages = totalLocations;
      this.currentPage = typeof locIndex === 'number' && locIndex >= 0 ? Math.min(totalLocations, locIndex + 1) : 1;
      const pct = location?.start?.percentage ?? this.book?.locations?.percentageFromCfi(this.currentCfi) ?? 0;
      this.currentPercentage = Number((Math.min(1, Math.max(0, pct)) * 100).toFixed(2));
    } else if (location?.start?.displayed) {
      this.currentPage = Math.max(1, location.start.displayed.page || 1);
      this.totalPages = Math.max(1, location.start.displayed.total || 1);
      const displayedPct =
        location.start.percentage !== undefined && location.start.percentage !== null
          ? location.start.percentage
          : this.totalPages > 0
            ? this.currentPage / this.totalPages
            : 0;
      this.currentPercentage = Number((Math.min(1, Math.max(0, displayedPct)) * 100).toFixed(2));
    } else if (location?.start?.percentage !== undefined && location.start.percentage !== null) {
      this.currentPercentage = Number((Math.min(1, Math.max(0, location.start.percentage)) * 100).toFixed(2));
    }

    this.location = this.getCurrentLocation();
    this.onLocationChange?.(this.location);
  }

  async init(
    container: HTMLElement,
    data: Uint8Array | ArrayBuffer | string,
    initialLocator?: string,
  ): Promise<void> {
    this.container = container;
    this.container.innerHTML = '';

    this.currentCfi = '';
    this.currentPercentage = 0;
    this.currentPage = 1;
    this.totalPages = 1;
    this.currentChapterTitle = null;
    this.location = this.getCurrentLocation();

    const bookData = data instanceof Uint8Array ? data.buffer : data;
    this.book = ePub(bookData as string | ArrayBuffer);
    await this.book.ready;

    this.rendition =
      this.paginationMode === 'scroll'
        ? this.book.renderTo(container, {
            width: '100%',
            height: '100%',
            flow: 'scrolled',
            manager: 'continuous',
          })
        : this.book.renderTo(container, {
            width: '100%',
            height: '100%',
            flow: 'paginated',
            manager: 'default',
            spread: 'none',
          });

    if (this.currentColors) {
      this.applyTheme(this.currentColors);
    }

    this.attachRenditionListeners();

    try {
      await this.book.locations.generate(1024);
      if (this.rendition.location) {
        this.updatePaginationFromLocation(this.rendition.location);
      }
    } catch {
    }

    const validLocator = this.isValidEpubLocator(initialLocator) ? initialLocator : undefined;

    if (validLocator) {
      this.currentCfi = validLocator;
      await this.rendition.display(validLocator);
    } else {
      await this.rendition.display();
    }

    if (this.rendition.location) {
      this.updatePaginationFromLocation(this.rendition.location);
    }

    const zoomableContainer = this.container as ZoomableContainerElement | null;
    if (zoomableContainer) {
      zoomableContainer.__readerGetScrollContainer = () => {
        const epubContainer = this.container?.querySelector<HTMLElement>('.epub-container');
        if (epubContainer && epubContainer.clientHeight > 0 && epubContainer.scrollHeight > epubContainer.clientHeight) {
          return epubContainer;
        }
        const iframe = this.container?.querySelector<HTMLIFrameElement>('iframe');
        if (iframe) {
          try {
            const docEl = iframe.contentDocument?.scrollingElement as HTMLElement | null;
            if (docEl && docEl.clientHeight > 0 && docEl.scrollHeight > docEl.clientHeight) {
              return docEl;
            }
          } catch {}
        }
        return epubContainer || null;
      };
    }

    this.applyScrollContainerStyles();
  }

  async goTo(locator: string): Promise<void> {
    if (!this.rendition) {
      return;
    }
    if (locator) {
      const trimmed = locator.trim();
      if (/^\d+$/.test(trimmed)) {
        const pageNum = parseInt(trimmed, 10);
        if (this.book?.locations && this.book.locations.length()) {
          const locIndex = Math.max(0, pageNum - 1);
          const targetCfi = this.book.locations.cfiFromLocation(locIndex);
          if (targetCfi && typeof targetCfi === 'string' && targetCfi !== '-1') {
            await this.rendition.display(targetCfi);
            this.currentCfi = targetCfi;
            if (this.rendition.location) {
              this.updatePaginationFromLocation(this.rendition.location);
            } else {
              this.location = this.getCurrentLocation();
            }
            return;
          }
        }
      }

      if (this.isValidEpubLocator(locator)) {
        await this.rendition.display(locator);
        this.currentCfi = locator;
        if (this.rendition.location) {
          this.updatePaginationFromLocation(this.rendition.location);
        } else {
          this.location = this.getCurrentLocation();
        }
      }
    }
  }

  private applyScrollContainerStyles(): void {
    if (!this.container) return;
    const epubContainer = this.container.querySelector('.epub-container') as HTMLElement | null;
    if (epubContainer) {
      if (this.paginationMode === 'scroll') {
        epubContainer.style.setProperty('overflow-y', 'auto', 'important');
        epubContainer.style.setProperty('-webkit-overflow-scrolling', 'touch');
        epubContainer.style.height = '100%';
      } else {
        epubContainer.style.removeProperty('overflow-y');
        epubContainer.style.removeProperty('-webkit-overflow-scrolling');
      }
    }
  }

  async next(): Promise<void> {
    if (this.paginationMode === 'scroll') {
      const scrollEl = (this.container?.querySelector('.epub-container') || this.container) as HTMLElement | null;
      if (scrollEl && scrollEl.clientHeight > 0 && scrollEl.scrollHeight > scrollEl.clientHeight) {
        const canScrollDown = scrollEl.scrollTop + scrollEl.clientHeight < scrollEl.scrollHeight - 10;
        if (canScrollDown) {
          scrollEl.scrollBy({
            top: Math.round(scrollEl.clientHeight * 0.85),
            behavior: 'smooth',
          });
          return;
        }
      }
    }

    if (this.rendition) {
      await this.rendition.next();
    }
  }

  async prev(): Promise<void> {
    if (this.paginationMode === 'scroll') {
      const scrollEl = (this.container?.querySelector('.epub-container') || this.container) as HTMLElement | null;
      if (scrollEl && scrollEl.clientHeight > 0 && scrollEl.scrollHeight > scrollEl.clientHeight) {
        const canScrollUp = scrollEl.scrollTop > 10;
        if (canScrollUp) {
          scrollEl.scrollBy({
            top: -Math.round(scrollEl.clientHeight * 0.85),
            behavior: 'smooth',
          });
          return;
        }
      }
    }

    if (this.rendition) {
      await this.rendition.prev();
    }
  }

  getCurrentLocation(): ReaderLocation {
    return {
      locator: this.currentCfi || '',
      currentPage: this.currentPage,
      totalPages: this.totalPages,
      progressPercentage: this.currentPercentage,
      chapterTitle: this.currentChapterTitle || undefined,
    };
  }

  async setPaginationMode(mode: ReaderPaginationMode): Promise<void> {
    const normalized = mode === 'buttons' ? 'paginated' : mode;
    if (this.paginationMode === normalized) return;
    this.paginationMode = normalized;
    if (this.rendition && this.container && this.book) {
      const currentLoc = this.rendition.location?.start?.cfi || this.currentCfi;
      try {
        this.rendition.destroy();
      } catch {
      }
      this.rendition =
        this.paginationMode === 'scroll'
          ? this.book.renderTo(this.container, {
              width: '100%',
              height: '100%',
              flow: 'scrolled',
              manager: 'continuous',
            })
          : this.book.renderTo(this.container, {
              width: '100%',
              height: '100%',
              flow: 'paginated',
              manager: 'default',
              spread: 'none',
            });
      if (this.currentColors) {
        this.applyTheme(this.currentColors);
      }
      this.attachRenditionListeners();
      if (currentLoc && this.isValidEpubLocator(currentLoc)) {
        await this.rendition.display(currentLoc);
      } else {
        await this.rendition.display();
      }
      if (this.rendition.location) {
        this.updatePaginationFromLocation(this.rendition.location);
      }
      this.applyScrollContainerStyles();
    }
  }

  applyTheme(colors: { bg: string; text: string }): void {
    this.currentColors = colors;
    if (this.rendition) {
      this.rendition.themes.default({
        body: {
          'background-color': `${colors.bg} !important`,
          color: `${colors.text} !important`,
          'user-select': 'text !important',
          '-webkit-user-select': 'text !important',
        },
        'p, div, span, h1, h2, h3, h4, h5, h6, a, li, blockquote': {
          color: `${colors.text} !important`,
          'user-select': 'text !important',
          '-webkit-user-select': 'text !important',
        },
        '.hl-yellow': {
          'background-color': '#FEF08A !important',
          fill: '#FEF08A !important',
          'fill-opacity': '0.55 !important',
        },
        '.hl-green': {
          'background-color': '#C8E695 !important',
          fill: '#C8E695 !important',
          'fill-opacity': '0.55 !important',
        },
        '.hl-pink': {
          'background-color': '#FBCFE8 !important',
          fill: '#FBCFE8 !important',
          'fill-opacity': '0.55 !important',
        },
        '.hl-blue': {
          'background-color': '#BAE6FD !important',
          fill: '#BAE6FD !important',
          'fill-opacity': '0.55 !important',
        },
        '.hl-purple': {
          'background-color': '#E9D5FF !important',
          fill: '#E9D5FF !important',
          'fill-opacity': '0.55 !important',
        },
      });
      if (this.rendition.themes.fontSize) {
        try {
          this.rendition.themes.fontSize(`${this.currentFontSize}px`);
        } catch {}
      }
      this.injectFontSizeStyles(this.currentFontSize);
    }
  }

  private injectFontSizeToDoc(doc: Document, size: number): void {
    if (!doc || !doc.head) return;
    let style = doc.getElementById('bookstery-font-size-style') as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement('style');
      style.id = 'bookstery-font-size-style';
      doc.head.appendChild(style);
    }
    style.textContent = `
      body, p, div, span, li, a, blockquote {
        font-size: ${size}px !important;
        line-height: ${this.currentLineHeight} !important;
      }
      h1 { font-size: ${Math.round(size * 1.6)}px !important; }
      h2 { font-size: ${Math.round(size * 1.4)}px !important; }
      h3 { font-size: ${Math.round(size * 1.2)}px !important; }
      h4 { font-size: ${Math.round(size * 1.1)}px !important; }
      h5, h6 { font-size: ${size}px !important; }
    `;
  }

  private injectFontSizeStyles(size: number): void {
    if (!this.rendition) return;
    try {
      const contents = (this.rendition as any).getContents?.() || [];
      for (const content of contents) {
        if (content.document) {
          this.injectFontSizeToDoc(content.document, size);
        }
      }
    } catch (err) {
      console.warn('[EpubEngine] Failed to inject font size styles:', err);
    }
  }

  override setFontSize(size: number): void {
    this.currentFontSize = Math.min(Math.max(Math.round(size), 12), 36);
    if (this.rendition?.themes?.fontSize) {
      try {
        this.rendition.themes.fontSize(`${this.currentFontSize}px`);
      } catch {}
    }
    this.injectFontSizeStyles(this.currentFontSize);
  }

  /** Removes native text selection from every rendered EPUB iframe. */
  clearSelection(): void {
    try {
      const contents = (this.rendition as unknown as { getContents?: () => Contents[] | Contents })?.getContents?.();
      const list = Array.isArray(contents) ? contents : contents ? [contents] : [];
      list.forEach((c) => {
        try {
          c.window?.getSelection()?.removeAllRanges();
        } catch {}
      });
    } catch {}

    for (const content of this.getContentsList()) {
      try {
        content.window?.getSelection()?.removeAllRanges();
      } catch {
        // Iframe may already be detached.
      }
    }
  }

  getCurrentPageText(): string {
    if (!this.rendition) return '';
    try {
      const contents = (this.rendition as any).getContents?.() || [];
      const texts: string[] = [];
      for (const content of contents) {
        const body = content.document?.body;
        if (body) {
          const text = body.innerText || body.textContent || '';
          if (text.trim()) {
            texts.push(text.trim());
          }
        }
      }
      return texts.join('\n\n');
    } catch (err) {
      console.warn('[EpubEngine] Failed to extract page text:', err);
      return '';
    }
  }

  highlightTtsSentence(sentenceText: string, _sentenceIndex: number): void {
    this.clearTtsHighlight();
    if (!this.rendition || !sentenceText) return;

    try {
      const contents = (this.rendition as any).getContents?.() || [];
      const cleanTarget = sentenceText.trim().toLowerCase();
      const targetWords = cleanTarget
        .split(/\s+/)
        .map((w) => w.replace(/[.,!?;:«»""''()]/g, ''))
        .filter((w) => w.length > 2);

      for (const content of contents) {
        const doc: Document | undefined = content.document;
        if (!doc || !doc.body) continue;

        if (!doc.getElementById('tts-highlight-style')) {
          const style = doc.createElement('style');
          style.id = 'tts-highlight-style';
          style.textContent = `
            .tts-active-span {
              background-color: rgba(250, 204, 21, 0.35) !important;
              border-radius: 2px !important;
            }
          `;
          doc.head.appendChild(style);
        }

        const elements = Array.from(doc.body.querySelectorAll<HTMLElement>('p, span, div, li, h1, h2, h3, h4, h5, h6'));
        for (const el of elements) {
          const elText = (el.textContent || '').toLowerCase();
          if (elText.includes(cleanTarget) || (targetWords.length > 0 && targetWords.every((w) => elText.includes(w)))) {
            el.classList.add('tts-active-span');
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
          }
        }
      }
    } catch (err) {
      console.warn('[EpubEngine] Failed to highlight TTS sentence:', err);
    }
  }

  clearTtsHighlight(): void {
    if (!this.rendition) return;
    try {
      const contents = (this.rendition as any).getContents?.() || [];
      for (const content of contents) {
        const doc = content.document;
        if (doc) {
          const highlighted = doc.querySelectorAll('.tts-active-span');
          highlighted.forEach((el: Element) => el.classList.remove('tts-active-span'));
        }
      }
    } catch {}
  }

  override destroy(): void {
    this.clearTtsHighlight();
    if (this.rendition) {
      try {
        this.rendition.destroy();
      } catch {
      }
      this.rendition = null;
    }

    if (this.book) {
      try {
        this.book.destroy();
      } catch {
      }
      this.book = null;
    }

    this.currentCfi = '';
    this.currentPercentage = 0;
    this.currentPage = 1;
    this.totalPages = 1;
    this.currentChapterTitle = null;
    this.location = this.getCurrentLocation();

    if (this.container) {
      delete (this.container as ZoomableContainerElement).__readerGetScrollContainer;
    }

    super.destroy();
  }
}
