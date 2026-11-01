import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Fb2Engine } from '~/services/engines/Fb2Engine';
import { PdfEngine } from '~/services/engines/PdfEngine';
import { EpubEngine } from '~/services/engines/EpubEngine';
import * as pdfjsLib from 'pdfjs-dist';
import { mockPdfDocument, mockPdfPage } from '../../mocks/book-engines';

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  renderTextLayer: vi.fn().mockImplementation(() => ({
    promise: Promise.resolve(),
    cancel: vi.fn(),
  })),
  version: '3.11.174',
  GlobalWorkerOptions: { workerSrc: '' },
}));

const mockRendition = {
  display: vi.fn().mockResolvedValue(undefined),
  next: vi.fn().mockResolvedValue(undefined),
  prev: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn(),
  on: vi.fn(),
  hooks: {
    content: {
      register: vi.fn(),
    },
  },
  themes: {
    default: vi.fn(),
    fontSize: vi.fn(),
  },
  getContents: vi.fn().mockReturnValue([]),
  currentLocation: vi.fn().mockReturnValue({
    start: { cfi: 'test-cfi', percentage: 0.1 },
  }),
};

const mockBook = {
  ready: Promise.resolve(),
  renderTo: vi.fn().mockReturnValue(mockRendition),
  locations: {
    generate: vi.fn().mockResolvedValue([]),
    percentageFromCfi: vi.fn().mockReturnValue(0.1),
    length: vi.fn().mockReturnValue(10),
  },
  destroy: vi.fn(),
};

vi.mock('epubjs', () => ({
  default: vi.fn().mockImplementation(() => mockBook),
}));

describe('Engine Font Size Implementations', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  describe('Fb2Engine', () => {
    const sampleFb2Xml = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <body>
    <section>
      <title><p>Title</p></title>
      <p>Paragraph content</p>
    </section>
  </body>
</FictionBook>`;

    it('renders paragraphs without text-base override and applies font size to container', async () => {
      const fb2Engine = new Fb2Engine();
      await fb2Engine.init(container, sampleFb2Xml);

      const p = container.querySelector('p.fb2-paragraph');
      expect(p).not.toBeNull();
      expect(p?.className).not.toContain('text-base');
      expect(p?.className).toContain('text-[length:inherit]');

      const article = container.querySelector('article');
      expect(article?.style.fontSize).toBe('18px');

      fb2Engine.setFontSize(24);
      expect(article?.style.fontSize).toBe('24px');
    });
  });

  describe('PdfEngine', () => {
    beforeEach(() => {
      (pdfjsLib.getDocument as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        promise: Promise.resolve(mockPdfDocument),
      });
    });

    it('translates font size into proportional canvas scale and triggers setZoom', async () => {
      const pdfEngine = new PdfEngine();
      await pdfEngine.init(container, new Uint8Array([1, 2, 3]));

      const setZoomSpy = vi.spyOn(pdfEngine, 'setZoom');

      // 18px baseline -> 1.0x scale
      await pdfEngine.setFontSize(18);
      expect(setZoomSpy).toHaveBeenCalledWith(1.0);

      // 27px -> 1.5x scale
      await pdfEngine.setFontSize(27);
      expect(setZoomSpy).toHaveBeenCalledWith(1.5);
    });
  });

  describe('EpubEngine', () => {
    it('applies font size via rendition.themes.fontSize and custom stylesheet injection', async () => {
      const epubEngine = new EpubEngine();
      await epubEngine.init(container, new Uint8Array([1, 2, 3]));

      const testDoc = document.implementation.createHTMLDocument('epub-content');
      mockRendition.getContents.mockReturnValue([{ document: testDoc }]);

      epubEngine.setFontSize(22);

      expect(mockRendition.themes.fontSize).toHaveBeenCalledWith('22px');

      const injectedStyle = testDoc.getElementById('bookstery-font-size-style');
      expect(injectedStyle).not.toBeNull();
      expect(injectedStyle?.textContent).toContain('font-size: 22px !important;');
    });
  });
});
