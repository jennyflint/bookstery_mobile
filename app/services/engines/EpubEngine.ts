import ePub from 'epubjs';
import type { Book, Rendition, Location } from 'epubjs';
import { BaseEngine } from './BaseEngine';
import type { ReaderLocation, ReaderPaginationMode } from '../../types';

export class EpubEngine extends BaseEngine {
  private book: Book | null = null;
  private rendition: Rendition | null = null;
  private currentCfi: string = '';
  private currentPercentage: number = 0;
  private currentColors: { bg: string; text: string } | null = null;

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
      this.rendition.on('relocated', (location: Location) => {
        if (location && location.start) {
          this.currentCfi = location.start.cfi;
          if (location.start.percentage !== undefined) {
            this.currentPercentage = Number((location.start.percentage * 100).toFixed(2));
          }
          this.location = this.getCurrentLocation();
          this.onLocationChange?.(this.location);
        }
      });
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
        },
        'p, div, span, h1, h2, h3, h4, h5, h6, a, li, blockquote': {
          color: `${colors.text} !important`,
        },
      });
    }
  }

  destroy(): void {
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
