import type {
  EnginePageTapDetail,
  EngineSelectionDetail,
  HighlightRecord,
  ReaderLocation,
  ReaderPaginationMode,
  ZoomableContainerElement,
} from '~/types';
import type { DjVuDocumentProxy, DjVuPageProxy, DjVuTextZone } from '~/types/djvu';
import { BaseEngine } from './BaseEngine';
import { isDjVuBuffer, parseDjVuDocument } from './DjvuParser';

const MAX_CANVAS_PIXELS = 16_000_000;
const CACHE_WINDOW_RADIUS = 5;

function isDarkColor(hexOrRgb: string): boolean {
  if (!hexOrRgb) return false;
  const hex = hexOrRgb.trim();
  if (hex.startsWith('#')) {
    const raw = hex.slice(1);
    const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
    const r = parseInt(full.slice(0, 2), 16) || 0;
    const g = parseInt(full.slice(2, 4), 16) || 0;
    const b = parseInt(full.slice(4, 6), 16) || 0;
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  }
  return false;
}

interface PageCacheEntry {
  canvas: HTMLCanvasElement;
  textLayer: HTMLElement;
  pageWidth: number;
  pageHeight: number;
}

export class DjvuEngine extends BaseEngine {
  private doc: DjVuDocumentProxy | null = null;
  private totalPagesCount: number = 0;
  private currentPageNumber: number = 1;
  private scrollContainer: HTMLElement | null = null;
  private buttonsContainer: HTMLElement | null = null;
  private pageObserver: IntersectionObserver | null = null;
  private renderedPages = new Set<number>();
  private pageCache = new Map<number, PageCacheEntry>();
  private pageTextMap = new Map<number, string>();
  private currentColors: { bg: string; text: string } | null = null;
  private zoomScale: number = 1.0;
  private resizeObserver: ResizeObserver | null = null;
  private isProgrammaticScroll: boolean = false;
  private pageSizes: Array<{ width: number; height: number; dpi: number }> = [];

  public onSelectionChange?: (detail: EngineSelectionDetail) => void;
  public onPageTap?: (detail: EnginePageTapDetail) => void;

  private getClampedDpr(): number {
    const raw = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return Math.min(raw, 2.5);
  }

  async init(
    container: HTMLElement,
    data: Uint8Array | ArrayBuffer | string | Blob,
    initialLocator?: string,
  ): Promise<void> {
    this.container = container;
    container.innerHTML = '';

    const rawBytes = await this.normalizeData(data);
    if (!isDjVuBuffer(rawBytes)) {
      throw new Error('Invalid or corrupted DjVu file');
    }

    this.doc = await parseDjVuDocument(rawBytes);
    this.totalPagesCount = Math.max(1, this.doc.getPagesQuantity());
    this.pageSizes = this.doc.getPagesSizes?.() || [];

    const parsedLoc = parseInt(initialLocator || '1', 10);
    this.currentPageNumber = !isNaN(parsedLoc) && parsedLoc >= 1 && parsedLoc <= this.totalPagesCount
      ? parsedLoc
      : 1;

    this.bindZoomableInterface();

    if (this.paginationMode === 'scroll') {
      await this.initScrollMode();
    } else {
      await this.initButtonsMode();
    }

    this.updateLocation();
  }

  private async normalizeData(data: Uint8Array | ArrayBuffer | string | Blob): Promise<Uint8Array> {
    if (data instanceof Uint8Array) {
      return data;
    }
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      const buffer = await data.arrayBuffer();
      return new Uint8Array(buffer);
    }
    if (typeof data === 'string') {
      const resp = await fetch(data);
      const buffer = await resp.arrayBuffer();
      return new Uint8Array(buffer);
    }
    throw new Error('Unsupported data format provided to DjvuEngine');
  }

  private bindZoomableInterface(): void {
    if (!this.container) return;
    const zoomable = this.container as ZoomableContainerElement;
    zoomable.__readerSetZoom = (scale: number) => this.setZoom(scale);
    zoomable.__readerResetZoom = () => this.resetZoom();
    zoomable.__readerCanRenderZoom = () => this.paginationMode !== 'scroll';
    zoomable.__readerGetContentSize = () => this.getContentSize();
    zoomable.__readerGetScrollContainer = () => {
      if (this.paginationMode === 'scroll') {
        return this.scrollContainer;
      }
      return this.buttonsContainer;
    };
  }

  private unbindZoomableInterface(): void {
    if (!this.container) return;
    const zoomable = this.container as ZoomableContainerElement;
    delete zoomable.__readerSetZoom;
    delete zoomable.__readerResetZoom;
    delete zoomable.__readerCanRenderZoom;
    delete zoomable.__readerGetContentSize;
    delete zoomable.__readerGetScrollContainer;
  }

  private getContentSize(): { width: number; height: number } | null {
    const size = this.pageSizes[this.currentPageNumber - 1];
    if (size && size.width > 0 && size.height > 0) {
      return { width: size.width, height: size.height };
    }
    return null;
  }

  private async initScrollMode(): Promise<void> {
    if (!this.container) return;
    this.container.innerHTML = '';

    const scroll = document.createElement('div');
    scroll.className = 'djvu-scroll-container h-full w-full overflow-y-auto px-2 py-4 select-text';
    if (this.currentColors) {
      scroll.style.backgroundColor = this.currentColors.bg;
    }
    this.scrollContainer = scroll;
    this.container.appendChild(scroll);

    const containerWidth = Math.max(280, scroll.clientWidth || 360);

    for (let pageNum = 1; pageNum <= this.totalPagesCount; pageNum++) {
      const slot = document.createElement('div');
      slot.className = 'djvu-page-slot relative mx-auto mb-6 shadow-md rounded overflow-hidden flex items-center justify-center';
      slot.dataset.pageNumber = String(pageNum);

      const size = this.pageSizes[pageNum - 1];
      const aspect = size && size.height > 0 && size.width > 0 ? size.height / size.width : 1.414;
      const slotWidth = Math.min(containerWidth - 16, size?.width || 720);
      const slotHeight = Math.round(slotWidth * aspect);

      slot.style.width = `${slotWidth}px`;
      slot.style.minHeight = `${slotHeight}px`;
      slot.style.aspectRatio = `${slotWidth} / ${slotHeight}`;
      if (this.currentColors) {
        slot.style.backgroundColor = this.currentColors.bg;
      }

      const placeholder = document.createElement('div');
      placeholder.className = 'djvu-loading-placeholder text-xs text-neutral-400 select-none';
      placeholder.textContent = `Page ${pageNum}`;
      slot.appendChild(placeholder);

      scroll.appendChild(slot);
    }

    this.setupIntersectionObserver();
    this.scrollContainer.addEventListener('scroll', this.handleScroll, { passive: true });

    if (this.currentPageNumber > 1) {
      setTimeout(() => {
        this.scrollToPage(this.currentPageNumber, 'auto');
      }, 50);
    }
  }

  private setupIntersectionObserver(): void {
    if (typeof IntersectionObserver === 'undefined' || !this.scrollContainer) return;

    this.pageObserver?.disconnect();
    this.pageObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const slot = entry.target as HTMLElement;
          const pageNum = parseInt(slot.dataset.pageNumber || '1', 10);
          if (entry.isIntersecting) {
            void this.renderPageSlot(pageNum, slot);
          }
        });
      },
      {
        root: this.scrollContainer,
        rootMargin: '600px 0px 600px 0px',
        threshold: 0.01,
      },
    );

    const slots = this.scrollContainer.querySelectorAll<HTMLElement>('.djvu-page-slot');
    slots.forEach((slot) => this.pageObserver?.observe(slot));
  }

  private handleScroll = (): void => {
    if (!this.scrollContainer || this.isProgrammaticScroll) return;

    const slots = Array.from(this.scrollContainer.querySelectorAll<HTMLElement>('.djvu-page-slot'));
    const containerTop = this.scrollContainer.scrollTop;
    const containerMid = containerTop + this.scrollContainer.clientHeight / 2;

    let closestPage = this.currentPageNumber;
    let minDistance = Infinity;

    for (const slot of slots) {
      const slotTop = slot.offsetTop;
      const slotMid = slotTop + slot.offsetHeight / 2;
      const dist = Math.abs(containerMid - slotMid);
      if (dist < minDistance) {
        minDistance = dist;
        closestPage = parseInt(slot.dataset.pageNumber || '1', 10);
      }
    }

    if (closestPage !== this.currentPageNumber) {
      this.currentPageNumber = closestPage;
      this.evictOutsideWindow(this.currentPageNumber);
      this.updateLocation();
    }
  };

  private async renderPageSlot(pageNum: number, slot: HTMLElement): Promise<void> {
    if (this.renderedPages.has(pageNum)) return;
    this.renderedPages.add(pageNum);

    try {
      const pageProxy = await this.doc?.getPage(pageNum);
      if (!pageProxy) return;

      const width = pageProxy.getWidth();
      const height = pageProxy.getHeight();
      if (width <= 0 || height <= 0) return;

      const containerWidth = Math.max(280, this.scrollContainer?.clientWidth || 360) - 24;
      const cssWidth = Math.min(containerWidth, width);
      const scale = cssWidth / width;
      const cssHeight = Math.round(height * scale);

      slot.style.width = `${cssWidth}px`;
      slot.style.minHeight = `${cssHeight}px`;
      slot.style.height = `${cssHeight}px`;

      const dpr = this.getClampedDpr();
      let canvasWidth = Math.round(cssWidth * dpr);
      let canvasHeight = Math.round(cssHeight * dpr);
      if (canvasWidth * canvasHeight > MAX_CANVAS_PIXELS) {
        const factor = Math.sqrt(MAX_CANVAS_PIXELS / (canvasWidth * canvasHeight));
        canvasWidth = Math.floor(canvasWidth * factor);
        canvasHeight = Math.floor(canvasHeight * factor);
      }

      const canvas = document.createElement('canvas');
      canvas.className = 'djvu-page-canvas block';
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        const imgData = pageProxy.getImageData(true);
        if (imgData.width === canvasWidth && imgData.height === canvasHeight) {
          ctx.putImageData(imgData, 0, 0);
        } else {
          const off = document.createElement('canvas');
          off.width = imgData.width;
          off.height = imgData.height;
          const offCtx = off.getContext('2d');
          if (offCtx) {
            offCtx.putImageData(imgData, 0, 0);
            ctx.drawImage(off, 0, 0, canvasWidth, canvasHeight);
            off.width = 0;
            off.height = 0;
          }
        }
      }

      this.applyCanvasFilter(canvas);

      // OCR Text Layer
      const textLayer = document.createElement('div');
      textLayer.className = 'djvu-text-layer absolute inset-0 pointer-events-auto overflow-hidden select-text';
      textLayer.style.width = `${cssWidth}px`;
      textLayer.style.height = `${cssHeight}px`;

      const pageText = this.populateTextLayer(pageProxy, textLayer, cssWidth, cssHeight, width, height);
      this.pageTextMap.set(pageNum, pageText);

      slot.innerHTML = '';
      slot.appendChild(canvas);
      slot.appendChild(textLayer);

      this.pageCache.set(pageNum, {
        canvas,
        textLayer,
        pageWidth: width,
        pageHeight: height,
      });

      this.restoreHighlightsForPage(pageNum, slot);
    } catch (err) {
      console.error(`Failed to render DjVu page ${pageNum}:`, err);
    }
  }

  private populateTextLayer(
    pageProxy: DjVuPageProxy,
    layer: HTMLElement,
    cssWidth: number,
    cssHeight: number,
    origWidth: number,
    origHeight: number,
  ): string {
    layer.innerHTML = '';
    const zones = pageProxy.getNormalizedTextZones?.();
    let accumulatedText = '';

    if (zones && zones.length > 0) {
      for (let i = 0; i < zones.length; i++) {
        const zone = zones[i]!;
        if (!zone.text) continue;
        accumulatedText += zone.text + ' ';

        const span = document.createElement('span');
        span.className = 'djvu-text-zone absolute text-transparent select-text leading-none';
        span.dataset.zoneIndex = String(i);
        span.textContent = zone.text;

        const leftPct = (zone.x / origWidth) * 100;
        const topPct = (zone.y / origHeight) * 100;
        const widthPct = (zone.width / origWidth) * 100;
        const heightPct = (zone.height / origHeight) * 100;

        span.style.left = `${leftPct}%`;
        span.style.top = `${topPct}%`;
        span.style.width = `${widthPct}%`;
        span.style.height = `${heightPct}%`;
        span.style.fontSize = `${Math.max(8, (zone.height / origHeight) * cssHeight)}px`;

        layer.appendChild(span);
      }
    } else {
      const rawText = pageProxy.getText?.() || '';
      accumulatedText = rawText;
      if (rawText.trim().length > 0) {
        const fullSpan = document.createElement('span');
        fullSpan.className = 'djvu-text-zone absolute inset-0 text-transparent opacity-0 select-text';
        fullSpan.textContent = rawText;
        layer.appendChild(fullSpan);
      }
    }

    return accumulatedText.trim();
  }

  private evictOutsideWindow(currentPage: number): void {
    const minPage = currentPage - CACHE_WINDOW_RADIUS;
    const maxPage = currentPage + CACHE_WINDOW_RADIUS;

    Array.from(this.pageCache.keys()).forEach((pageNum) => {
      if (pageNum < minPage || pageNum > maxPage) {
        const entry = this.pageCache.get(pageNum);
        if (entry) {
          entry.canvas.width = 0;
          entry.canvas.height = 0;
          this.pageCache.delete(pageNum);
          this.renderedPages.delete(pageNum);

          const slot = this.scrollContainer?.querySelector<HTMLElement>(
            `.djvu-page-slot[data-page-number="${pageNum}"]`,
          );
          if (slot) {
            slot.innerHTML = '';
            const placeholder = document.createElement('div');
            placeholder.className = 'djvu-loading-placeholder text-xs text-neutral-400 select-none';
            placeholder.textContent = `Page ${pageNum}`;
            slot.appendChild(placeholder);
          }
        }
      }
    });
  }

  private async initButtonsMode(): Promise<void> {
    if (!this.container) return;
    this.container.innerHTML = '';

    const viewport = document.createElement('div');
    viewport.className = 'djvu-buttons-viewport h-full w-full flex items-center justify-center overflow-auto p-4 select-text';
    if (this.currentColors) {
      viewport.style.backgroundColor = this.currentColors.bg;
    }
    this.buttonsContainer = viewport;
    this.container.appendChild(viewport);

    await this.renderButtonsPage(this.currentPageNumber);
  }

  private async renderButtonsPage(pageNum: number): Promise<void> {
    if (!this.buttonsContainer || !this.doc) return;
    this.buttonsContainer.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'djvu-page-slot relative shadow-md rounded overflow-hidden select-text';
    wrapper.dataset.pageNumber = String(pageNum);
    this.buttonsContainer.appendChild(wrapper);

    try {
      const pageProxy = await this.doc.getPage(pageNum);
      const width = pageProxy.getWidth();
      const height = pageProxy.getHeight();
      if (width <= 0 || height <= 0) return;

      const availWidth = Math.max(280, (this.buttonsContainer.clientWidth || 360) - 32);
      const availHeight = Math.max(320, (this.buttonsContainer.clientHeight || 500) - 32);

      const scaleW = availWidth / width;
      const scaleH = availHeight / height;
      const scale = Math.min(scaleW, scaleH) * this.zoomScale;

      const cssWidth = Math.round(width * scale);
      const cssHeight = Math.round(height * scale);

      wrapper.style.width = `${cssWidth}px`;
      wrapper.style.height = `${cssHeight}px`;

      const dpr = this.getClampedDpr();
      let canvasWidth = Math.round(cssWidth * dpr);
      let canvasHeight = Math.round(cssHeight * dpr);
      if (canvasWidth * canvasHeight > MAX_CANVAS_PIXELS) {
        const factor = Math.sqrt(MAX_CANVAS_PIXELS / (canvasWidth * canvasHeight));
        canvasWidth = Math.floor(canvasWidth * factor);
        canvasHeight = Math.floor(canvasHeight * factor);
      }

      const canvas = document.createElement('canvas');
      canvas.className = 'djvu-page-canvas block';
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        const imgData = pageProxy.getImageData(true);
        if (imgData.width === canvasWidth && imgData.height === canvasHeight) {
          ctx.putImageData(imgData, 0, 0);
        } else {
          const off = document.createElement('canvas');
          off.width = imgData.width;
          off.height = imgData.height;
          const offCtx = off.getContext('2d');
          if (offCtx) {
            offCtx.putImageData(imgData, 0, 0);
            ctx.drawImage(off, 0, 0, canvasWidth, canvasHeight);
            off.width = 0;
            off.height = 0;
          }
        }
      }

      this.applyCanvasFilter(canvas);

      const textLayer = document.createElement('div');
      textLayer.className = 'djvu-text-layer absolute inset-0 pointer-events-auto overflow-hidden select-text';
      textLayer.style.width = `${cssWidth}px`;
      textLayer.style.height = `${cssHeight}px`;

      const pageText = this.populateTextLayer(pageProxy, textLayer, cssWidth, cssHeight, width, height);
      this.pageTextMap.set(pageNum, pageText);

      wrapper.appendChild(canvas);
      wrapper.appendChild(textLayer);

      this.pageCache.set(pageNum, {
        canvas,
        textLayer,
        pageWidth: width,
        pageHeight: height,
      });

      this.restoreHighlightsForPage(pageNum, wrapper);
    } catch (err) {
      console.error(`Failed to render DjVu page in buttons mode ${pageNum}:`, err);
    }
  }

  async goTo(locator: string): Promise<void> {
    const targetPage = parseInt(locator, 10);
    if (isNaN(targetPage) || targetPage < 1 || targetPage > this.totalPagesCount) {
      return;
    }

    this.currentPageNumber = targetPage;
    this.updateLocation();

    if (this.paginationMode === 'scroll') {
      this.scrollToPage(targetPage, 'smooth');
    } else {
      await this.renderButtonsPage(targetPage);
    }
  }

  async next(): Promise<void> {
    if (this.currentPageNumber < this.totalPagesCount) {
      await this.goTo(String(this.currentPageNumber + 1));
    }
  }

  async prev(): Promise<void> {
    if (this.currentPageNumber > 1) {
      await this.goTo(String(this.currentPageNumber - 1));
    }
  }

  override setPaginationMode(mode: ReaderPaginationMode): void | Promise<void> {
    const normalizedMode = mode === 'buttons' ? 'paginated' : mode;
    if (this.paginationMode === normalizedMode) return;

    this.paginationMode = normalizedMode;
    this.cleanup();

    if (this.paginationMode === 'scroll') {
      return this.initScrollMode();
    } else {
      return this.initButtonsMode();
    }
  }

  private scrollToPage(pageNum: number, behavior: ScrollBehavior = 'smooth'): void {
    if (!this.scrollContainer) return;
    const slot = this.scrollContainer.querySelector<HTMLElement>(
      `.djvu-page-slot[data-page-number="${pageNum}"]`,
    );
    if (slot) {
      this.isProgrammaticScroll = true;
      slot.scrollIntoView({ behavior, block: 'start' });
      setTimeout(() => {
        this.isProgrammaticScroll = false;
      }, 350);
    }
  }

  private updateLocation(): void {
    const progress = this.totalPagesCount > 0
      ? Math.min(100, Math.max(0, (this.currentPageNumber / this.totalPagesCount) * 100))
      : 0;

    this.location = {
      locator: String(this.currentPageNumber),
      progressPercentage: Math.round(progress * 10) / 10,
      currentPage: this.currentPageNumber,
      totalPages: this.totalPagesCount,
    };

    this.onLocationChange?.({ ...this.location });
  }

  applyTheme(colors: { bg: string; text: string }): void {
    this.currentColors = colors;
    if (this.scrollContainer) {
      this.scrollContainer.style.backgroundColor = colors.bg;
      const slots = this.scrollContainer.querySelectorAll<HTMLElement>('.djvu-page-slot');
      slots.forEach((s) => (s.style.backgroundColor = colors.bg));
    }
    if (this.buttonsContainer) {
      this.buttonsContainer.style.backgroundColor = colors.bg;
    }

    const canvases = this.container?.querySelectorAll<HTMLCanvasElement>('.djvu-page-canvas');
    canvases?.forEach((canvas) => this.applyCanvasFilter(canvas));
  }

  private applyCanvasFilter(canvas: HTMLCanvasElement): void {
    if (!this.currentColors) return;
    const dark = isDarkColor(this.currentColors.bg);
    if (dark) {
      canvas.style.filter = 'invert(0.92) hue-rotate(180deg)';
    } else {
      canvas.style.filter = 'none';
    }
  }

  override async setZoom(scale: number): Promise<void> {
    const clamped = Math.max(1.0, Math.min(3.0, scale));
    if (Math.abs(this.zoomScale - clamped) < 0.01) return;
    this.zoomScale = clamped;

    if (this.paginationMode !== 'scroll') {
      await this.renderButtonsPage(this.currentPageNumber);
    }
  }

  override getZoom(): number {
    return this.zoomScale;
  }

  override resetZoom(): void {
    this.zoomScale = 1.0;
    if (this.paginationMode !== 'scroll') {
      void this.renderButtonsPage(this.currentPageNumber);
    }
  }

  override setHighlights(
    highlights: HighlightRecord[],
    onHighlightClick?: (highlight: HighlightRecord) => void,
  ): void {
    super.setHighlights(highlights, onHighlightClick);
    this.restoreAllHighlights();
  }

  private restoreAllHighlights(): void {
    if (!this.container) return;
    const slots = this.container.querySelectorAll<HTMLElement>('.djvu-page-slot');
    slots.forEach((slot) => {
      const pageNum = parseInt(slot.dataset.pageNumber || '1', 10);
      this.restoreHighlightsForPage(pageNum, slot);
    });
  }

  private restoreHighlightsForPage(pageNum: number, slot: HTMLElement): void {
    const existingOverlay = slot.querySelector<HTMLElement>('.djvu-highlight-overlay');
    existingOverlay?.remove();

    const pageHighlights = this.highlights.filter(
      (h) => h.format === 'djvu' && parseInt(h.locator, 10) === pageNum,
    );
    if (pageHighlights.length === 0) return;

    const overlay = document.createElement('div');
    overlay.className = 'djvu-highlight-overlay absolute inset-0 pointer-events-none z-10';

    const textZones = slot.querySelectorAll<HTMLElement>('.djvu-text-zone');

    pageHighlights.forEach((hl) => {
      const hlTextClean = hl.selected_text.trim().toLowerCase();
      textZones.forEach((zoneEl) => {
        const zoneText = (zoneEl.textContent || '').trim().toLowerCase();
        if (zoneText && (hlTextClean.includes(zoneText) || zoneText.includes(hlTextClean))) {
          const rect = document.createElement('div');
          rect.className = 'absolute rounded pointer-events-auto cursor-pointer opacity-40';
          rect.style.left = zoneEl.style.left;
          rect.style.top = zoneEl.style.top;
          rect.style.width = zoneEl.style.width;
          rect.style.height = zoneEl.style.height;

          switch (hl.color) {
            case 'green':
              rect.style.backgroundColor = '#C8E695';
              break;
            case 'pink':
              rect.style.backgroundColor = '#FBCFE8';
              break;
            case 'blue':
              rect.style.backgroundColor = '#BAE6FD';
              break;
            case 'purple':
              rect.style.backgroundColor = '#E9D5FF';
              break;
            case 'yellow':
            default:
              rect.style.backgroundColor = '#FEF08A';
              break;
          }

          rect.onclick = (e) => {
            e.stopPropagation();
            this.onHighlightClickCallback?.(hl);
          };

          overlay.appendChild(rect);
        }
      });
    });

    slot.appendChild(overlay);
  }

  getCurrentPageText(): string {
    const cached = this.pageTextMap.get(this.currentPageNumber);
    if (cached) return cached;
    return '';
  }

  highlightTtsSentence(sentenceText: string, _sentenceIndex: number): void {
    this.clearTtsHighlight();
    if (!this.container || !sentenceText) return;

    const currentSlot = this.container.querySelector<HTMLElement>(
      `.djvu-page-slot[data-page-number="${this.currentPageNumber}"]`,
    );
    if (!currentSlot) return;

    const textZones = currentSlot.querySelectorAll<HTMLElement>('.djvu-text-zone');
    const cleanSentence = sentenceText.trim().toLowerCase();

    textZones.forEach((zone) => {
      const txt = (zone.textContent || '').trim().toLowerCase();
      if (txt && cleanSentence.includes(txt)) {
        zone.classList.add('djvu-tts-active');
        zone.style.backgroundColor = 'rgba(250, 204, 21, 0.45)';
      }
    });
  }

  clearTtsHighlight(): void {
    if (!this.container) return;
    const active = this.container.querySelectorAll<HTMLElement>('.djvu-tts-active');
    active.forEach((el) => {
      el.classList.remove('djvu-tts-active');
      el.style.backgroundColor = '';
    });
  }

  override destroy(): void {
    this.cleanup();
    this.unbindZoomableInterface();
    super.destroy();
  }

  private cleanup(): void {
    this.pageObserver?.disconnect();
    this.pageObserver = null;

    if (this.scrollContainer) {
      this.scrollContainer.removeEventListener('scroll', this.handleScroll);
      this.scrollContainer = null;
    }
    this.buttonsContainer = null;

    this.pageCache.forEach((entry) => {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
    });
    this.pageCache.clear();
    this.renderedPages.clear();
    this.pageTextMap.clear();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }
}
