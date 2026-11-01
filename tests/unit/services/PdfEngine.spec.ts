import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfEngine } from '~/services/engines/PdfEngine';
import { mockPdfDocument, mockPdfPage, mockRenderTask } from '../../mocks/book-engines';

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  renderTextLayer: vi.fn().mockImplementation((params: any) => {
    if (params?.container && params?.textContentSource?.items) {
      for (const item of params.textContentSource.items) {
        if (!item.str) continue;
        const span = document.createElement('span');
        span.textContent = item.str;
        params.container.appendChild(span);
      }
    }
    return {
      promise: Promise.resolve(),
      cancel: vi.fn(),
    };
  }),
  version: '3.11.174',
  GlobalWorkerOptions: { workerSrc: '' },
}));

describe('PdfEngine', () => {
  let engine: PdfEngine;
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    (pdfjsLib.getDocument as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      promise: Promise.resolve(mockPdfDocument),
    });

    engine = new PdfEngine();
  });

  it('should initialize and render in scroll mode by default', async () => {
    await engine.init(container, new Uint8Array([1, 2, 3]));

    expect(mockPdfDocument.getPage).toHaveBeenCalledWith(1);
    expect(mockPdfPage.render).toHaveBeenCalled();

    const scrollContainer = container.querySelector('.pdf-scroll-container');
    expect(scrollContainer).not.toBeNull();

    const slots = container.querySelectorAll('.pdf-page-slot');
    expect(slots.length).toBe(10);

    const location = engine.getCurrentLocation();
    expect(location.locator).toBe('1');
    expect(location.currentPage).toBe(1);
    expect(location.totalPages).toBe(10);
  });

  it('should switch to buttons mode and navigate pages', async () => {
    await engine.init(container, new Uint8Array([1, 2, 3]));
    await engine.setPaginationMode('buttons');

    const singleContainer = container.querySelector('.pdf-page-container');
    expect(singleContainer).not.toBeNull();

    const cleanupSpy = mockPdfPage.cleanup;

    await engine.goTo('2');
    expect(cleanupSpy).toHaveBeenCalled();

    await engine.next();
    expect(engine.getCurrentLocation().currentPage).toBe(3);

    await engine.prev();
    expect(engine.getCurrentLocation().currentPage).toBe(2);
  });

  it('should cleanup resources on destroy', async () => {
    await engine.init(container, new Uint8Array([1, 2, 3]));
    engine.destroy();

    expect(mockPdfPage.cleanup).toHaveBeenCalled();
    expect(mockPdfDocument.destroy).toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
  });

  it('should apply clamped DPR scaling to canvas buffer while keeping logical CSS and TextLayer dimensions', async () => {
    const originalDpr = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 3.5,
      configurable: true,
      writable: true,
    });

    mockPdfPage.getViewport.mockImplementation(({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
      scale,
    }));

    try {
      await engine.init(container, new Uint8Array([1, 2, 3]));

      const canvas = container.querySelector<HTMLCanvasElement>('.pdf-canvas');
      const textLayer = container.querySelector<HTMLElement>('.pdf-text-layer');
      expect(canvas).not.toBeNull();
      expect(textLayer).not.toBeNull();

      // Scale in default test container (320px min width -> (320 - 32) / 600 = 0.48)
      // Logical viewport: 288 x 384; Clamped DPR: 2.5 -> 720 x 960
      expect(canvas!.width).toBe(Math.floor(288 * 2.5));
      expect(canvas!.height).toBe(Math.floor(384 * 2.5));
      expect(canvas!.style.width).toBe('288px');
      expect(canvas!.style.height).toBe('384px');

      expect(textLayer!.style.width).toBe('288px');
      expect(textLayer!.style.height).toBe('384px');
      expect(textLayer!.style.getPropertyValue('--scale-factor')).toBe('0.48');

      expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d', { alpha: false });
      expect(mockPdfPage.render).toHaveBeenCalledWith(
        expect.objectContaining({
          transform: [2.5, 0, 0, 2.5, 0, 0],
        }),
      );
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', {
        value: originalDpr,
        configurable: true,
        writable: true,
      });
      mockPdfPage.getViewport.mockReturnValue({ width: 600, height: 800 });
    }
  });

  it('should omit transform when DPR is 1 and handle RenderingCancelledException gracefully', async () => {
    const originalDpr = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 1,
      configurable: true,
      writable: true,
    });

    try {
      await engine.init(container, new Uint8Array([1, 2, 3]));
      await engine.setPaginationMode('buttons');

      expect(mockPdfPage.render).toHaveBeenLastCalledWith(
        expect.objectContaining({
          transform: undefined,
        }),
      );

      let rejectFirstRender: ((reason?: unknown) => void) | null = null;
      const pendingPromise = new Promise<void>((_, reject) => {
        rejectFirstRender = reject;
      });
      const firstCancelSpy = vi.fn(() => {
        const err = new Error('Rendering cancelled');
        err.name = 'RenderingCancelledException';
        rejectFirstRender?.(err);
      });

      mockPdfPage.render
        .mockReturnValueOnce({
          promise: pendingPromise,
          cancel: firstCancelSpy,
        })
        .mockReturnValueOnce(mockRenderTask);

      const firstNav = engine.goTo('2');
      await Promise.resolve();
      const secondNav = engine.goTo('3');

      await expect(Promise.all([firstNav, secondNav])).resolves.not.toThrow();
      expect(firstCancelSpy).toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', {
        value: originalDpr,
        configurable: true,
        writable: true,
      });
    }
  });

  it('should support high-DPI zoom re-rendering and automatically reset zoom on page change', async () => {
    await engine.init(container, new Uint8Array([1, 2, 3]));
    await engine.setPaginationMode('buttons');

    const baseScale = mockPdfPage.getViewport.mock.calls.at(-1)?.[0]?.scale as number;
    await engine.setZoom(2.5);
    expect(mockPdfPage.getViewport).toHaveBeenLastCalledWith({ scale: baseScale * 2.5 });

    const resetSpy = vi.spyOn(engine, 'resetZoom');
    await engine.next();
    expect(resetSpy).toHaveBeenCalled();
    expect(engine.getZoom()).toBe(1);
  });

  it('should align .textLayer with exact viewport dimensions and invoke pdfjsLib.renderTextLayer', async () => {
    await engine.init(container, new Uint8Array([1, 2, 3]));
    await engine.setPaginationMode('buttons');

    const pageWrapper = container.querySelector<HTMLElement>('.pdf-page-wrapper');
    expect(pageWrapper).not.toBeNull();
    expect(pageWrapper!.style.position).toBe('relative');

    const canvas = pageWrapper!.querySelector<HTMLCanvasElement>('.pdf-canvas');
    const textLayer = pageWrapper!.querySelector<HTMLElement>('.textLayer');

    expect(canvas).not.toBeNull();
    expect(textLayer).not.toBeNull();
    expect(canvas!.style.pointerEvents).toBe('none');

    expect(pdfjsLib.renderTextLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        container: textLayer,
        viewport: expect.any(Object),
        textDivs: [],
      }),
    );

    expect(textLayer!.classList.contains('textLayer')).toBe(true);
    expect(textLayer!.style.getPropertyValue('--scale-factor')).toBeDefined();
  });

  it('should re-fit the page when the container is resized', async () => {
    vi.useFakeTimers();
    let notifyResize: (() => void) | null = null;
    class FakeResizeObserver {
      constructor(cb: () => void) {
        notifyResize = cb;
      }
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    const setSize = (width: number, height: number): void => {
      Object.defineProperty(container, 'clientWidth', { value: width, configurable: true });
      Object.defineProperty(container, 'clientHeight', { value: height, configurable: true });
    };

    try {
      mockPdfPage.getViewport.mockImplementation(({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
        scale,
      }));
      setSize(632, 832);
      await engine.init(container, new Uint8Array([1, 2, 3]));
      await engine.setPaginationMode('buttons');

      const canvasBefore = container.querySelector<HTMLCanvasElement>('.pdf-canvas');
      expect(canvasBefore!.style.width).toBe('600px');

      setSize(332, 432);
      notifyResize!();
      await vi.advanceTimersByTimeAsync(200);

      const canvasAfter = container.querySelector<HTMLCanvasElement>('.pdf-canvas');
      expect(canvasAfter!.style.width).toBe('300px');
      expect(canvasAfter!.style.height).toBe('400px');
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('should await the cancelled render before starting a new one on the same page', async () => {
    await engine.init(container, new Uint8Array([1, 2, 3]));
    await engine.setPaginationMode('buttons');

    const order: string[] = [];
    let rejectRender: ((reason?: unknown) => void) | null = null;
    const pending = new Promise<void>((_, reject) => {
      rejectRender = reject;
    });
    const cancel = vi.fn(() => {
      order.push('cancel');
      const err = new Error('cancelled');
      err.name = 'RenderingCancelledException';
      setTimeout(() => {
        order.push('settled');
        rejectRender?.(err);
      }, 0);
    });
    mockPdfPage.render
      .mockReturnValueOnce({ promise: pending, cancel })
      .mockImplementationOnce(() => {
        order.push('render');
        return mockRenderTask;
      });

    const first = engine.setZoom(2);
    await Promise.resolve();
    await Promise.resolve();
    const second = engine.setZoom(3);
    await Promise.all([first, second]);

    expect(order.indexOf('settled')).toBeLessThan(order.indexOf('render'));
  });
});

