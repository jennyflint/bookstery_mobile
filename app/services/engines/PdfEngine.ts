import * as pdfjsLib from 'pdfjs-dist';
// @ts-expect-error Vite URL import for pdf.worker
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { BaseEngine } from './BaseEngine';
import { PinchZoomController } from './PinchZoomController';
import { useReaderStore } from '../../stores/readerStore';
import { extractReflowBlocks } from '../../utils/pdfReflowParser';
import type {
  HighlightRecord,
  ReaderLocation,
  ReaderPaginationMode,
  ZoomableContainerElement,
} from '../../types';

interface TextContentItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function initPdfWorker(): void {
  if (typeof window !== 'undefined' && 'GlobalWorkerOptions' in pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        pdfWorkerUrl ||
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${'version' in pdfjsLib ? pdfjsLib.version : '3.11.174'}/pdf.worker.min.js`;
    }
  }
}

function isDarkColor(hexOrRgb: string): boolean {
  if (!hexOrRgb) return false;
  let hex = hexOrRgb.replace('#', '').trim();
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (hex.length !== 6) return false;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum < 0.5;
}

const MAX_CANVAS_PIXELS = 16_000_000;
const FIT_MARGIN_PX = 32;
const RESIZE_DEBOUNCE_MS = 150;
const LAYOUT_WAIT_TIMEOUT_MS = 500;
const CANCEL_SETTLE_TIMEOUT_MS = 250;
const RAPID_NAV_DEBOUNCE_MS = 130;
const MAX_CACHE_WINDOW_RADIUS = 5;

export interface CachedPageRender {
  pageNumber: number;
  canvas: HTMLCanvasElement;
  scale: number;
  cssWidth: number;
  cssHeight: number;
  dpr: number;
}

export class PdfPageCache {
  private cache = new Map<number, CachedPageRender>();
  private readonly maxWindowRadius = MAX_CACHE_WINDOW_RADIUS;

  get(pageNumber: number, scale: number): CachedPageRender | undefined {
    const entry = this.cache.get(pageNumber);
    if (!entry) return undefined;
    if (Math.abs(entry.scale - scale) > 0.001) {
      return undefined;
    }
    // Refresh LRU order
    this.cache.delete(pageNumber);
    this.cache.set(pageNumber, entry);
    return entry;
  }

  set(entry: CachedPageRender): void {
    if (this.cache.has(entry.pageNumber)) {
      this.evictEntry(entry.pageNumber);
    }
    this.cache.set(entry.pageNumber, entry);
  }

  has(pageNumber: number, scale: number): boolean {
    return this.get(pageNumber, scale) !== undefined;
  }

  evictOutsideWindow(currentPage: number): void {
    const minPage = currentPage - this.maxWindowRadius;
    const maxPage = currentPage + this.maxWindowRadius;
    Array.from(this.cache.keys()).forEach((pageNum) => {
      if (pageNum < minPage || pageNum > maxPage) {
        this.evictEntry(pageNum);
      }
    });
  }

  private evictEntry(pageNumber: number): void {
    const entry = this.cache.get(pageNumber);
    if (entry) {
      // Zero dimensions to quickly release backing store GPU/RAM in mobile WebKit/Blink
      entry.canvas.width = 0;
      entry.canvas.height = 0;
      this.cache.delete(pageNumber);
    }
  }

  clear(): void {
    Array.from(this.cache.keys()).forEach((pageNum) => {
      this.evictEntry(pageNum);
    });
    this.cache.clear();
  }
}

export class PdfEngine extends BaseEngine {
  private pdfDocument: pdfjsLib.PDFDocumentProxy | null = null;
  private currentPageProxy: pdfjsLib.PDFPageProxy | null = null;
  private activeRenderTask: pdfjsLib.RenderTask | null = null;
  private currentPageNumber: number = 1;
  private totalPagesCount: number = 0;

  private scrollContainer: HTMLElement | null = null;
  private pageObserver: IntersectionObserver | null = null;
  private renderedPages = new Set<number>();
  private activeSlotRenderTasks = new Map<number, pdfjsLib.RenderTask>();
  private wheelThrottle = false;
  private scrollCleanupListener: (() => void) | null = null;
  private baseScale: number = 1.0;
  private currentScale: number = 1.0;
  private zoomScale: number = 1.0;
  private fitWholePage: boolean = false;
  private gestureController: PinchZoomController | null = null;
  private visibilityHandler: (() => void) | null = null;
  private currentColors: { bg: string; text: string } | null = null;
  private isProgrammaticScroll: boolean = false;
  private currentFontSize: number = 18;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastLayoutSize: { width: number; height: number } | null = null;
  private renderGeneration: number = 0;
  private basePageSize: { width: number; height: number } | null = null;
  private pageSizeCache = new Map<number, { width: number; height: number }>();
  private pageCache = new PdfPageCache();
  private activePreloadJob: { cancel: () => void } | null = null;
  private lastNavTimestamp: number = 0;
  private rapidNavDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingDebounceResolvers: Array<() => void> = [];
  private isPageTurnInProgress: boolean = false;
  private isTouchActive: boolean = false;
  private touchStartListener: (() => void) | null = null;
  private touchEndListener: (() => void) | null = null;

  private getClampedDpr(): number {
    const rawDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return Math.min(rawDpr, 2.5);
  }

  /** Lowers the pixel ratio for large canvases: mobile browsers fail to allocate huge ones, leaving a blank page. */
  private getCanvasSafeDpr(cssWidth: number, cssHeight: number): number {
    const dpr = this.getClampedDpr();
    const area = Math.max(cssWidth * cssHeight, 1);
    if (area * dpr * dpr <= MAX_CANVAS_PIXELS) {
      return dpr;
    }
    return Math.max(Math.sqrt(MAX_CANVAS_PIXELS / area), 0.25);
  }

  public get baseFitScale(): number {
    return this.baseScale;
  }

  public setFitWholePage(fit: boolean): void {
    this.fitWholePage = fit;
    void this.relayout();
  }

  public isFitWholePage(): boolean {
    return this.fitWholePage;
  }

  /** Available reader size in CSS pixels, with window fallbacks while layout is not settled yet. */
  private getContainerSize(): { width: number; height: number } {
    const windowWidth = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 360;
    const windowHeight = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 640;
    const containerWidth = this.container?.clientWidth ?? 0;
    // When container clientWidth is available (> 0), strictly bound it to window.innerWidth
    // so an oversized PDF or child element cannot expand the measured width beyond the screen.
    // If container clientWidth is 0 (e.g. before layout or in test environments), fallback to 320px.
    const measuredWidth = containerWidth > 0 ? Math.min(containerWidth, windowWidth) : Math.min(windowWidth, 320);

    let horizontalPadding = 0;
    let verticalPadding = 0;
    if (this.container && typeof window !== 'undefined') {
      try {
        const computed = window.getComputedStyle(this.container);
        horizontalPadding = (parseFloat(computed.paddingLeft) || 0) + (parseFloat(computed.paddingRight) || 0);
        verticalPadding = (parseFloat(computed.paddingTop) || 0) + (parseFloat(computed.paddingBottom) || 0);
      } catch {
        horizontalPadding = 0;
        verticalPadding = 0;
      }
    }

    const marginX = horizontalPadding > 0 ? horizontalPadding : FIT_MARGIN_PX;
    const availableWidth = Math.max(0, measuredWidth - marginX);

    const containerHeight = this.container?.clientHeight ?? 0;
    const measuredHeight = containerHeight > 0 ? containerHeight : windowHeight;
    const marginY = verticalPadding > 0 ? verticalPadding : FIT_MARGIN_PX;
    const availableHeight = Math.max(0, measuredHeight - marginY);

    return {
      width: availableWidth,
      height: availableHeight,
    };
  }

  /**
   * Fit-to-screen scale for a page. `getViewport({ scale: 1 })` already applies the page's built-in
   * rotation (rotation: page.rotate must not be passed manually to avoid double-rotation).
   * Calculates both scaleX and scaleY, guaranteeing page never exceeds screen width (scaleX),
   * and automatically applies bounding-box fit (Math.min(scaleX, scaleY)) when page is wider than tall.
   */
  private computeFitScale(page: pdfjsLib.PDFPageProxy): number {
    const unscaledViewport = page.getViewport({ scale: 1 });
    if (!(unscaledViewport.width > 0) || !(unscaledViewport.height > 0)) {
      return 1;
    }
    const { width: availableWidth, height: availableHeight } = this.getContainerSize();
    const scaleX = availableWidth / unscaledViewport.width;
    const scaleY = availableHeight / unscaledViewport.height;

    const isWiderThanTall = unscaledViewport.width > unscaledViewport.height;
    const fitScale = isWiderThanTall || this.fitWholePage || this.paginationMode === 'buttons' || this.paginationMode === 'paginated'
      ? Math.min(scaleX, scaleY)
      : scaleX;

    // Guaranteed to never exceed screen width (scaleX), clamped between 0.2 and 2.5
    return Math.max(Math.min(fitScale, scaleX, 2.5), 0.2);
  }

  /** Resolves once the container has a real size (first layout pass), or after a short timeout. */
  private waitForContainerLayout(container: HTMLElement): Promise<void> {
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      return Promise.resolve();
    }
    if (typeof ResizeObserver === 'undefined') {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const observer = new ResizeObserver(() => {
        if (container.clientWidth > 0 && container.clientHeight > 0) {
          finish();
        }
      });
      const timeout = setTimeout(() => finish(), LAYOUT_WAIT_TIMEOUT_MS);
      function finish(): void {
        clearTimeout(timeout);
        observer.disconnect();
        resolve();
      }
      observer.observe(container);
    });
  }

  private isGestureActive(): boolean {
    if (this.isTouchActive) return true;
    const gestureState = this.gestureController?.getState();
    if (gestureState && (gestureState.isPinching || gestureState.isPanning || gestureState.isAnimating)) {
      return true;
    }
    return false;
  }

  private observeContainerResize(): void {
    this.disconnectResizeObserver();
    if (!this.container || typeof ResizeObserver === 'undefined') {
      return;
    }
    this.lastLayoutSize = { width: this.container.clientWidth, height: this.container.clientHeight };
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.container) return;
      // Disable ResizeObserver re-render loops while a page turn or touch gesture is actively in progress or when zoomed in
      const gestureScale = this.gestureController?.getState().scale ?? 1.0;
      const viewportEl = this.container.closest<HTMLElement>('[data-testid="reader-viewport"]');
      const viewportScale = viewportEl ? parseFloat(viewportEl.getAttribute('data-scale') || '1') : 1.0;
      if (
        this.isPageTurnInProgress ||
        this.isGestureActive() ||
        this.zoomScale !== 1.0 ||
        gestureScale !== 1.0 ||
        viewportScale !== 1.0
      ) {
        return;
      }
      const next = { width: this.container.clientWidth, height: this.container.clientHeight };
      const prev = this.lastLayoutSize;
      if (next.width <= 0 || next.height <= 0) return;
      // Ignore identical dimensions
      if (prev && prev.width === next.width && prev.height === next.height) {
        return;
      }
      // Ignore sub-pixel fluctuations (< 3px) to prevent jitter from 1px scrollbar or touch fluctuations
      if (prev && Math.abs(next.width - prev.width) < 3 && Math.abs(next.height - prev.height) < 3) {
        return;
      }
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        this.resizeTimer = null;
        this.lastLayoutSize = next;
        void this.relayout();
      }, RESIZE_DEBOUNCE_MS);
    });
    this.resizeObserver.observe(this.container);
  }

  private disconnectResizeObserver(): void {
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  /** Re-fits the current page after the reader container changed size (rotation, UI chrome, split view). */
  private async relayout(): Promise<void> {
    if (!this.pdfDocument || !this.container) return;
    try {
      if (this.paginationMode === 'scroll') {
        await this.renderScrollMode();
        this.scrollToPage(this.currentPageNumber, false);
      } else {
        await this.renderButtonsMode(this.currentPageNumber, this.zoomScale, true);
      }
    } catch (err) {
      console.warn('[PdfEngine] Failed to re-fit page after container resize:', err);
    }
  }

  /**
   * Cancels the running page render and waits until pdf.js has released the canvas, so two
   * render passes can never paint onto the same surface.
   */
  private async cancelActiveRender(): Promise<void> {
    const task = this.activeRenderTask;
    if (!task) return;
    this.activeRenderTask = null;
    try {
      task.cancel();
    } catch {
      return;
    }
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        task.promise,
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, CANCEL_SETTLE_TIMEOUT_MS);
        }),
      ]);
    } catch {
      // RenderingCancelledException is the expected outcome of cancel().
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async init(
    container: HTMLElement,
    data: Uint8Array | ArrayBuffer | string | Blob,
    initialLocator?: string,
  ): Promise<void> {
    this.container = container;
    this.container.innerHTML = '';
    await this.waitForContainerLayout(container);

    const zoomableContainer = container as ZoomableContainerElement;
    zoomableContainer.__readerSetZoom = (scale: number) => this.setZoom(scale);
    zoomableContainer.__readerResetZoom = () => this.resetZoom();
    // Visual viewport zoom is purely CSS transformed without engine re-rendering
    zoomableContainer.__readerCanRenderZoom = () => false;
    zoomableContainer.__readerGetContentSize = () =>
      this.paginationMode === 'scroll' ? null : this.basePageSize;
    zoomableContainer.__readerGetScrollContainer = () => {
      return this.scrollContainer || this.container?.querySelector<HTMLElement>('.pdf-scroll-container') || null;
    };

    this.touchStartListener = () => {
      this.isTouchActive = true;
    };
    this.touchEndListener = () => {
      this.isTouchActive = false;
    };
    container.addEventListener('touchstart', this.touchStartListener, { passive: true });
    container.addEventListener('touchend', this.touchEndListener, { passive: true });
    container.addEventListener('touchcancel', this.touchEndListener, { passive: true });

    if (!container.closest('[data-testid="reader-viewport"]')) {
      this.gestureController?.destroy();
      this.gestureController = new PinchZoomController({
        wrapper: container,
        target: container,
        minScale: 0.5,
        maxScale: 4.0,
        doubleTapScale: 2.5,
        doubleTapDelayMs: 300,
        debounceMs: 200,
        isRenderZoomSupported: () => false,
        onSwipeNext: () => {
          void this.next();
        },
        onSwipePrev: () => {
          void this.prev();
        },
      });
    }

    initPdfWorker();

    let rawBytes: Uint8Array | null = null;
    let docSource: Parameters<typeof pdfjsLib.getDocument>[0];

    if (data instanceof Uint8Array) {
      rawBytes = data;
    } else if (data instanceof ArrayBuffer) {
      rawBytes = new Uint8Array(data);
    } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
      const buffer = await data.arrayBuffer();
      rawBytes = new Uint8Array(buffer);
    } else if (typeof data === 'string') {
      if (data.startsWith('data:')) {
        const base64 = data.split(',')[1] || '';
        const binary = atob(base64);
        rawBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          rawBytes[i] = binary.charCodeAt(i);
        }
      } else if (
        !data.startsWith('http://') &&
        !data.startsWith('https://') &&
        !data.startsWith('blob:') &&
        !data.startsWith('/')
      ) {
        try {
          const binary = atob(data);
          rawBytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            rawBytes[i] = binary.charCodeAt(i);
          }
        } catch {
          rawBytes = new TextEncoder().encode(data);
        }
      }
    }

    if (rawBytes) {
      docSource = {
        data: rawBytes,
        cMapPacked: true,
      };
    } else if (typeof data === 'string') {
      docSource = data;
    } else {
      throw new Error('Unsupported data format provided to PdfEngine');
    }

    try {
      const loadingTask = pdfjsLib.getDocument(docSource);
      this.pdfDocument = await loadingTask.promise;
      this.totalPagesCount = this.pdfDocument.numPages;

      const firstPage = await this.pdfDocument.getPage(1);
      const initialViewport = firstPage.getViewport({ scale: 1 });
      this.basePageSize = {
        width: Math.floor(initialViewport.width),
        height: Math.floor(initialViewport.height),
      };
      this.pageSizeCache.set(1, this.basePageSize);
      try {
        firstPage.cleanup();
      } catch {
      }

      const initialPage = initialLocator ? parseInt(initialLocator, 10) : 1;
      this.currentPageNumber = !isNaN(initialPage) && initialPage >= 1 ? Math.min(initialPage, this.totalPagesCount) : 1;

      this.attachVisibilityListener();

      if (this.paginationMode === 'scroll') {
        await this.renderScrollMode();
        if (this.currentPageNumber > 1) {
          this.scrollToPage(this.currentPageNumber, false);
        }
      } else {
        await this.renderButtonsMode(this.currentPageNumber);
      }
      this.observeContainerResize();
    } catch (err) {
      console.error('[PdfEngine] Failed to initialize PDF document:', err);
      throw err;
    }
  }

  async setPaginationMode(mode: ReaderPaginationMode): Promise<void> {
    if (this.paginationMode === mode && this.container?.children.length) {
      return;
    }
    this.resetZoom(true);
    this.paginationMode = mode;
    this.cleanupScroll();

    if (!this.pdfDocument || !this.container) {
      return;
    }

    if (mode === 'scroll') {
      await this.renderScrollMode();
      this.scrollToPage(this.currentPageNumber);
    } else {
      await this.renderButtonsMode(this.currentPageNumber);
    }
  }

  async goTo(locator: string): Promise<void> {
    const pageNum = parseInt(locator, 10);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > this.totalPagesCount) {
      return;
    }

    this.resetZoom(true);

    if (this.paginationMode === 'scroll') {
      this.scrollToPage(pageNum, false);
    } else {
      await this.handleButtonsNavigation(pageNum);
    }
  }

  /** `zoom` is relative to the fit-to-screen scale, so 1.0 always means the default page size. */
  override async setZoom(zoom: number): Promise<void> {
    if (!this.pdfDocument || !this.container) {
      return;
    }
    const clampedZoom = Math.min(Math.max(zoom, 0.5), 4.0);
    this.zoomScale = clampedZoom;
    this.gestureController?.setScale(clampedZoom);
    this.pageCache.clear();

    if (this.paginationMode === 'scroll') {
      return;
    }
    await this.renderButtonsMode(this.currentPageNumber, clampedZoom, true);
  }

  async zoomIn(step: number = 0.25): Promise<void> {
    await this.setZoom(this.zoomScale + step);
  }

  async zoomOut(step: number = 0.25): Promise<void> {
    await this.setZoom(this.zoomScale - step);
  }

  override async setFontSize(size: number): Promise<void> {
    this.currentFontSize = Math.min(Math.max(Math.round(size), 12), 36);
    const fontScale = this.currentFontSize / 18;
    const targetScale = Math.min(Math.max(fontScale, 0.5), 4.0);
    await this.setZoom(targetScale);
  }

  override getZoom(): number {
    return this.zoomScale;
  }

  override resetZoom(skipReRender: boolean = false): void {
    const wasZoomed = this.zoomScale !== 1.0;
    this.zoomScale = 1.0;
    this.currentScale = this.baseScale;
    if (wasZoomed) {
      this.pageCache.clear();
    }
    this.gestureController?.resetZoom(true);
    (this.container as ZoomableContainerElement | null)?.__onEngineResetZoom?.();

    if (wasZoomed && !skipReRender && this.pdfDocument && this.container) {
      void this.setZoom(1.0);
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

  getCurrentLocation(): ReaderLocation {
    const percentage =
      this.totalPagesCount > 0
        ? Number(((this.currentPageNumber / this.totalPagesCount) * 100).toFixed(2))
        : 0;

    return {
      locator: String(this.currentPageNumber),
      progressPercentage: percentage,
      currentPage: this.currentPageNumber,
      totalPages: this.totalPagesCount,
    };
  }

  private async renderScrollMode(): Promise<void> {
    if (!this.pdfDocument || !this.container) return;
    this.cleanupScroll();
    this.container.innerHTML = '';

    const scrollWrapper = document.createElement('div');
    scrollWrapper.className =
      'pdf-scroll-container relative w-full max-w-full min-w-0 h-full overflow-y-auto overflow-x-hidden flex flex-col items-center py-6 px-2 space-y-6 select-text';
    (scrollWrapper.style as any).webkitOverflowScrolling = 'touch';
    scrollWrapper.style.contain = 'paint';
    scrollWrapper.style.willChange = 'scroll-position';
    this.container.appendChild(scrollWrapper);
    this.scrollContainer = scrollWrapper;

    const firstPage = await this.pdfDocument.getPage(1);
    const targetScale = this.computeFitScale(firstPage);
    this.baseScale = targetScale;
    this.currentScale = targetScale;
    const scaledViewport = firstPage.getViewport({ scale: targetScale });
    const expectedWidth = Math.floor(scaledViewport.width);
    const expectedHeight = Math.floor(scaledViewport.height);
    try {
      firstPage.cleanup();
    } catch {
    }

    for (let pageNum = 1; pageNum <= this.totalPagesCount; pageNum++) {
      const pageSlot = document.createElement('div');
      pageSlot.id = `pdf-page-slot-${pageNum}`;
      pageSlot.dataset.pageNumber = String(pageNum);
      pageSlot.className =
        'pdf-page-slot relative flex justify-center items-center bg-white shadow-md rounded-md overflow-hidden transition-all';
      pageSlot.style.width = `${expectedWidth}px`;
      pageSlot.style.height = `${expectedHeight}px`;
      pageSlot.style.minHeight = `${expectedHeight}px`;
      pageSlot.style.maxHeight = `${expectedHeight}px`;
      pageSlot.style.contain = 'layout paint';
      pageSlot.style.backfaceVisibility = 'hidden';
      (pageSlot.style as any).webkitBackfaceVisibility = 'hidden';

      const placeholder = document.createElement('div');
      placeholder.className =
        'pdf-slot-placeholder text-zinc-300 text-xs font-semibold flex items-center justify-center';
      placeholder.style.height = `${expectedHeight}px`;
      placeholder.textContent = `${pageNum} / ${this.totalPagesCount}`;
      pageSlot.appendChild(placeholder);

      scrollWrapper.appendChild(pageSlot);
      if (this.currentColors) {
        this.applySlotTheme(pageSlot);
      }
    }

    const initialSlot = scrollWrapper.querySelector<HTMLElement>(
      `#pdf-page-slot-${this.currentPageNumber}`,
    );
    if (initialSlot) {
      await this.renderPageIntoSlot(this.currentPageNumber, initialSlot, targetScale);
    }

    this.pageObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const slot = entry.target as HTMLElement;
            const pageNum = parseInt(slot.dataset.pageNumber || '1', 10);
            if (!this.renderedPages.has(pageNum)) {
              this.renderPageIntoSlot(pageNum, slot, targetScale);
            }
          }
        });
      },
      {
        root: scrollWrapper,
        rootMargin: '400px 0px',
        threshold: 0.01,
      },
    );

    scrollWrapper.querySelectorAll('.pdf-page-slot').forEach((slot) => {
      this.pageObserver?.observe(slot);
    });

    let scrollRaf: number | null = null;
    const handleScroll = () => {
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(() => {
        if (!this.scrollContainer || this.isProgrammaticScroll) return;
        const containerTop = this.scrollContainer.scrollTop;
        const containerHeight = this.scrollContainer.clientHeight;
        const checkLine = containerTop + containerHeight * 0.35;

        const slots = Array.from(
          this.scrollContainer.querySelectorAll<HTMLElement>('.pdf-page-slot'),
        );
        for (const slot of slots) {
          const top = slot.offsetTop;
          const bottom = top + slot.offsetHeight;
          if (top <= checkLine && bottom >= checkLine) {
            const pageNum = parseInt(slot.dataset.pageNumber || '1', 10);
            if (this.currentPageNumber !== pageNum) {
              this.currentPageNumber = pageNum;
              this.location = this.getCurrentLocation();
              this.onLocationChange?.(this.location);
            }
            break;
          }
        }
      });
    };

    scrollWrapper.addEventListener('scroll', handleScroll, { passive: true });
    this.scrollCleanupListener = () => {
      scrollWrapper.removeEventListener('scroll', handleScroll);
    };

    this.location = this.getCurrentLocation();
    this.onLocationChange?.(this.location);
  }

  private async renderPageIntoSlot(
    pageNumber: number,
    slot: HTMLElement,
    scale: number,
  ): Promise<void> {
    if (!this.pdfDocument || this.renderedPages.has(pageNumber)) {
      return;
    }

    const existingTask = this.activeSlotRenderTasks.get(pageNumber);
    if (existingTask) {
      try {
        existingTask.cancel();
      } catch {
      }
      this.activeSlotRenderTasks.delete(pageNumber);
    }

    let pageProxy: pdfjsLib.PDFPageProxy | null = null;
    let renderTask: pdfjsLib.RenderTask | null = null;

    try {
      pageProxy = await this.pdfDocument.getPage(pageNumber);
      const viewport = pageProxy.getViewport({ scale });
      const dpr = this.getCanvasSafeDpr(viewport.width, viewport.height);

      const concurrentTask = this.activeSlotRenderTasks.get(pageNumber);
      if (concurrentTask) {
        try {
          concurrentTask.cancel();
        } catch {
        }
        this.activeSlotRenderTasks.delete(pageNumber);
      }

      const cssWidth = Math.floor(viewport.width);
      const cssHeight = Math.floor(viewport.height);
      const bufferWidth = Math.floor(cssWidth * dpr);
      const bufferHeight = Math.floor(cssHeight * dpr);

      // Lock slot dimensions so geometry never collapses
      slot.style.position = 'relative';
      slot.style.width = `${cssWidth}px`;
      slot.style.height = `${cssHeight}px`;
      slot.style.minHeight = `${cssHeight}px`;
      slot.style.maxHeight = `${cssHeight}px`;

      // Offscreen buffer canvas for double-buffered rendering
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = bufferWidth;
      offscreenCanvas.height = bufferHeight;
      const offscreenContext = offscreenCanvas.getContext('2d', { alpha: false });

      if (!offscreenContext) {
        pageProxy.cleanup();
        return;
      }

      offscreenContext.imageSmoothingEnabled = true;
      offscreenContext.imageSmoothingQuality = 'high';

      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
      const renderContext = {
        canvasContext: offscreenContext,
        transform,
        viewport,
      };

      renderTask = pageProxy.render(renderContext);
      this.activeSlotRenderTasks.set(pageNumber, renderTask);

      await renderTask.promise;
      this.renderedPages.add(pageNumber);
      if (this.activeSlotRenderTasks.get(pageNumber) === renderTask) {
        this.activeSlotRenderTasks.delete(pageNumber);
      }

      // Atomically swap rendered buffer onto visible canvas
      slot.innerHTML = '';

      const visibleCanvas = document.createElement('canvas');
      visibleCanvas.className = 'pdf-canvas block bg-white';
      visibleCanvas.width = bufferWidth;
      visibleCanvas.height = bufferHeight;
      visibleCanvas.style.width = `${cssWidth}px`;
      visibleCanvas.style.height = `${cssHeight}px`;
      visibleCanvas.style.display = 'block';
      visibleCanvas.style.pointerEvents = 'none';

      const visibleCtx = visibleCanvas.getContext('2d', { alpha: false });
      if (visibleCtx) {
        visibleCtx.imageSmoothingEnabled = true;
        visibleCtx.imageSmoothingQuality = 'high';
        visibleCtx.drawImage(offscreenCanvas, 0, 0);
      }

      slot.appendChild(visibleCanvas);
      if (this.currentColors) {
        this.applySlotTheme(slot);
        this.applyCanvasTheme(visibleCanvas);
      }

      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer pdf-text-layer';
      textLayerDiv.style.width = `${cssWidth}px`;
      textLayerDiv.style.height = `${cssHeight}px`;
      textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale));
      slot.appendChild(textLayerDiv);

      try {
        const textContent = await pageProxy.getTextContent();
        textLayerDiv.innerHTML = '';
        if (typeof (pdfjsLib as any).renderTextLayer === 'function') {
          const textLayerTask = (pdfjsLib as any).renderTextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport,
            textDivs: [],
          });
          if (textLayerTask && textLayerTask.promise) {
            await textLayerTask.promise;
          }
        } else {
          for (const item of textContent.items as TextContentItem[]) {
            if (!item.str) continue;
            const span = document.createElement('span');
            span.textContent = item.str;
            textLayerDiv.appendChild(span);
          }
        }
      } catch (textErr) {
        console.warn('[PdfEngine] Failed to render text layer in slot:', textErr);
      }

      this.restoreHighlightsForPage(pageNumber, slot);

      pageProxy.cleanup();
    } catch (err: unknown) {
      if (renderTask && this.activeSlotRenderTasks.get(pageNumber) === renderTask) {
        this.activeSlotRenderTasks.delete(pageNumber);
      }
      const error = err as { name?: string };
      if (error && error.name === 'RenderingCancelledException') {
        try {
          pageProxy?.cleanup();
        } catch {
        }
        return;
      }
      this.renderedPages.delete(pageNumber);
      console.warn(`[PdfEngine] Error rendering page ${pageNumber} into slot:`, err);
    }
  }

  private refreshVisibleSlots(): void {
    if (!this.scrollContainer || !this.pdfDocument) {
      return;
    }
    const containerTop = this.scrollContainer.scrollTop;
    const containerHeight = this.scrollContainer.clientHeight;
    const slots = this.scrollContainer.querySelectorAll<HTMLElement>('.pdf-page-slot');

    slots.forEach((slot) => {
      const top = slot.offsetTop;
      const bottom = top + slot.offsetHeight;
      if (bottom >= containerTop - 250 && top <= containerTop + containerHeight + 250) {
        const pageNum = parseInt(slot.dataset.pageNumber || '1', 10);
        const canvas = slot.querySelector('canvas');
        if (!canvas || !this.renderedPages.has(pageNum)) {
          this.renderedPages.delete(pageNum);
          this.renderPageIntoSlot(pageNum, slot, this.currentScale);
        }
      }
    });
  }

  private onVisibilityChange(): void {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') {
      return;
    }
    if (!this.pdfDocument || !this.container) {
      return;
    }

    if (this.paginationMode === 'scroll') {
      this.refreshVisibleSlots();
    } else {
      this.renderButtonsMode(this.currentPageNumber);
    }
  }

  private attachVisibilityListener(): void {
    if (typeof document === 'undefined' || this.visibilityHandler) {
      return;
    }
    this.visibilityHandler = () => {
      this.onVisibilityChange();
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private detachVisibilityListener(): void {
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  private scrollToPage(pageNumber: number, smooth: boolean = true): void {
    if (!this.scrollContainer) return;
    const slot = this.scrollContainer.querySelector<HTMLElement>(`#pdf-page-slot-${pageNumber}`);
    if (slot) {
      this.isProgrammaticScroll = true;
      this.scrollContainer.scrollTo({
        top: Math.max(0, slot.offsetTop - 16),
        behavior: smooth ? 'smooth' : 'auto',
      });
      this.currentPageNumber = pageNumber;
      this.location = this.getCurrentLocation();
      this.renderPageIntoSlot(pageNumber, slot, this.currentScale);
      setTimeout(() => {
        this.isProgrammaticScroll = false;
      }, 200);
    }
  }

  private async handleButtonsNavigation(pageNumber: number): Promise<void> {
    const now = Date.now();
    const timeSinceLastNav = now - this.lastNavTimestamp;
    this.lastNavTimestamp = now;

    this.currentPageNumber = pageNumber;
    this.location = this.getCurrentLocation();
    this.onLocationChange?.(this.location);

    this.cancelPreload();

    // 1. Check LRU cache for 0ms page turn
    if (this.pageCache.has(pageNumber, this.currentScale)) {
      if (this.rapidNavDebounceTimer) {
        clearTimeout(this.rapidNavDebounceTimer);
        this.rapidNavDebounceTimer = null;
        const resolvers = this.pendingDebounceResolvers;
        this.pendingDebounceResolvers = [];
        resolvers.forEach((r) => r());
      }
      await this.cancelActiveRender();
      this.displayCachedPage(pageNumber);
      this.pageCache.evictOutsideWindow(pageNumber);
      this.scheduleWindowPreload(pageNumber, this.currentScale);
      return;
    }

    // 2. Rapid navigation check: debounce if user is quickly flipping/scrubbing
    const isRapid = timeSinceLastNav < RAPID_NAV_DEBOUNCE_MS || this.activeRenderTask !== null;

    if (isRapid) {
      this.showButtonsPlaceholder(pageNumber);
      await this.cancelActiveRender();

      if (this.rapidNavDebounceTimer) {
        clearTimeout(this.rapidNavDebounceTimer);
        this.rapidNavDebounceTimer = null;
        // Resolve previously superseded navigation promises
        const resolvers = this.pendingDebounceResolvers;
        this.pendingDebounceResolvers = [];
        resolvers.forEach((r) => r());
      }

      await new Promise<void>((resolve) => {
        this.pendingDebounceResolvers.push(resolve);
        this.rapidNavDebounceTimer = setTimeout(async () => {
          this.rapidNavDebounceTimer = null;
          try {
            await this.renderButtonsMode(pageNumber);
          } finally {
            const resolvers = this.pendingDebounceResolvers;
            this.pendingDebounceResolvers = [];
            resolvers.forEach((r) => r());
          }
        }, RAPID_NAV_DEBOUNCE_MS);
      });
      return;
    }

    // 3. Normal navigation: render target page
    await this.renderButtonsMode(pageNumber);
  }

  private displayCachedPage(pageNumber: number): void {
    const cached = this.pageCache.get(pageNumber, this.currentScale);
    if (!cached || !this.container) return;

    if (this.currentPageProxy) {
      try {
        this.currentPageProxy.cleanup();
      } catch {
      }
      this.currentPageProxy = null;
    }

    this.currentPageNumber = pageNumber;
    const { pageWrapper, visibleCanvas, textLayerDiv } = this.ensureButtonsDomStructure(
      cached.cssWidth,
      cached.cssHeight,
    );

    const placeholder = pageWrapper.querySelector<HTMLElement>('.pdf-page-placeholder');
    if (placeholder) {
      placeholder.style.display = 'none';
    }

    if (visibleCanvas.width !== cached.canvas.width || visibleCanvas.height !== cached.canvas.height) {
      visibleCanvas.width = cached.canvas.width;
      visibleCanvas.height = cached.canvas.height;
    }
    visibleCanvas.style.width = `${cached.cssWidth}px`;
    visibleCanvas.style.height = `${cached.cssHeight}px`;

    const ctx = visibleCanvas.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(cached.canvas, 0, 0);
    }
    this.applyCanvasTheme(visibleCanvas);

    pageWrapper.style.width = `${cached.cssWidth}px`;
    pageWrapper.style.height = `${cached.cssHeight}px`;
    pageWrapper.style.minWidth = `${cached.cssWidth}px`;
    pageWrapper.style.minHeight = `${cached.cssHeight}px`;
    pageWrapper.style.maxWidth = `${cached.cssWidth}px`;
    pageWrapper.style.maxHeight = `${cached.cssHeight}px`;

    textLayerDiv.style.width = `${cached.cssWidth}px`;
    textLayerDiv.style.height = `${cached.cssHeight}px`;
    textLayerDiv.style.setProperty('--scale-factor', String(cached.scale));

    void this.updateCachedTextLayer(pageNumber, textLayerDiv, cached.scale);
    this.restoreHighlightsForPage(pageNumber, pageWrapper);

    this.location = this.getCurrentLocation();
    this.onLocationChange?.(this.location);
  }

  private async updateCachedTextLayer(
    pageNumber: number,
    textLayerDiv: HTMLElement,
    scale: number,
  ): Promise<void> {
    if (!this.pdfDocument) return;
    try {
      const pageProxy = await this.pdfDocument.getPage(pageNumber);
      const viewport = pageProxy.getViewport({ scale });
      await this.renderButtonsTextLayer(pageProxy, textLayerDiv, viewport);
      pageProxy.cleanup();
    } catch {
    }
  }

  private showButtonsPlaceholder(pageNumber: number): void {
    if (!this.container) return;
    const baseSize = this.pageSizeCache.get(pageNumber) || this.basePageSize;
    const cssWidth = baseSize
      ? Math.floor(baseSize.width * this.currentScale)
      : Math.floor(this.container.clientWidth || 320);
    const cssHeight = baseSize
      ? Math.floor(baseSize.height * this.currentScale)
      : Math.floor(this.container.clientHeight || 480);

    const { pageWrapper } = this.ensureButtonsDomStructure(cssWidth, cssHeight);
    let placeholder = pageWrapper.querySelector<HTMLElement>('.pdf-page-placeholder');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.className =
        'pdf-page-placeholder absolute inset-0 text-zinc-300 text-sm font-semibold flex items-center justify-center bg-white/50 backdrop-blur-[1px] pointer-events-none transition-opacity duration-150';
      placeholder.style.zIndex = '5';
      pageWrapper.appendChild(placeholder);
    }
    placeholder.style.display = 'flex';
    placeholder.textContent = `${pageNumber} / ${this.totalPagesCount}`;
  }

  private cancelPreload(): void {
    if (this.activePreloadJob) {
      this.activePreloadJob.cancel();
      this.activePreloadJob = null;
    }
  }

  private scheduleWindowPreload(currentPage: number, scale: number): void {
    this.cancelPreload();

    if (!this.pdfDocument || this.paginationMode === 'scroll') return;

    // Sliding window around current page: [currentPage - 2, currentPage + 3]
    const priorityOffsets = [1, -1, 2, 3, -2];
    const pagesToPreload: number[] = [];

    for (const offset of priorityOffsets) {
      const pageNum = currentPage + offset;
      if (pageNum >= 1 && pageNum <= this.totalPagesCount && !this.pageCache.has(pageNum, scale)) {
        pagesToPreload.push(pageNum);
      }
    }

    if (pagesToPreload.length === 0) return;

    const scheduleCallback =
      typeof window !== 'undefined' && 'requestIdleCallback' in window
        ? (cb: () => void) => (window as any).requestIdleCallback(cb, { timeout: 1000 })
        : (cb: () => void) => setTimeout(cb, 150);

    let isCancelled = false;
    let activePreloadTask: pdfjsLib.RenderTask | null = null;

    this.activePreloadJob = {
      cancel: () => {
        isCancelled = true;
        if (activePreloadTask) {
          try {
            activePreloadTask.cancel();
          } catch {
          }
        }
      },
    };

    const processNext = async (index: number) => {
      if (isCancelled || index >= pagesToPreload.length || !this.pdfDocument) return;
      const pageNum = pagesToPreload[index];

      try {
        const pageProxy = await this.pdfDocument.getPage(pageNum);
        if (isCancelled) {
          pageProxy.cleanup();
          return;
        }

        const viewport = pageProxy.getViewport({ scale });
        const dpr = this.getCanvasSafeDpr(viewport.width, viewport.height);
        const cssWidth = Math.floor(viewport.width);
        const cssHeight = Math.floor(viewport.height);
        const bufferWidth = Math.floor(cssWidth * dpr);
        const bufferHeight = Math.floor(cssHeight * dpr);

        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = bufferWidth;
        offscreenCanvas.height = bufferHeight;
        const offCtx = offscreenCanvas.getContext('2d', { alpha: false });

        if (!offCtx) {
          pageProxy.cleanup();
          return;
        }

        offCtx.imageSmoothingEnabled = true;
        offCtx.imageSmoothingQuality = 'high';

        const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
        const renderTask = pageProxy.render({
          canvasContext: offCtx,
          transform,
          viewport,
        });
        activePreloadTask = renderTask;

        await renderTask.promise;
        activePreloadTask = null;

        if (!isCancelled) {
          this.pageCache.set({
            pageNumber: pageNum,
            canvas: offscreenCanvas,
            scale,
            cssWidth,
            cssHeight,
            dpr,
          });
        }

        pageProxy.cleanup();
      } catch {
        // Ignored for background preloading
      }

      if (!isCancelled && index + 1 < pagesToPreload.length) {
        scheduleCallback(() => void processNext(index + 1));
      }
    };

    scheduleCallback(() => void processNext(0));
  }

  private ensureButtonsDomStructure(
    cssWidth: number,
    cssHeight: number,
  ): {
    viewportContainer: HTMLElement;
    pageWrapper: HTMLElement;
    visibleCanvas: HTMLCanvasElement;
    textLayerDiv: HTMLElement;
  } {
    let viewportContainer = this.container!.querySelector<HTMLElement>('.pdf-page-container');
    let pageWrapper = viewportContainer?.querySelector<HTMLElement>('.pdf-page-wrapper');
    let visibleCanvas = pageWrapper?.querySelector<HTMLCanvasElement>('.pdf-canvas');
    let textLayerDiv = pageWrapper?.querySelector<HTMLElement>('.textLayer');

    if (!viewportContainer || !pageWrapper || !visibleCanvas || !textLayerDiv) {
      this.container!.innerHTML = '';

      viewportContainer = document.createElement('div');
      viewportContainer.className =
        'pdf-page-container relative flex justify-center items-center select-text w-full max-w-full min-w-0 h-full overflow-hidden';
      viewportContainer.style.contain = 'layout paint';
      viewportContainer.style.willChange = 'transform';
      viewportContainer.style.backfaceVisibility = 'hidden';
      (viewportContainer.style as any).webkitBackfaceVisibility = 'hidden';
      viewportContainer.style.transform = 'translateZ(0)';

      pageWrapper = document.createElement('div');
      pageWrapper.className = 'pdf-page-wrapper relative shadow-md rounded overflow-hidden select-text';
      pageWrapper.style.position = 'relative';
      pageWrapper.style.flex = 'none';
      pageWrapper.style.contain = 'layout paint';
      pageWrapper.style.backfaceVisibility = 'hidden';
      (pageWrapper.style as any).webkitBackfaceVisibility = 'hidden';
      pageWrapper.style.transform = 'translateZ(0)';
      pageWrapper.style.transformOrigin = 'center top';

      visibleCanvas = document.createElement('canvas');
      visibleCanvas.className = 'pdf-canvas block shadow-md rounded bg-white';
      visibleCanvas.style.maxWidth = 'none';
      visibleCanvas.style.maxHeight = 'none';
      visibleCanvas.style.display = 'block';
      visibleCanvas.style.pointerEvents = 'none';

      textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer pdf-text-layer';

      pageWrapper.appendChild(visibleCanvas);
      pageWrapper.appendChild(textLayerDiv);
      viewportContainer.appendChild(pageWrapper);

      // Mouse wheel navigation in buttons mode
      const handleWheel = (event: WheelEvent) => {
        if (this.wheelThrottle) return;
        if (event.deltaY > 30) {
          this.wheelThrottle = true;
          setTimeout(() => {
            this.wheelThrottle = false;
          }, 350);
          void this.next();
        } else if (event.deltaY < -30) {
          this.wheelThrottle = true;
          setTimeout(() => {
            this.wheelThrottle = false;
          }, 350);
          void this.prev();
        }
      };
      viewportContainer.addEventListener('wheel', handleWheel, { passive: true });

      this.container!.appendChild(viewportContainer);
    }

    pageWrapper.style.width = `${cssWidth}px`;
    pageWrapper.style.height = `${cssHeight}px`;
    pageWrapper.style.minWidth = `${cssWidth}px`;
    pageWrapper.style.minHeight = `${cssHeight}px`;
    pageWrapper.style.maxWidth = `${cssWidth}px`;
    pageWrapper.style.maxHeight = `${cssHeight}px`;

    if (this.currentColors) {
      this.applySlotTheme(viewportContainer);
      this.applyCanvasTheme(visibleCanvas);
    }

    return { viewportContainer, pageWrapper, visibleCanvas, textLayerDiv };
  }

  private async renderButtonsMode(
    pageNumber: number,
    zoom: number = 1,
    swapWhenReady: boolean = false,
  ): Promise<void> {
    if (!this.pdfDocument || !this.container) return;
    this.cleanupScroll();
    const generation = ++this.renderGeneration;
    this.isPageTurnInProgress = true;

    try {
      await this.cancelActiveRender();

      if (this.currentPageProxy) {
        try {
          this.currentPageProxy.cleanup();
        } catch {
        }
        this.currentPageProxy = null;
      }

      this.currentPageNumber = pageNumber;
      const pageProxy = await this.pdfDocument.getPage(pageNumber);

      await this.cancelActiveRender();

      this.currentPageProxy = pageProxy;

      this.baseScale = this.computeFitScale(pageProxy);
      const targetScale = this.baseScale * zoom;
      this.currentScale = targetScale;
      const baseViewport = pageProxy.getViewport({ scale: this.baseScale });
      this.basePageSize = {
        width: Math.floor(baseViewport.width),
        height: Math.floor(baseViewport.height),
      };
      this.pageSizeCache.set(pageNumber, this.basePageSize);

      const viewport = pageProxy.getViewport({ scale: targetScale });
      const dpr = this.getCanvasSafeDpr(viewport.width, viewport.height);

      const cssWidth = Math.floor(viewport.width);
      const cssHeight = Math.floor(viewport.height);
      const bufferWidth = Math.floor(cssWidth * dpr);
      const bufferHeight = Math.floor(cssHeight * dpr);

      const { viewportContainer, pageWrapper, visibleCanvas, textLayerDiv } =
        this.ensureButtonsDomStructure(cssWidth, cssHeight);

      // Render onto an offscreen buffer canvas first (double buffering)
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = bufferWidth;
      offscreenCanvas.height = bufferHeight;
      const offscreenContext = offscreenCanvas.getContext('2d', { alpha: false });

      if (!offscreenContext) {
        throw new Error('Failed to obtain 2D canvas context for PDF rendering');
      }

      offscreenContext.imageSmoothingEnabled = true;
      offscreenContext.imageSmoothingQuality = 'high';

      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
      const renderContext = {
        canvasContext: offscreenContext,
        transform,
        viewport,
      };

      const renderTask = this.currentPageProxy.render(renderContext);
      this.activeRenderTask = renderTask;

      try {
        await renderTask.promise;
      } catch (err: unknown) {
        const error = err as { name?: string };
        if (error && error.name === 'RenderingCancelledException') {
          return;
        }
        console.error('[PdfEngine] Error during canvas rendering:', err);
        throw err;
      } finally {
        if (this.activeRenderTask === renderTask) {
          this.activeRenderTask = null;
        }
      }

      if (generation !== this.renderGeneration || !this.container) {
        return;
      }

      const placeholder = pageWrapper.querySelector<HTMLElement>('.pdf-page-placeholder');
      if (placeholder) {
        placeholder.style.display = 'none';
      }

      // Store in LRU cache
      this.pageCache.set({
        pageNumber,
        canvas: offscreenCanvas,
        scale: targetScale,
        cssWidth,
        cssHeight,
        dpr,
      });

      // Atomically swap rendered buffer onto visible canvas
      const atomicSwap = () => {
        if (visibleCanvas.width !== bufferWidth || visibleCanvas.height !== bufferHeight) {
          visibleCanvas.width = bufferWidth;
          visibleCanvas.height = bufferHeight;
        }
        visibleCanvas.style.width = `${cssWidth}px`;
        visibleCanvas.style.height = `${cssHeight}px`;

        const visibleContext = visibleCanvas.getContext('2d', { alpha: false });
        if (visibleContext) {
          visibleContext.imageSmoothingEnabled = true;
          visibleContext.imageSmoothingQuality = 'high';
          visibleContext.drawImage(offscreenCanvas, 0, 0);
        }
        this.applyCanvasTheme(visibleCanvas);

        pageWrapper.style.width = `${cssWidth}px`;
        pageWrapper.style.height = `${cssHeight}px`;
        pageWrapper.style.minWidth = `${cssWidth}px`;
        pageWrapper.style.minHeight = `${cssHeight}px`;
        pageWrapper.style.maxWidth = `${cssWidth}px`;
        pageWrapper.style.maxHeight = `${cssHeight}px`;
      };

      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(atomicSwap);
      }
      atomicSwap();

      textLayerDiv.style.width = `${cssWidth}px`;
      textLayerDiv.style.height = `${cssHeight}px`;
      textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale));

      const textLayerPromise = this.renderButtonsTextLayer(pageProxy, textLayerDiv, viewport);
      if (!swapWhenReady) {
        await textLayerPromise;
      }

      this.restoreHighlightsForPage(pageNumber, pageWrapper);

      this.location = this.getCurrentLocation();
      this.onLocationChange?.(this.location);

      this.pageCache.evictOutsideWindow(pageNumber);
      this.scheduleWindowPreload(pageNumber, targetScale);
    } finally {
      this.isPageTurnInProgress = false;
    }
  }

  private async renderButtonsTextLayer(
    pageProxy: pdfjsLib.PDFPageProxy,
    textLayerDiv: HTMLElement,
    viewport: ReturnType<pdfjsLib.PDFPageProxy['getViewport']>,
  ): Promise<void> {
    try {
      const textContent = await pageProxy.getTextContent();
      textLayerDiv.innerHTML = '';
      if (typeof (pdfjsLib as any).renderTextLayer === 'function') {
        const textLayerTask = (pdfjsLib as any).renderTextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
          textDivs: [],
        });
        if (textLayerTask && textLayerTask.promise) {
          await textLayerTask.promise;
        }
      } else {
        for (const item of textContent.items as TextContentItem[]) {
          if (!item.str) continue;
          const span = document.createElement('span');
          span.textContent = item.str;
          textLayerDiv.appendChild(span);
        }
      }
    } catch (textErr) {
      console.warn('[PdfEngine] Failed to render text layer in buttons mode:', textErr);
    }
  }

  private cleanupScroll(): void {
    if (this.pageObserver) {
      this.pageObserver.disconnect();
      this.pageObserver = null;
    }
    if (this.scrollCleanupListener) {
      this.scrollCleanupListener();
      this.scrollCleanupListener = null;
    }
    this.activeSlotRenderTasks.forEach((task) => {
      try {
        task.cancel();
      } catch {
      }
    });
    this.activeSlotRenderTasks.clear();
    this.renderedPages.clear();
    this.scrollContainer = null;
  }

  private applyCanvasTheme(canvas: HTMLCanvasElement): void {
    if (!this.currentColors) return;
    const dark = isDarkColor(this.currentColors.bg);
    const isPureWhite =
      this.currentColors.bg.toLowerCase() === '#ffffff' || this.currentColors.bg.toLowerCase() === '#fff';

    if (dark) {
      canvas.style.filter = 'invert(0.9) hue-rotate(180deg)';
      canvas.style.mixBlendMode = 'normal';
    } else if (!isPureWhite) {
      canvas.style.filter = 'none';
      canvas.style.mixBlendMode = 'multiply';
    } else {
      canvas.style.filter = 'none';
      canvas.style.mixBlendMode = 'normal';
    }
  }

  private applySlotTheme(slot: HTMLElement): void {
    if (!this.currentColors) return;
    slot.style.backgroundColor = this.currentColors.bg;
  }

  applyTheme(colors: { bg: string; text: string }): void {
    this.currentColors = colors;
    if (!this.container) return;

    const slots = this.container.querySelectorAll<HTMLElement>('.pdf-page-slot, .pdf-page-container');
    slots.forEach((slot) => this.applySlotTheme(slot));

    const canvases = this.container.querySelectorAll<HTMLCanvasElement>('.pdf-canvas');
    canvases.forEach((canvas) => this.applyCanvasTheme(canvas));
  }

  override setHighlights(
    highlights: HighlightRecord[],
    onHighlightClick?: (highlight: HighlightRecord) => void,
  ): void {
    super.setHighlights(highlights, onHighlightClick);
    this.restoreHighlightsAllVisible();
  }

  private restoreHighlightsAllVisible(): void {
    if (!this.scrollContainer) return;
    const slots = this.scrollContainer.querySelectorAll<HTMLElement>('.pdf-page-slot');
    slots.forEach((slot) => {
      const pageNum = parseInt(slot.dataset.pageNumber || '1', 10);
      if (this.renderedPages.has(pageNum)) {
        this.restoreHighlightsForPage(pageNum, slot);
      }
    });
  }

  private restoreHighlightsForPage(pageNumber: number, slot: HTMLElement): void {
    let overlay = slot.querySelector<SVGSVGElement>('.pdf-highlight-overlay');
    if (!overlay) {
      overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      overlay.setAttribute('class', 'pdf-highlight-overlay absolute inset-0 w-full h-full pointer-events-none');
      overlay.style.zIndex = '10';
      slot.appendChild(overlay);
    } else {
      overlay.innerHTML = '';
    }

    const colorMap: Record<string, { fill: string; stroke: string }> = {
      yellow: { fill: 'rgba(254, 240, 138, 0.45)', stroke: '#CA8A04' },
      green: { fill: 'rgba(200, 230, 149, 0.45)', stroke: '#3E5725' },
      pink: { fill: 'rgba(251, 207, 232, 0.45)', stroke: '#DB2777' },
      blue: { fill: 'rgba(186, 230, 253, 0.45)', stroke: '#0284C7' },
      purple: { fill: 'rgba(233, 213, 255, 0.45)', stroke: '#9333EA' },
    };

    const pageHighlights = this.highlights.filter((hl) => {
      if (hl.format !== 'pdf') return false;
      try {
        const parsed = JSON.parse(hl.locator);
        if (parsed && (parsed.page === pageNumber || parsed.locator === String(pageNumber))) return true;
      } catch {}
      const asNum = parseInt(hl.locator, 10);
      return asNum === pageNumber;
    });

    const textLayer = slot.querySelector('.pdf-text-layer');
    if (!textLayer) return;

    for (const hl of pageHighlights) {
      const colors = colorMap[hl.color] || colorMap.green;
      let drawn = false;

      try {
        const parsed = JSON.parse(hl.locator);
        if (parsed && Array.isArray(parsed.rects)) {
          for (const rect of parsed.rects) {
            this.createSvgRect(overlay, rect.x, rect.y, rect.width, rect.height, colors, hl);
            drawn = true;
          }
        } else if (parsed && Array.isArray(parsed.bounds)) {
          const [bx, by, bw, bh] = parsed.bounds;
          this.createSvgRect(overlay, bx, by, bw, bh, colors, hl);
          drawn = true;
        }
      } catch {}

      if (!drawn && hl.selected_text) {
        const spans = Array.from(textLayer.querySelectorAll('span'));
        const textTarget = hl.selected_text.trim();
        const slotRect = slot.getBoundingClientRect();

        for (const span of spans) {
          const spanText = (span.textContent || '').trim();
          if (!spanText) continue;

          // If contextSentence is provided, prefer matching span within context
          if (hl.contextSentence && !hl.contextSentence.includes(spanText) && !spanText.includes(textTarget)) {
            continue;
          }

          const spanLower = spanText.toLowerCase();
          const targetLower = textTarget.toLowerCase();
          if (spanLower.includes(targetLower)) {
            const spanRect = span.getBoundingClientRect();
            const matchIdx = spanLower.indexOf(targetLower);
            const L = spanText.length || 1;
            const startRatio = Math.max(0, Math.min(1, matchIdx / L));
            const widthRatio = Math.max(0, Math.min(1 - startRatio, textTarget.length / L));

            const relX = spanRect.left - slotRect.left + spanRect.width * startRatio;
            const relY = spanRect.top - slotRect.top;
            const relWidth = Math.max(2, spanRect.width * widthRatio);

            this.createSvgRect(overlay, relX, relY, relWidth, spanRect.height, colors, hl);
            drawn = true;
            break; // Stop after first matched occurrence to prevent page-wide proliferation
          }
        }
      }
    }
  }

  private createSvgRect(
    svg: SVGSVGElement,
    x: number,
    y: number,
    width: number,
    height: number,
    colors: { fill: string; stroke: string },
    hl: HighlightRecord,
  ): void {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(Math.round(x)));
    rect.setAttribute('y', String(Math.round(y)));
    rect.setAttribute('width', String(Math.round(width)));
    rect.setAttribute('height', String(Math.round(height)));
    rect.setAttribute('fill', colors.fill);
    rect.setAttribute('stroke', colors.stroke);
    rect.setAttribute('stroke-width', '1.5');
    rect.setAttribute('rx', '2');
    rect.setAttribute('class', 'pointer-events-auto cursor-pointer transition-opacity hover:opacity-80');
    rect.setAttribute('data-highlight-id', hl.id);

    rect.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onHighlightClickCallback?.(hl);
    });

    svg.appendChild(rect);
  }

  getPdfDocument(): pdfjsLib.PDFDocumentProxy | null {
    return this.pdfDocument;
  }

  async getPageProxy(pageNumber: number): Promise<pdfjsLib.PDFPageProxy | null> {
    if (!this.pdfDocument) return null;
    return await this.pdfDocument.getPage(pageNumber);
  }

  getCurrentPageProxy(): pdfjsLib.PDFPageProxy | null {
    return this.currentPageProxy;
  }

  getCurrentPageNumber(): number {
    return this.currentPageNumber;
  }

  async getCurrentPageText(): Promise<string> {
    const pageNum = this.currentPageNumber;
    try {
      const readerStore = useReaderStore();
      if (readerStore.isReflowMode) {
        const cached = readerStore.getCachedReflowBlocks(pageNum);
        if (cached && cached.length > 0) {
          return cached.map((b) => b.text).join('\n\n');
        }
        if (this.pdfDocument) {
          const pageProxy = await this.pdfDocument.getPage(pageNum);
          const blocks = await extractReflowBlocks(pageProxy, pageNum);
          if (blocks.length > 0) {
            readerStore.setCachedReflowBlocks(pageNum, blocks);
            return blocks.map((b) => b.text).join('\n\n');
          }
        }
      }
    } catch {
    }

    try {
      if (this.pdfDocument) {
        const pageProxy = await this.pdfDocument.getPage(pageNum);
        const textContent = await pageProxy.getTextContent();
        const text = textContent.items
          .map((item: any) => item.str || '')
          .join(' ');
        if (text.trim()) {
          return text;
        }
      }
    } catch (err) {
      console.warn('[PdfEngine] Failed to get text content from page proxy:', err);
    }

    const textLayer = this.getActiveTextLayer();
    if (textLayer) {
      const spans = Array.from(textLayer.querySelectorAll('span'));
      return spans.map((s) => s.textContent || '').join(' ');
    }

    return '';
  }

  private getActiveTextLayer(): HTMLElement | null {
    if (!this.container) return null;
    const pageNum = this.currentPageNumber;
    const slot = this.container.querySelector(`.pdf-page-slot[data-page-number="${pageNum}"]`);
    if (slot) {
      return slot.querySelector<HTMLElement>('.pdf-text-layer');
    }
    return this.container.querySelector<HTMLElement>('.pdf-text-layer');
  }

  highlightTtsSentence(sentenceText: string, _sentenceIndex: number): void {
    this.clearTtsHighlight();
    const textLayer = this.getActiveTextLayer();
    if (!textLayer || !sentenceText) return;

    const spans = Array.from(textLayer.querySelectorAll<HTMLElement>('span'));
    const targetWords = sentenceText
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[.,!?;:«»""''()]/g, ''))
      .filter((w) => w.length > 1);

    if (targetWords.length === 0) return;

    let firstActiveSpan: HTMLElement | null = null;

    for (const span of spans) {
      const spanText = (span.textContent || '').toLowerCase();
      if (!spanText.trim()) continue;

      const matches = targetWords.some((word) => spanText.includes(word));
      if (matches) {
        span.classList.add('tts-active-span');
        if (!firstActiveSpan) {
          firstActiveSpan = span;
        }
      }
    }

    if (firstActiveSpan) {
      firstActiveSpan.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  clearTtsHighlight(): void {
    if (!this.container) return;
    const highlighted = this.container.querySelectorAll('.tts-active-span');
    highlighted.forEach((el) => el.classList.remove('tts-active-span'));
  }

  override destroy(): void {
    if (this.rapidNavDebounceTimer) {
      clearTimeout(this.rapidNavDebounceTimer);
      this.rapidNavDebounceTimer = null;
    }
    this.cancelPreload();
    this.pageCache.clear();
    this.pageSizeCache.clear();

    if (this.container && this.touchStartListener && this.touchEndListener) {
      this.container.removeEventListener('touchstart', this.touchStartListener);
      this.container.removeEventListener('touchend', this.touchEndListener);
      this.container.removeEventListener('touchcancel', this.touchEndListener);
      this.touchStartListener = null;
      this.touchEndListener = null;
    }

    this.clearTtsHighlight();
    this.detachVisibilityListener();
    this.disconnectResizeObserver();
    this.cleanupScroll();

    if (this.gestureController) {
      this.gestureController.destroy();
      this.gestureController = null;
    }

    if (this.container) {
      const zoomableContainer = this.container as ZoomableContainerElement;
      delete zoomableContainer.__readerSetZoom;
      delete zoomableContainer.__readerResetZoom;
      delete zoomableContainer.__readerCanRenderZoom;
      delete zoomableContainer.__readerGetContentSize;
      delete zoomableContainer.__readerGetScrollContainer;
      this.container.innerHTML = '';
    }

    if (this.activeRenderTask) {
      try {
        this.activeRenderTask.cancel();
      } catch {
      }
      this.activeRenderTask = null;
    }

    if (this.currentPageProxy) {
      try {
        this.currentPageProxy.cleanup();
      } catch {
      }
      this.currentPageProxy = null;
    }

    if (this.pdfDocument) {
      try {
        this.pdfDocument.destroy();
      } catch {
      }
      this.pdfDocument = null;
    }

    super.destroy();
  }
}
