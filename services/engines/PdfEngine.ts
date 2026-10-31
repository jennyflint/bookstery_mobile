import * as pdfjsLib from 'pdfjs-dist';
// @ts-expect-error Vite URL import for pdf.worker
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { BaseEngine } from './BaseEngine';
import type { ReaderLocation } from '../../types';

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

export class PdfEngine extends BaseEngine {
  private pdfDocument: pdfjsLib.PDFDocumentProxy | null = null;
  private currentPageProxy: pdfjsLib.PDFPageProxy | null = null;
  private activeRenderTask: pdfjsLib.RenderTask | null = null;
  private currentPageNumber: number = 1;
  private totalPagesCount: number = 0;

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

      await this.renderPage(this.currentPageNumber);
    } catch (err) {
      console.error('[PdfEngine] Failed to initialize PDF document:', err);
      throw err;
    }
  }

  async goTo(locator: string): Promise<void> {
    const pageNum = parseInt(locator, 10);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > this.totalPagesCount) {
      return;
    }
    await this.renderPage(pageNum);
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
    const percentage = this.totalPagesCount > 0
      ? Number(((this.currentPageNumber / this.totalPagesCount) * 100).toFixed(2))
      : 0;

    return {
      locator: String(this.currentPageNumber),
      progressPercentage: percentage,
      currentPage: this.currentPageNumber,
      totalPages: this.totalPagesCount,
    };
  }

  private async renderPage(pageNumber: number): Promise<void> {
    if (!this.pdfDocument || !this.container) {
      return;
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

    this.currentPageNumber = pageNumber;
    this.currentPageProxy = await this.pdfDocument.getPage(pageNumber);

    this.container.innerHTML = '';

    const viewportContainer = document.createElement('div');
    viewportContainer.className =
      'pdf-page-container relative flex justify-center items-center select-text w-full h-full';

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

    const textLayerDiv = document.createElement('div');
    textLayerDiv.className =
      'pdf-text-layer absolute top-0 left-0 overflow-hidden pointer-events-auto leading-none';
    textLayerDiv.style.width = `${Math.floor(viewport.width)}px`;
    textLayerDiv.style.height = `${Math.floor(viewport.height)}px`;
    viewportContainer.appendChild(textLayerDiv);

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
  }

  destroy(): void {
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
