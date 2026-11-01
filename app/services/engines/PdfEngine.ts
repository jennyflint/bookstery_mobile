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

  /** Available reader size in CSS pixels, with window fallbacks while layout is not settled yet. */
  private getContainerSize(): { width: number; height: number } {
    const width = this.container?.clientWidth ?? 0;
    const height = this.container?.clientHeight ?? 0;
    return {
      width: width > 0 ? width : window.innerWidth || 360,
      height: height > 0 ? height : window.innerHeight || 640,
    };
  }

  /**
   * Fit-to-screen scale for a page. `getViewport` already applies the page's built-in
   * rotation, so landscape scans and rotated pages are measured in their displayed orientation.
   */
  private computeFitScale(page: pdfjsLib.PDFPageProxy): number {
    const intrinsic = page.getViewport({ scale: 1 });
    if (!(intrinsic.width > 0) || !(intrinsic.height > 0)) {
      return 1;
    }
    const { width, height } = this.getContainerSize();
    const scaleX = (width - FIT_MARGIN_PX) / intrinsic.width;
    const scaleY = (height - FIT_MARGIN_PX) / intrinsic.height;
    return Math.max(Math.min(scaleX, scaleY, 2.5), 0.2);
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

  private observeContainerResize(): void {
    this.disconnectResizeObserver();
    if (!this.container || typeof ResizeObserver === 'undefined') {
      return;
    }
    this.lastLayoutSize = { width: this.container.clientWidth, height: this.container.clientHeight };
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.container) return;
      const next = { width: this.container.clientWidth, height: this.container.clientHeight };
      const prev = this.lastLayoutSize;
      if (next.width <= 0 || next.height <= 0) return;
      if (prev && Math.abs(next.width - prev.width) < 2 && Math.abs(next.height - prev.height) < 2) {
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
    // Scroll mode stacks many pages, so gestures only scale them with CSS there.
    zoomableContainer.__readerCanRenderZoom = () => this.paginationMode !== 'scroll';
    zoomableContainer.__readerGetContentSize = () =>
      this.paginationMode === 'scroll' ? null : this.basePageSize;

    if (!container.closest('[data-testid="reader-viewport"]')) {
      this.gestureController?.destroy();
      this.gestureController = new PinchZoomController({
        wrapper: container,
        target: container,
        minScale: 1.0,
        maxScale: 4.0,
        doubleTapScale: 2.5,
        doubleTapDelayMs: 300,
        debounceMs: 200,
        onZoomRender: (scale: number) => this.setZoom(scale),
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
    let docSource: pdfjsLib.DocumentInitParameters | string;

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
      await this.renderButtonsMode(pageNum);
    }
  }

  /** `zoom` is relative to the fit-to-screen scale, so 1.0 always means the default page size. */
  override async setZoom(zoom: number): Promise<void> {
    if (!this.pdfDocument || !this.container) {
      return;
    }
    const clampedZoom = Math.min(Math.max(zoom, 0.5), 4.0);
    this.zoomScale = clampedZoom;

    if (this.paginationMode === 'scroll') {
      return;
    }
    await this.renderButtonsMode(this.currentPageNumber, clampedZoom, true);
  }

  override async setFontSize(size: number): Promise<void> {
    this.currentFontSize = Math.min(Math.max(Math.round(size), 12), 36);
    const fontScale = this.currentFontSize / 18;
    const targetScale = Math.min(Math.max(fontScale, 0.6), 3.0);
    await this.setZoom(targetScale);
  }

  override getZoom(): number {
    return this.gestureController ? this.gestureController.getState().scale : this.zoomScale;
  }

  override resetZoom(skipReRender: boolean = false): void {
    const wasZoomed = this.zoomScale !== 1.0;
    this.zoomScale = 1.0;
    this.currentScale = this.baseScale;
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
      'pdf-scroll-container relative w-full h-full overflow-y-auto overflow-x-hidden flex flex-col items-center py-6 px-2 space-y-6 select-text';
    scrollWrapper.style.webkitOverflowScrolling = 'touch';
    this.container.appendChild(scrollWrapper);
    this.scrollContainer = scrollWrapper;

    const firstPage = await this.pdfDocument.getPage(1);
    const initialViewport = firstPage.getViewport({ scale: 1 });
    const containerWidth = Math.max(this.container.clientWidth, 320);
    const targetScale = Math.max(
      Math.min((containerWidth - FIT_MARGIN_PX) / (initialViewport.width || 1), 2.0),
      0.4,
    );
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
      pageSlot.style.minHeight = `${expectedHeight}px`;

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

        const slots = this.scrollContainer.querySelectorAll<HTMLElement>('.pdf-page-slot');
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

      slot.style.position = 'relative';
      slot.style.width = `${Math.floor(viewport.width)}px`;
      slot.style.height = `${Math.floor(viewport.height)}px`;
      slot.style.minHeight = `${Math.floor(viewport.height)}px`;
      slot.innerHTML = '';

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-canvas block bg-white';
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      canvas.style.display = 'block';
      canvas.style.pointerEvents = 'none';

      const canvasContext = canvas.getContext('2d', { alpha: false });

      if (!canvasContext) {
        pageProxy.cleanup();
        return;
      }

      canvasContext.imageSmoothingEnabled = true;
      canvasContext.imageSmoothingQuality = 'high';

      slot.appendChild(canvas);
      if (this.currentColors) {
        this.applySlotTheme(slot);
        this.applyCanvasTheme(canvas);
      }

      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer pdf-text-layer';
      textLayerDiv.style.width = `${Math.floor(viewport.width)}px`;
      textLayerDiv.style.height = `${Math.floor(viewport.height)}px`;
      textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale));
      slot.appendChild(textLayerDiv);

      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
      const renderContext = {
        canvasContext,
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

  private async renderButtonsMode(
    pageNumber: number,
    zoom: number = 1,
    swapWhenReady: boolean = false,
  ): Promise<void> {
    if (!this.pdfDocument || !this.container) return;
    this.cleanupScroll();
    const generation = ++this.renderGeneration;

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

    if (this.currentPageProxy) {
      try {
        this.currentPageProxy.cleanup();
      } catch {
      }
    }
    this.currentPageProxy = pageProxy;

    // Zoom re-renders keep the old page on screen until the new canvas is ready, avoiding a blank flash.
    if (!swapWhenReady) {
      this.container.innerHTML = '';
    }

    const viewportContainer = document.createElement('div');
    viewportContainer.className =
      'pdf-page-container relative flex justify-center items-center select-text w-full h-full overflow-hidden';

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-canvas block shadow-md rounded bg-white';
    const canvasContext = canvas.getContext('2d', { alpha: false });

    if (!canvasContext) {
      throw new Error('Failed to obtain 2D canvas context for PDF rendering');
    }

    canvasContext.imageSmoothingEnabled = true;
    canvasContext.imageSmoothingQuality = 'high';

    this.baseScale = this.computeFitScale(pageProxy);
    const targetScale = this.baseScale * zoom;
    this.currentScale = targetScale;
    const baseViewport = pageProxy.getViewport({ scale: this.baseScale });
    this.basePageSize = {
      width: Math.floor(baseViewport.width),
      height: Math.floor(baseViewport.height),
    };
    const viewport = pageProxy.getViewport({ scale: targetScale });
    const dpr = this.getCanvasSafeDpr(viewport.width, viewport.height);

    // Wrapper, canvas and text layer share the exact logical size; only the canvas buffer is scaled by DPR.
    const cssWidth = Math.floor(viewport.width);
    const cssHeight = Math.floor(viewport.height);

    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'pdf-page-wrapper relative shadow-md rounded overflow-hidden select-text';
    pageWrapper.style.position = 'relative';
    pageWrapper.style.flex = 'none';
    pageWrapper.style.width = `${cssWidth}px`;
    pageWrapper.style.height = `${cssHeight}px`;

    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.style.maxWidth = 'none';
    canvas.style.maxHeight = 'none';
    canvas.style.display = 'block';
    canvas.style.pointerEvents = 'none';
    canvasContext.setTransform(1, 0, 0, 1, 0, 0);
    canvasContext.clearRect(0, 0, canvas.width, canvas.height);

    pageWrapper.appendChild(canvas);
    if (this.currentColors) {
      this.applySlotTheme(viewportContainer);
      this.applyCanvasTheme(canvas);
    }

    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer pdf-text-layer';
    textLayerDiv.style.width = `${cssWidth}px`;
    textLayerDiv.style.height = `${cssHeight}px`;
    textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale));
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
        this.next();
      } else if (event.deltaY < -30) {
        this.wheelThrottle = true;
        setTimeout(() => {
          this.wheelThrottle = false;
        }, 350);
        this.prev();
      }
    };
    viewportContainer.addEventListener('wheel', handleWheel, { passive: true });

    if (!swapWhenReady) {
      this.container.appendChild(viewportContainer);
    }

    const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
    const renderContext = {
      canvasContext,
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

    if (swapWhenReady) {
      this.container.innerHTML = '';
      this.container.appendChild(viewportContainer);
    }

    const textLayerPromise = this.renderButtonsTextLayer(pageProxy, textLayerDiv, viewport);
    // The swap and the gesture controller's CSS reset must happen in the same frame, so
    // zoom re-renders do not wait for the (invisible) text layer.
    if (!swapWhenReady) {
      await textLayerPromise;
    }

    this.location = this.getCurrentLocation();
    this.onLocationChange?.(this.location);
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
        if (parsed && parsed.page === pageNumber) return true;
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
          if (spanText && (spanText.includes(textTarget) || textTarget.includes(spanText))) {
            const spanRect = span.getBoundingClientRect();
            const relX = spanRect.left - slotRect.left;
            const relY = spanRect.top - slotRect.top;
            this.createSvgRect(overlay, relX, relY, spanRect.width, spanRect.height, colors, hl);
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
