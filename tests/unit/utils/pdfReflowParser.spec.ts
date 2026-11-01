import { describe, it, expect } from 'vitest';
import type { PDFPageProxy } from 'pdfjs-dist';
import { extractReflowBlocks } from '~/utils/pdfReflowParser';

function createMockPage(
  items: Array<{ str: string; transform: number[]; width: number; height?: number }>,
  viewport = { width: 600, height: 1000 },
): PDFPageProxy {
  return {
    getViewport: () => viewport,
    getTextContent: async () => ({
      items: items.map((it) => ({
        ...it,
        height: it.height ?? 12,
      })),
    }),
  } as unknown as PDFPageProxy;
}

describe('pdfReflowParser', () => {
  it('should return an empty array if page has no text items', async () => {
    const page = createMockPage([]);
    const blocks = await extractReflowBlocks(page, 1);
    expect(blocks).toEqual([]);
  });

  it('Stage 1: should strip header (>93% height) and footer (<7% height) when numeric or <45 chars', async () => {
    // page height is 1000. Header zone: y > 930. Footer zone: y < 70.
    const items = [
      // Header: purely numeric page number in top zone
      { str: '12', transform: [12, 0, 0, 12, 300, 950], width: 20 },
      // Header: short title in top zone (<45 chars)
      { str: 'Chapter 1: The Beginning', transform: [12, 0, 0, 12, 50, 960], width: 150 },
      // Body item in normal zone (y = 500)
      { str: 'Valid body paragraph content that should stay.', transform: [12, 0, 0, 12, 50, 500], width: 300 },
      // Footer: short string in bottom zone
      { str: 'Confidential Document', transform: [10, 0, 0, 10, 200, 50], width: 100 },
      // Footer: page number in bottom zone
      { str: '42', transform: [10, 0, 0, 10, 300, 30], width: 20 },
    ];

    const page = createMockPage(items);
    const blocks = await extractReflowBlocks(page, 1);

    expect(blocks.length).toBe(1);
    expect(blocks[0].text).toBe('Valid body paragraph content that should stay.');
  });

  it('Stage 1: should retain long non-numeric headers or footers (>=45 chars)', async () => {
    const longHeader = 'A'.repeat(50);
    const items = [
      { str: longHeader, transform: [12, 0, 0, 12, 50, 950], width: 400 },
      { str: 'Body content.', transform: [12, 0, 0, 12, 50, 500], width: 200 },
    ];

    const page = createMockPage(items);
    const blocks = await extractReflowBlocks(page, 1);

    expect(blocks.some((b) => b.text.includes(longHeader))).toBe(true);
  });

  it('Stage 2: should cluster items sharing y coordinate within ±3px into a single line', async () => {
    const items = [
      { str: 'Hello', transform: [12, 0, 0, 12, 50, 502], width: 40 },
      { str: 'world', transform: [12, 0, 0, 12, 95, 500], width: 40 },
      { str: 'of PDF reflow', transform: [12, 0, 0, 12, 140, 499], width: 80 },
    ];

    const page = createMockPage(items);
    const blocks = await extractReflowBlocks(page, 1);

    expect(blocks.length).toBe(1);
    expect(blocks[0].text).toBe('Hello world of PDF reflow');
  });

  it('Stage 3: should classify headings as h2 (>=1.35x median) and h3 (>=1.15x median)', async () => {
    // Median font size is 12 (hypot(0, 12) = 12)
    // h2 font size >= 16.2 (e.g. 20)
    // h3 font size >= 13.8 (e.g. 15)
    const items = [
      { str: 'Main Title', transform: [20, 0, 0, 20, 50, 800], width: 200 },
      { str: 'Section Subtitle', transform: [15, 0, 0, 15, 50, 750], width: 150 },
      { str: 'Body text line 1.', transform: [12, 0, 0, 12, 50, 700], width: 300 },
      { str: 'Body text line 2.', transform: [12, 0, 0, 12, 50, 680], width: 300 },
      { str: 'Body text line 3.', transform: [12, 0, 0, 12, 50, 660], width: 300 },
    ];

    const page = createMockPage(items);
    const blocks = await extractReflowBlocks(page, 1);

    expect(blocks[0]).toMatchObject({
      type: 'h2',
      text: 'Main Title',
    });
    expect(blocks[1]).toMatchObject({
      type: 'h3',
      text: 'Section Subtitle',
    });
    expect(blocks[2]).toMatchObject({
      type: 'p',
    });
  });

  it('Stage 3: should start a new paragraph on large vertical gap (>1.45x normalLineGap)', async () => {
    // Normal gap is 20px (700 -> 680)
    // Large gap: 680 -> 620 = 60px (> 20 * 1.45 = 29)
    const items = [
      { str: 'Paragraph one line one.', transform: [12, 0, 0, 12, 50, 700], width: 300 },
      { str: 'Paragraph one line two.', transform: [12, 0, 0, 12, 50, 680], width: 300 },
      { str: 'Paragraph two line one after vertical gap.', transform: [12, 0, 0, 12, 50, 620], width: 300 },
    ];

    const page = createMockPage(items);
    const blocks = await extractReflowBlocks(page, 1);

    expect(blocks.length).toBe(2);
    expect(blocks[0].text).toBe('Paragraph one line one. Paragraph one line two.');
    expect(blocks[1].text).toBe('Paragraph two line one after vertical gap.');
  });

  it('Stage 3: should start a new paragraph on first-line indent (> medianFontSize * 0.9)', async () => {
    // median font size = 12, indent > 10.8px
    // baseLeftMargin = 50, line 2 indent = 75 (> 50 + 10.8)
    const items = [
      { str: 'Line of first paragraph.', transform: [12, 0, 0, 12, 50, 700], width: 300 },
      { str: 'Indented new paragraph starting here.', transform: [12, 0, 0, 12, 75, 680], width: 280 },
    ];

    const page = createMockPage(items);
    const blocks = await extractReflowBlocks(page, 1);

    expect(blocks.length).toBe(2);
    expect(blocks[0].text).toBe('Line of first paragraph.');
    expect(blocks[1].text).toBe('Indented new paragraph starting here.');
  });

  it('Stage 3: should start a new paragraph if previous line ended significantly before right margin with sentence punctuation', async () => {
    // maxRightEdge is 400 (baseLeftMargin = 50). Span = 350.
    // 18% of 350 = 63. Right margin threshold = 400 - 63 = 337.
    // Line 1 ends at 50 + 200 = 250 (< 337) and ends with '.'
    const items = [
      { str: 'Short ending line of first paragraph.', transform: [12, 0, 0, 12, 50, 700], width: 200 },
      { str: 'Full width next paragraph line.', transform: [12, 0, 0, 12, 50, 680], width: 350 },
    ];

    const page = createMockPage(items);
    const blocks = await extractReflowBlocks(page, 1);

    expect(blocks.length).toBe(2);
    expect(blocks[0].text).toBe('Short ending line of first paragraph.');
    expect(blocks[1].text).toBe('Full width next paragraph line.');
  });

  it('Stage 4: should de-hyphenate words split across lines for Latin and Cyrillic lowercase letters', async () => {
    const items = [
      // Latin hyphenation
      { str: 'This is an excep-', transform: [12, 0, 0, 12, 50, 700], width: 300 },
      { str: 'tional feature.', transform: [12, 0, 0, 12, 50, 680], width: 300 },
      // Cyrillic hyphenation
      { str: 'Це неймо-', transform: [12, 0, 0, 12, 50, 660], width: 300 },
      { str: 'вірна технологія.', transform: [12, 0, 0, 12, 50, 640], width: 300 },
    ];

    const page = createMockPage(items);
    const blocks = await extractReflowBlocks(page, 1);

    expect(blocks.length).toBe(1);
    expect(blocks[0].text).toContain('exceptional feature.');
    expect(blocks[0].text).toContain('неймовірна технологія.');
  });

  it('Stage 4: should preserve hyphen when next line starts with an uppercase letter or number', async () => {
    const items = [
      { str: 'We consider pre-', transform: [12, 0, 0, 12, 50, 700], width: 300 },
      { str: 'Renaissance art.', transform: [12, 0, 0, 12, 50, 680], width: 300 },
    ];

    const page = createMockPage(items);
    const blocks = await extractReflowBlocks(page, 1);

    expect(blocks[0].text).toBe('We consider pre- Renaissance art.');
  });
});
