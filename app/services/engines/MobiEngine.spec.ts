import { describe, it, expect, beforeEach } from 'vitest';
import { MobiEngine } from './MobiEngine';
import {
  decompressPalmDoc,
  stripTrailingDataEntries,
  parseRecord0,
  createSampleMobi,
  MobiParser,
} from './MobiParser';
import type { HighlightRecord, ZoomableContainerElement } from '../../types';

describe('MobiEngine & MobiParser', () => {
  describe('PalmDOC LZ77 Decompression', () => {
    it('should decompress literal bytes correctly', () => {
      // 0x00 literal
      const data0 = new Uint8Array([0x00]);
      expect(Array.from(decompressPalmDoc(data0))).toEqual([0x00]);

      // 0x01..0x08 literal run (length 3, followed by 3 bytes)
      const dataRun = new Uint8Array([0x03, 0x41, 0x42, 0x43]);
      expect(Array.from(decompressPalmDoc(dataRun))).toEqual([0x41, 0x42, 0x43]);

      // 0x09..0x7F single literal bytes
      const dataSingle = new Uint8Array([0x09, 0x5a, 0x7f]);
      expect(Array.from(decompressPalmDoc(dataSingle))).toEqual([0x09, 0x5a, 0x7f]);
    });

    it('should decompress space+char pairs (0xC0..0xFF)', () => {
      // 0xC1 = space (0x20) + (0xC1 ^ 0x80 = 0x41 'A')
      const dataSpace = new Uint8Array([0xc1]);
      const decompressed = decompressPalmDoc(dataSpace);
      expect(Array.from(decompressed)).toEqual([0x20, 0x41]);
    });

    it('should decompress LZ77 length-distance pairs (0x80..0xBF)', () => {
      // Create stream: "ABCDE" followed by copy of "CDE"
      // "ABCDE" encoded as run: [5, 65, 66, 67, 68, 69]
      // To copy "CDE" (length 3, distance 3):
      // distance = 3, length = 3
      // pair = 0x8000 | (distance << 3) | (length - 3)
      // pair = 0x8000 | (3 << 3) | 0 = 0x8018
      // byte1 = 0x80, byte2 = 0x18
      const encoded = new Uint8Array([
        0x05, 0x41, 0x42, 0x43, 0x44, 0x45,
        0x80, 0x18,
      ]);
      const result = decompressPalmDoc(encoded);
      const str = new TextDecoder().decode(result);
      expect(str).toBe('ABCDECDE');
    });

    it('should strip trailing multibyte overlap entries', () => {
      // Data with 2 trailing bytes where flags & 1 is set
      const raw = new Uint8Array([0x41, 0x42, 0x43, 0x01]); // last byte is 0x01, (0x01 & 3) + 1 = 2 bytes
      const stripped = stripTrailingDataEntries(raw, 1);
      expect(Array.from(stripped)).toEqual([0x41, 0x42]);
    });
  });

  describe('Record 0 MOBI & EXTH Header Parsing', () => {
    it('should parse Record 0 PalmDOC and MOBI header with UTF-8 title and EXTH author', () => {
      const sampleMobi = createSampleMobi({
        title: 'Kobzar of Taras Shevchenko',
        author: 'Taras Shevchenko',
        description: 'Famous collection of Ukrainian poetry',
      });

      const parsed = MobiParser.parseDocument(sampleMobi);
      expect(parsed.metadata.title).toBe('Kobzar of Taras Shevchenko');
      expect(parsed.metadata.author).toBe('Taras Shevchenko');
      expect(parsed.metadata.description).toBe('Famous collection of Ukrainian poetry');
    });

    it('should parse embedded cover image and cover offset', () => {
      // Minimal 4-byte JPEG: FF D8 FF E0
      const dummyJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const sampleMobi = createSampleMobi({
        title: 'Book with Cover',
        author: 'Author',
        imageBytes: dummyJpeg,
      });

      const parsed = MobiParser.parseDocument(sampleMobi);
      expect(parsed.coverDataUrl).not.toBeNull();
      expect(parsed.coverDataUrl).toContain('data:image/jpeg;base64,');
      expect(parsed.metadata.coverOffset).toBe(0);
    });

    it('should throw an error for DRM encrypted MOBI files', () => {
      // Record 0 with encryptionType = 2
      const record0 = new Uint8Array(32);
      const dv = new DataView(record0.buffer);
      dv.setUint16(0, 1, false); // compression
      dv.setUint16(12, 2, false); // encryptionType = 2 (DRM)

      expect(() => parseRecord0(record0)).toThrow(
        'DRM-protected MOBI/Kindle books are not supported',
      );
    });
  });

  describe('MobiEngine Rendering and Navigation', () => {
    let engine: MobiEngine;
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      engine = new MobiEngine();
    });

    it('should render structured block paragraphs with stable #mobi-p-X IDs', async () => {
      const sampleMobi = createSampleMobi({
        title: 'Mobi Test Book',
        htmlContent: `
          <html>
            <body>
              <h1>Introduction</h1>
              <p>First paragraph of the book.</p>
              <p>Second paragraph with <strong>bold</strong> details.</p>
            </body>
          </html>
        `,
      });

      await engine.init(container, sampleMobi);

      const wrapper = container.querySelector('.mobi-document-wrapper');
      expect(wrapper).not.toBeNull();

      const heading = container.querySelector('h1#mobi-p-0');
      expect(heading).not.toBeNull();
      expect(heading?.getAttribute('data-block-id')).toBe('mobi-p-0');
      expect(heading?.textContent?.trim()).toBe('Introduction');

      const p1 = container.querySelector('#mobi-p-1');
      expect(p1).not.toBeNull();
      expect(p1?.getAttribute('data-block-id')).toBe('mobi-p-1');
      expect(p1?.textContent?.trim()).toBe('First paragraph of the book.');

      const p2 = container.querySelector('#mobi-p-2');
      expect(p2).not.toBeNull();
      expect(p2?.innerHTML).toContain('<strong>bold</strong>');
    });

    it('should navigate to specific paragraph locator and numeric pages', async () => {
      const paragraphs = Array.from(
        { length: 20 },
        (_, i) => `<p>Paragraph content ${i}</p>`,
      ).join('\n');
      const sampleMobi = createSampleMobi({
        title: 'Long Book',
        htmlContent: `<html><body><h1>Chapter 1</h1>${paragraphs}</body></html>`,
      });

      await engine.init(container, sampleMobi);

      // Paragraph locator navigation
      await engine.goTo('mobi-p-2');
      let loc = engine.getCurrentLocation();
      expect(loc.locator).toBeDefined();

      // Numeric page navigation
      await engine.goTo('2');
      loc = engine.getCurrentLocation();
      expect(loc.currentPage).toBeGreaterThanOrEqual(1);

      // Percentage navigation
      await engine.goTo('100%');
      loc = engine.getCurrentLocation();
      expect(loc.progressPercentage).toBe(100);
    });

    it('should apply theme colors and update font size', async () => {
      const sampleMobi = createSampleMobi();
      await engine.init(container, sampleMobi);

      engine.applyTheme({ bg: '#121212', text: '#e0e0e0' });
      const wrapper = container.querySelector<HTMLElement>('.mobi-document-wrapper');
      expect(wrapper?.style.backgroundColor).toBe('#121212');
      expect(wrapper?.style.color).toBe('#e0e0e0');

      engine.setFontSize(24);
      expect(wrapper?.style.fontSize).toBe('24px');
    });

    it('should restore highlights with mobi format', async () => {
      const sampleMobi = createSampleMobi({
        htmlContent: '<html><body><p>Highlighted text in paragraph.</p></body></html>',
      });
      await engine.init(container, sampleMobi);

      const highlights: HighlightRecord[] = [
        {
          id: 'hl-1',
          book_id: 'book-1',
          format: 'mobi',
          locator: 'mobi-p-0',
          selected_text: 'Highlighted text',
          color: 'yellow',
          note: 'Important',
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ];

      engine.setHighlights(highlights);
      const mark = container.querySelector('mark.bookstery-hl');
      expect(mark).not.toBeNull();
      expect(mark?.textContent).toBe('Highlighted text');
      expect(mark?.getAttribute('data-highlight-id')).toBe('hl-1');
    });

    it('should support TTS sentence highlighting and clearing', async () => {
      const sampleMobi = createSampleMobi({
        htmlContent: '<html><body><p>Sentence for text to speech test.</p></body></html>',
      });
      await engine.init(container, sampleMobi);

      engine.highlightTtsSentence('Sentence for text to speech', 0);
      const active = container.querySelector('.tts-active-span');
      expect(active).not.toBeNull();

      engine.clearTtsHighlight();
      expect(container.querySelector('.tts-active-span')).toBeNull();
    });

    it('should register zoomable container helpers and cleanup on destroy', async () => {
      const sampleMobi = createSampleMobi();
      await engine.init(container, sampleMobi);

      const zoomable = container as unknown as ZoomableContainerElement;
      expect(zoomable.__readerGetScrollContainer).toBeDefined();
      expect(zoomable.__readerGetContentSize).toBeDefined();

      engine.destroy();
      expect(container.innerHTML).toBe('');
      expect(zoomable.__readerGetScrollContainer).toBeUndefined();
    });
  });
});
