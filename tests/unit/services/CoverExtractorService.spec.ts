import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { CoverExtractorService } from '../../../app/services/covers/CoverExtractorService';

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  version: '3.11.174',
  GlobalWorkerOptions: {
    workerSrc: '',
  },
}));

describe('CoverExtractorService', () => {
  let service: CoverExtractorService;
  let mockPage: {
    getViewport: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    cleanup: ReturnType<typeof vi.fn>;
  };
  let mockDoc: {
    numPages: number;
    getPage: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPage = {
      getViewport: vi.fn().mockImplementation(({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
      })),
      render: vi.fn().mockReturnValue({
        promise: Promise.resolve(),
      }),
      cleanup: vi.fn(),
    };

    mockDoc = {
      numPages: 5,
      getPage: vi.fn().mockResolvedValue(mockPage),
      destroy: vi.fn().mockResolvedValue(undefined),
    };

    (pdfjsLib.getDocument as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      promise: Promise.resolve(mockDoc),
    });

    service = new CoverExtractorService();
  });

  describe('PDF Cover Extraction', () => {
    it('should extract cover from PDF page 1 and clean up resources immediately', async () => {
      const dummyPdfData = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]);
      const result = await service.extractCover('pdf', dummyPdfData);

      expect(result).not.toBeNull();
      expect(result instanceof Uint8Array).toBe(true);
      expect(mockDoc.getPage).toHaveBeenCalledWith(1);
      expect(mockPage.render).toHaveBeenCalled();
      expect(mockPage.cleanup).toHaveBeenCalled();
      expect(mockDoc.destroy).toHaveBeenCalled();
    });

    it('should return null when PDF document contains zero pages and destroy doc', async () => {
      mockDoc.numPages = 0;
      const dummyPdfData = new Uint8Array([37, 80, 68, 70]);
      const result = await service.extractCover('pdf', dummyPdfData);

      expect(result).toBeNull();
      expect(mockDoc.getPage).not.toHaveBeenCalled();
      expect(mockDoc.destroy).toHaveBeenCalled();
    });

    it('should clean up page and document when canvas rendering fails', async () => {
      mockPage.render.mockReturnValue({
        promise: Promise.reject(new Error('Canvas rendering failed')),
      });

      const dummyPdfData = new Uint8Array([37, 80, 68, 70]);
      await expect(service.extractCover('pdf', dummyPdfData)).rejects.toThrow('Canvas rendering failed');

      expect(mockPage.cleanup).toHaveBeenCalled();
      expect(mockDoc.destroy).toHaveBeenCalled();
    });
  });

  describe('EPUB Cover Extraction', () => {
    it('should extract cover from EPUB using item properties="cover-image"', async () => {
      const zip = new JSZip();
      zip.file(
        'META-INF/container.xml',
        `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
          </rootfiles>
        </container>`,
      );

      zip.file(
        'OEBPS/content.opf',
        `<?xml version="1.0" encoding="utf-8"?>
        <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
          <manifest>
            <item id="my-cover" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image" />
          </manifest>
        </package>`,
      );

      zip.file('OEBPS/images/cover.jpg', new Uint8Array([255, 216, 255, 224, 1, 2, 3]));
      const epubBytes = await zip.generateAsync({ type: 'uint8array' });

      const result = await service.extractCover('epub', epubBytes);
      expect(result).not.toBeNull();
      expect(result instanceof Uint8Array).toBe(true);
    });

    it('should extract cover from EPUB using item id="cover"', async () => {
      const zip = new JSZip();
      zip.file(
        'META-INF/container.xml',
        `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
          </rootfiles>
        </container>`,
      );

      zip.file(
        'content.opf',
        `<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
          <manifest>
            <item id="cover" href="cover.png" media-type="image/png" />
          </manifest>
        </package>`,
      );

      zip.file('cover.png', new Uint8Array([137, 80, 78, 71, 1, 2, 3]));
      const epubBytes = await zip.generateAsync({ type: 'uint8array' });

      const result = await service.extractCover('epub', epubBytes);
      expect(result).not.toBeNull();
      expect(result instanceof Uint8Array).toBe(true);
    });

    it('should extract cover from EPUB using meta name="cover"', async () => {
      const zip = new JSZip();
      zip.file(
        'META-INF/container.xml',
        `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
          </rootfiles>
        </container>`,
      );

      zip.file(
        'content.opf',
        `<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
          <metadata>
            <meta name="cover" content="cover-image-id" />
          </metadata>
          <manifest>
            <item id="cover-image-id" href="front.jpeg" media-type="image/jpeg" />
          </manifest>
        </package>`,
      );

      zip.file('front.jpeg', new Uint8Array([255, 216, 255, 224, 4, 5, 6]));
      const epubBytes = await zip.generateAsync({ type: 'uint8array' });

      const result = await service.extractCover('epub', epubBytes);
      expect(result).not.toBeNull();
      expect(result instanceof Uint8Array).toBe(true);
    });

    it('should return null when EPUB has no cover image declared', async () => {
      const zip = new JSZip();
      zip.file(
        'META-INF/container.xml',
        `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
          </rootfiles>
        </container>`,
      );

      zip.file(
        'content.opf',
        `<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
          <manifest>
            <item id="chapter1" href="chap1.xhtml" media-type="application/xhtml+xml" />
          </manifest>
        </package>`,
      );

      const epubBytes = await zip.generateAsync({ type: 'uint8array' });
      const result = await service.extractCover('epub', epubBytes);
      expect(result).toBeNull();
    });

    it('should return null when META-INF/container.xml is missing', async () => {
      const zip = new JSZip();
      zip.file('content.opf', '<package></package>');
      const epubBytes = await zip.generateAsync({ type: 'uint8array' });

      const result = await service.extractCover('epub', epubBytes);
      expect(result).toBeNull();
    });
  });

  describe('FB2 and FB2.ZIP Cover Extraction', () => {
    it('should extract cover from FB2 coverpage and binary tag', async () => {
      const base64Pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const fb2Xml = `<?xml version="1.0" encoding="utf-8"?>
      <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
        <description>
          <title-info>
            <coverpage>
              <image l:href="#book_cover.png"/>
            </coverpage>
          </title-info>
        </description>
        <binary id="book_cover.png" content-type="image/png">${base64Pixel}</binary>
      </FictionBook>`;

      const result = await service.extractCover('fb2', fb2Xml);
      expect(result).not.toBeNull();
      expect(result instanceof Uint8Array).toBe(true);
    });

    it('should extract cover from compressed .fb2.zip archive', async () => {
      const base64Pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const fb2Xml = `<?xml version="1.0" encoding="utf-8"?>
      <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
        <description>
          <title-info>
            <coverpage>
              <image l:href="#cover_img"/>
            </coverpage>
          </title-info>
        </description>
        <binary id="cover_img" content-type="image/png">${base64Pixel}</binary>
      </FictionBook>`;

      const zip = new JSZip();
      zip.file('book.fb2', fb2Xml);
      const zipBytes = await zip.generateAsync({ type: 'uint8array' });

      const result = await service.extractCover('fb2', zipBytes);
      expect(result).not.toBeNull();
      expect(result instanceof Uint8Array).toBe(true);
    });

    it('should return null when FB2 has no coverpage element', async () => {
      const fb2Xml = `<?xml version="1.0" encoding="utf-8"?>
      <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
        <description>
          <title-info>
            <book-title>No Cover Book</book-title>
          </title-info>
        </description>
      </FictionBook>`;

      const result = await service.extractCover('fb2', fb2Xml);
      expect(result).toBeNull();
    });

    it('should return null when FB2 XML is malformed', async () => {
      const malformedXml = '<FictionBook><unclosed>';
      const result = await service.extractCover('fb2', malformedXml);
      expect(result).toBeNull();
    });
  });
});
