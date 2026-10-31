import * as pdfjsLib from 'pdfjs-dist';
// @ts-expect-error Vite URL import for pdf.worker
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { BaseEngine } from './BaseEngine';
import type { ReaderLocation, ReaderPaginationMode } from '../../types';

interface TextContentItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function initPdfWorker(): void {
  if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        pdfWorkerUrl ||
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;
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
  private currentScale: number = 1.0;
  private visibilityHandler: (() => void) | null = null;
  private currentColors: { bg: string; text: string } | null = null;

  async init(
    container: HTMLElement,
    data: Uint8Array | ArrayBuffer | string | Blob,
  ): Promise<void> {
    this.container = container;
    this.container.innerHTML = '';

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
      this.currentPageNumber = 1;

      this.attachVisibilityListener();

      if (this.paginationMode === 'scroll') {
        await this.renderScrollMode();
      } else {
        await this.renderButtonsMode(this.currentPageNumber);
      }
    } catch (err) {
      console.error('[PdfEngine] Failed to initialize PDF document:', err);
      throw err;
    }
  }

  async setPaginationMode(mode: ReaderPaginationMode): Promise<void> {
    if (this.paginationMode === mode && this.container?.children.length) {
      return;
    }
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

    if (this.paginationMode === 'scroll') {
      this.scrollToPage(pageNum);
    } else {
      await this.renderButtonsMode(pageNum);
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
      'pdf-scroll-container w-full h-full overflow-y-auto overflow-x-hidden flex flex-col items-center py-6 px-2 space-y-6 select-text';
    scrollWrapper.style.scrollBehavior = 'smooth';
    scrollWrapper.style.webkitOverflowScrolling = 'touch';
    this.container.appendChild(scrollWrapper);
    this.scrollContainer = scrollWrapper;

    const firstPage = await this.pdfDocument.getPage(1);
    const initialViewport = firstPage.getViewport({ scale: 1 });
    const containerWidth = Math.max(this.container.clientWidth, 320);
    const targetScale = Math.max(Math.min((containerWidth - 32) / initialViewport.width, 2.0), 0.4);
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
        if (!this.scrollContainer) return;
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

    try {
      const pageProxy = await this.pdfDocument.getPage(pageNumber);
      const viewport = pageProxy.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-canvas block w-full h-auto bg-white';
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const canvasContext = canvas.getContext('2d');

      if (!canvasContext) {
        pageProxy.cleanup();
        return;
      }

      slot.innerHTML = '';
      slot.appendChild(canvas);
      if (this.currentColors) {
        this.applySlotTheme(slot);
        this.applyCanvasTheme(canvas);
      }

      const textLayerDiv = document.createElement('div');
      textLayerDiv.className =
        'pdf-text-layer absolute top-0 left-0 overflow-hidden pointer-events-auto leading-none w-full h-full';
      slot.appendChild(textLayerDiv);

      const renderTask = pageProxy.render({
        canvasContext,
        viewport,
      });
      this.activeSlotRenderTasks.set(pageNumber, renderTask);

      await renderTask.promise;
      this.renderedPages.add(pageNumber);
      this.activeSlotRenderTasks.delete(pageNumber);

      try {
        const textContent = await pageProxy.getTextContent();
        for (const item of textContent.items as TextContentItem[]) {
          if (!item.str) continue;
          const span = document.createElement('span');
          span.textContent = item.str;
          span.className = 'text-transparent select-text cursor-text';
          textLayerDiv.appendChild(span);
        }
      } catch {
      }

      pageProxy.cleanup();
    } catch (err) {
      this.renderedPages.delete(pageNumber);
      this.activeSlotRenderTasks.delete(pageNumber);
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

  private scrollToPage(pageNumber: number): void {
    if (!this.scrollContainer) return;
    const slot = this.scrollContainer.querySelector<HTMLElement>(`#pdf-page-slot-${pageNumber}`);
    if (slot) {
      this.scrollContainer.scrollTo({
        top: slot.offsetTop - 16,
        behavior: 'smooth',
      });
      this.currentPageNumber = pageNumber;
      this.location = this.getCurrentLocation();
      this.onLocationChange?.(this.location);
    }
  }

  private async renderButtonsMode(pageNumber: number): Promise<void> {
    if (!this.pdfDocument || !this.container) return;
    this.cleanupScroll();

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

    this.currentPageNumber = pageNumber;
    this.currentPageProxy = await this.pdfDocument.getPage(pageNumber);

    this.container.innerHTML = '';

    const viewportContainer = document.createElement('div');
    viewportContainer.className =
      'pdf-page-container relative flex justify-center items-center select-text w-full h-full overflow-hidden';

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-canvas block shadow-md rounded bg-white';
    const canvasContext = canvas.getContext('2d');

    if (!canvasContext) {
      throw new Error('Failed to obtain 2D canvas context for PDF rendering');
    }

    const containerWidth =
      this.container.clientWidth > 0 ? this.container.clientWidth : window.innerWidth || 360;
    const containerHeight =
      this.container.clientHeight > 0 ? this.container.clientHeight : window.innerHeight || 640;

    const initialViewport = this.currentPageProxy.getViewport({ scale: 1 });
    const scaleX = (containerWidth - 32) / initialViewport.width;
    const scaleY = (containerHeight - 32) / initialViewport.height;
    const targetScale = Math.max(Math.min(scaleX, scaleY, 2.5), 0.2);
    const viewport = this.currentPageProxy.getViewport({ scale: targetScale });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    viewportContainer.appendChild(canvas);
    if (this.currentColors) {
      this.applySlotTheme(viewportContainer);
      this.applyCanvasTheme(canvas);
    }

    const textLayerDiv = document.createElement('div');
    textLayerDiv.className =
      'pdf-text-layer absolute top-0 left-0 overflow-hidden pointer-events-auto leading-none';
    textLayerDiv.style.width = `${Math.floor(viewport.width)}px`;
    textLayerDiv.style.height = `${Math.floor(viewport.height)}px`;
    viewportContainer.appendChild(textLayerDiv);

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

    this.container.appendChild(viewportContainer);

    this.activeRenderTask = this.currentPageProxy.render({
      canvasContext,
      viewport,
    });

    try {
      await this.activeRenderTask.promise;
    } catch (err: unknown) {
      const error = err as { name?: string };
      if (error && error.name === 'RenderingCancelledException') {
        return;
      }
      console.error('[PdfEngine] Error during canvas rendering:', err);
      throw err;
    } finally {
      this.activeRenderTask = null;
    }

    try {
      const textContent = await this.currentPageProxy.getTextContent();
      for (const item of textContent.items as TextContentItem[]) {
        if (!item.str) continue;
        const span = document.createElement('span');
        span.textContent = item.str;
        span.className = 'text-transparent select-text cursor-text';
        textLayerDiv.appendChild(span);
      }
    } catch {
    }

    this.location = this.getCurrentLocation();
    this.onLocationChange?.(this.location);
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

  destroy(): void {
    this.detachVisibilityListener();
    this.cleanupScroll();

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
