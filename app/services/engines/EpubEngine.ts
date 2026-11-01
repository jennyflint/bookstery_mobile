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
} from '../../types';

export class EpubEngine extends BaseEngine {
  private book: Book | null = null;
  private rendition: Rendition | null = null;
  private currentCfi: string = '';
  private currentPercentage: number = 0;
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
      if (location && location.start) {
        this.currentCfi = location.start.cfi;
        if (location.start.percentage !== undefined) {
          this.currentPercentage = Number((location.start.percentage * 100).toFixed(2));
        } else if (this.book?.locations && this.book.locations.length()) {
          const calcPercent = this.book.locations.percentageFromCfi(this.currentCfi);
          this.currentPercentage = Number(((calcPercent || 0) * 100).toFixed(2));
        }
        this.location = this.getCurrentLocation();
        this.onLocationChange?.(this.location);
      }
    });

    this.rendition.on('rendered', () => {
      this.restoreHighlights();
      if (this.rendition?.themes?.fontSize) {
        try {
          this.rendition.themes.fontSize(`${this.currentFontSize}px`);
        } catch {}
      }
      this.injectFontSizeStyles(this.currentFontSize);
    });
  }

  async init(
    container: HTMLElement,
    data: Uint8Array | ArrayBuffer | string,
    initialLocator?: string,
  ): Promise<void> {
    this.container = container;
    this.container.innerHTML = '';

    const bookData = data instanceof Uint8Array ? data.buffer : data;
    this.book = ePub(bookData as string | ArrayBuffer);
    await this.book.ready;

    this.rendition = this.book.renderTo(container, {
      width: '100%',
      height: '100%',
      flow: this.paginationMode === 'scroll' ? 'scrolled-doc' : 'paginated',
      spread: 'none',
    });

    if (this.currentColors) {
      this.applyTheme(this.currentColors);
    }

    this.attachRenditionListeners();

    try {
      await this.book.locations.generate(1024);
    } catch {
    }

    if (initialLocator) {
      this.currentCfi = initialLocator;
      await this.rendition.display(initialLocator);
    } else {
      await this.rendition.display();
    }
  }

  async goTo(locator: string): Promise<void> {
    if (!this.rendition) {
      return;
    }
    if (locator) {
      await this.rendition.display(locator);
      this.currentCfi = locator;
      this.location = this.getCurrentLocation();
    }
  }

  async next(): Promise<void> {
    if (this.rendition) {
      await this.rendition.next();
    }
  }

  async prev(): Promise<void> {
    if (this.rendition) {
      await this.rendition.prev();
    }
  }

  getCurrentLocation(): ReaderLocation {
    return {
      locator: this.currentCfi || '',
      progressPercentage: this.currentPercentage,
    };
  }

  async setPaginationMode(mode: ReaderPaginationMode): Promise<void> {
    if (this.paginationMode === mode) return;
    this.paginationMode = mode;
    if (this.rendition && this.container && this.book) {
      const currentLoc = this.currentCfi;
      try {
        this.rendition.destroy();
      } catch {
      }
      this.rendition = this.book.renderTo(this.container, {
        width: '100%',
        height: '100%',
        flow: mode === 'scroll' ? 'scrolled-doc' : 'paginated',
        spread: 'none',
      });
      if (this.currentColors) {
        this.applyTheme(this.currentColors);
      }
      this.attachRenditionListeners();
      if (currentLoc) {
        await this.rendition.display(currentLoc);
      } else {
        await this.rendition.display();
      }
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

    super.destroy();
  }
}
