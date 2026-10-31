import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfEngine } from '../../../services/engines/PdfEngine';
import { mockPdfDocument, mockPdfPage, mockRenderTask } from '../../mocks/book-engines';

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
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

  it('should initialize and render page into canvas', async () => {
    await engine.init(container, new Uint8Array([1, 2, 3]));

    expect(mockPdfDocument.getPage).toHaveBeenCalledWith(1);
    expect(mockPdfPage.render).toHaveBeenCalled();

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();

    const location = engine.getCurrentLocation();
    expect(location.locator).toBe('1');
    expect(location.currentPage).toBe(1);
    expect(location.totalPages).toBe(10);
  });

  it('should cancel in-flight render task and cleanup page on rapid page navigation', async () => {
    await engine.init(container, new Uint8Array([1, 2, 3]));

    const cancelSpy = mockRenderTask.cancel;
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
});
