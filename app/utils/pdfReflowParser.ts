import type { PDFPageProxy } from 'pdfjs-dist';
import type { ReflowBlock, ReflowBlockType } from '../types/reflow';

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
}

interface RawLineItem {
  str: string;
  x: number;
  y: number;
  width: number;
  endX: number;
  fontSize: number;
}

interface RawLine {
  items: RawLineItem[];
  x: number;
  endX: number;
  y: number;
  fontSize: number;
  text: string;
  type?: ReflowBlockType;
}

function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Extracts, clusters, and reconstructs PDF text content into semantic reflow blocks.
 * Pipeline:
 * 1. Header & Footer Stripping
 * 2. Line Clustering (±3px tolerance)
 * 3. Paragraph & Heading Heuristics
 * 4. De-Hyphenation
 */
export async function extractReflowBlocks(
  page: PDFPageProxy,
  pageNumber: number,
): Promise<ReflowBlock[]> {
  const viewport = page.getViewport({ scale: 1.0 });
  const pageHeight = viewport.height;

  const textContent = await page.getTextContent();
  if (!textContent || !textContent.items || textContent.items.length === 0) {
    return [];
  }

  // 1. Header & Footer Stripping
  const rawItems: RawLineItem[] = [];

  for (const rawItem of textContent.items) {
    if (!('str' in rawItem) || typeof rawItem.str !== 'string') {
      continue;
    }
    const item = rawItem as TextItem;
    const str = item.str;
    const trimmed = str.trim();
    if (!trimmed) {
      continue;
    }

    const transform = item.transform || [1, 0, 0, 1, 0, 0];
    const x = transform[4];
    const y = transform[5];
    const width = item.width || 0;
    const endX = x + width;

    // Compute font size: Math.hypot(transform[2], transform[3])
    let fontSize = Math.hypot(transform[2], transform[3]);
    if (!fontSize || isNaN(fontSize) || fontSize <= 0) {
      fontSize = Math.hypot(transform[0], transform[1]) || item.height || 12;
    }

    // Filter headers (y > pageHeight * 0.93) and footers (y < pageHeight * 0.07)
    // when purely numeric or shorter than 45 characters
    const isInHeaderZone = y > pageHeight * 0.93;
    const isInFooterZone = y < pageHeight * 0.07;

    if (isInHeaderZone || isInFooterZone) {
      const isPurelyNumeric = /^\d+$/.test(trimmed);
      const isShort = trimmed.length < 45;
      if (isPurelyNumeric || isShort) {
        continue;
      }
    }

    rawItems.push({
      str,
      x,
      y,
      width,
      endX,
      fontSize,
    });
  }

  if (rawItems.length === 0) {
    return [];
  }

  // 2. Line Clustering
  // Sort items top-to-bottom (descending y), then left-to-right (ascending x)
  rawItems.sort((a, b) => {
    if (Math.abs(b.y - a.y) > 3) {
      return b.y - a.y;
    }
    return a.x - b.x;
  });

  const lineClusters: { y: number; items: RawLineItem[] }[] = [];

  for (const item of rawItems) {
    const matchedCluster = lineClusters.find(
      (cluster) => Math.abs(cluster.y - item.y) <= 3,
    );

    if (matchedCluster) {
      matchedCluster.items.push(item);
    } else {
      lineClusters.push({
        y: item.y,
        items: [item],
      });
    }
  }

  const lines: RawLine[] = [];

  for (const cluster of lineClusters) {
    const items = cluster.items.sort((a, b) => a.x - b.x);
    if (items.length === 0) continue;

    const x = Math.min(...items.map((it) => it.x));
    const endX = Math.max(...items.map((it) => it.endX));
    const avgY = items.reduce((sum, it) => sum + it.y, 0) / items.length;
    const maxFontSize = Math.max(...items.map((it) => it.fontSize));

    let lineText = '';
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (i === 0) {
        lineText = it.str;
      } else {
        const prev = items[i - 1];
        const gap = it.x - prev.endX;
        const hasSpace = prev.str.endsWith(' ') || it.str.startsWith(' ');
        if (!hasSpace && gap > 1.5) {
          lineText += ' ' + it.str;
        } else {
          lineText += it.str;
        }
      }
    }

    const trimmedLineText = lineText.trim();
    if (!trimmedLineText) continue;

    lines.push({
      items,
      x,
      endX,
      y: avgY,
      fontSize: maxFontSize,
      text: trimmedLineText,
    });
  }

  if (lines.length === 0) {
    return [];
  }

  // Sort lines strictly top-to-bottom
  lines.sort((a, b) => b.y - a.y);

  // 3. Paragraph & Heading Heuristics
  const fontSizes = lines.map((l) => l.fontSize);
  const medianFontSize = calculateMedian(fontSizes) || 12;

  // Compute baseLeftMargin from normal body text lines (fontSize < medianFontSize * 1.15)
  const bodyCandidates = lines.filter((l) => l.fontSize < medianFontSize * 1.15);
  const baseLines = bodyCandidates.length > 0 ? bodyCandidates : lines;
  const baseLeftMargin = Math.min(...baseLines.map((l) => l.x));

  const maxRightEdge = Math.max(...lines.map((l) => l.endX));

  // Compute normalLineGap from vertical distance between consecutive body lines
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const curr = lines[i];
    const gap = prev.y - curr.y;
    if (gap > 0 && gap < medianFontSize * 3) {
      gaps.push(gap);
    }
  }
  const normalLineGap = gaps.length > 0 ? calculateMedian(gaps) : medianFontSize * 1.2;

  // Classify line types
  for (const line of lines) {
    if (line.fontSize >= medianFontSize * 1.35) {
      line.type = 'h2';
    } else if (line.fontSize >= medianFontSize * 1.15) {
      line.type = 'h3';
    } else {
      line.type = 'p';
    }
  }

  // 4. Group into Reflow Blocks and De-Hyphenate
  const blocks: ReflowBlock[] = [];
  let currentBlock: ReflowBlock | null = null;
  let prevLine: RawLine | null = null;

  for (const line of lines) {
    if (line.type === 'h2' || line.type === 'h3') {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      blocks.push({
        type: line.type,
        text: line.text,
        pageNumber,
      });
      prevLine = line;
      continue;
    }

    // Line is a paragraph line ('p')
    const isNewParagraph =
      !currentBlock ||
      currentBlock.type !== 'p' ||
      !prevLine ||
      (prevLine.type && prevLine.type !== 'p') ||
      (prevLine.y - line.y > normalLineGap * 1.45) ||
      (line.x - baseLeftMargin > medianFontSize * 0.9) ||
      (
        prevLine.endX < maxRightEdge - (maxRightEdge - baseLeftMargin) * 0.18 &&
        /[.!?…»"”]$/.test(prevLine.text.trim())
      );

    if (isNewParagraph) {
      if (currentBlock) {
        blocks.push(currentBlock);
      }
      currentBlock = {
        type: 'p',
        text: line.text,
        pageNumber,
      };
    } else if (currentBlock) {
      // Merge with previous line applying de-hyphenation
      const prevText = currentBlock.text;
      const currText = line.text;
      const endsWithHyphen = /[-‐‑‒–]\s*$/.test(prevText);
      const startsWithLower = /^[а-яіїєґa-z]/.test(currText);

      if (endsWithHyphen && startsWithLower) {
        currentBlock.text = prevText.replace(/[-‐‑‒–]\s*$/, '') + currText;
      } else {
        currentBlock.text = prevText + ' ' + currText;
      }
    }

    prevLine = line;
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return blocks.map((b, index) => ({
    ...b,
    id: `reflow-${pageNumber}-${index}`,
  }));
}
