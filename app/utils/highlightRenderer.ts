import type { HighlightRecord } from '../types/highlight';
import { HIGHLIGHT_COLORS } from '../types/highlight';

export interface TextSegment {
  text: string;
  isHighlight: boolean;
  highlight?: HighlightRecord;
}

/**
 * Returns inline styling for highlight mark elements based on the highlight's chosen color.
 */
export function getHighlightStyle(hl: HighlightRecord): Record<string, string> {
  const cfg = HIGHLIGHT_COLORS[hl.color] || HIGHLIGHT_COLORS.green;
  return {
    backgroundColor: cfg.bg,
    borderBottom: `2px solid ${cfg.border}`,
    color: 'inherit',
  };
}

/**
 * Splits text into segments (unhighlighted and highlighted) strictly according to
 * matching highlight.blockId and [startOffset, endOffset].
 *
 * Rules:
 * 1. Filter by Exact Block: Only apply highlights matching blockId (and partType if present).
 * 2. Slice Exact Character Range: Slices text strictly at [startOffset, endOffset], without
 *    expanding to whole words.
 * 3. Fallback for Legacy Highlights: If startOffset / endOffset are missing, matches contextSentence
 *    or first occurrence only.
 */
export function renderTextSegments(
  text: string,
  blockId?: string,
  partType?: string,
  highlights: HighlightRecord[] = [],
): TextSegment[] {
  if (!text) return [];
  if (!highlights || highlights.length === 0) {
    return [{ text, isHighlight: false }];
  }

  // 1. Filter highlights matching this exact block
  const relevantHighlights = highlights.filter((hl) => {
    // If hl has blockId, it must match this blockId
    if (hl.blockId) {
      if (hl.blockId !== blockId) return false;
      if (hl.partType && partType && hl.partType !== partType) return false;
      return true;
    }

    // Fallback for legacy highlights (without blockId)
    // Only match if this block contains the contextSentence or matches selected_text
    if (hl.contextSentence && text.includes(hl.contextSentence)) {
      return true;
    }
    if (hl.selected_text && text.includes(hl.selected_text)) {
      return true;
    }

    return false;
  });

  if (relevantHighlights.length === 0) {
    return [{ text, isHighlight: false }];
  }

  // 2. Determine character slices [start, end] for each matching highlight
  interface HighlightSpan {
    start: number;
    end: number;
    highlight: HighlightRecord;
  }

  const spans: HighlightSpan[] = [];

  for (const hl of relevantHighlights) {
    let start: number | undefined;
    let end: number | undefined;

    if (hl.startOffset !== undefined && hl.endOffset !== undefined) {
      start = Math.max(0, Math.min(text.length, hl.startOffset));
      end = Math.max(start, Math.min(text.length, hl.endOffset));
    } else {
      // Legacy fallback: match contextSentence or first occurrence of selected_text
      const target = hl.selected_text;
      if (target) {
        let matchIdx = -1;
        if (hl.contextSentence && text.includes(hl.contextSentence)) {
          const sentenceIdx = text.indexOf(hl.contextSentence);
          const withinSentence = hl.contextSentence.indexOf(target);
          if (withinSentence !== -1) {
            matchIdx = sentenceIdx + withinSentence;
          }
        }
        if (matchIdx === -1) {
          matchIdx = text.indexOf(target);
        }
        if (matchIdx !== -1) {
          start = matchIdx;
          end = matchIdx + target.length;
        }
      }
    }

    if (start !== undefined && end !== undefined && start < end) {
      spans.push({ start, end, highlight: hl });
    }
  }

  if (spans.length === 0) {
    return [{ text, isHighlight: false }];
  }

  // Sort spans by start offset
  spans.sort((a, b) => a.start - b.start || a.end - b.end);

  // 3. Build text segments
  const segments: TextSegment[] = [];
  let currentIndex = 0;

  for (const span of spans) {
    if (span.start < currentIndex) {
      span.start = currentIndex;
    }
    if (span.start >= span.end || span.start >= text.length) {
      continue;
    }

    // Plain text before highlight
    if (span.start > currentIndex) {
      segments.push({
        text: text.slice(currentIndex, span.start),
        isHighlight: false,
      });
    }

    // Highlighted slice (exact character range, no word expansion)
    segments.push({
      text: text.slice(span.start, span.end),
      isHighlight: true,
      highlight: span.highlight,
    });

    currentIndex = span.end;
  }

  // Remaining plain text
  if (currentIndex < text.length) {
    segments.push({
      text: text.slice(currentIndex),
      isHighlight: false,
    });
  }

  return segments;
}

/**
 * Creates a DOM Range spanning from startOffset to endOffset within a container element.
 */
export function createRangeFromOffsets(
  container: HTMLElement,
  startOffset: number,
  endOffset: number,
): Range | null {
  if (typeof document === 'undefined') return null;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let startNode: Node | null = null;
  let startNodeOffset = 0;
  let endNode: Node | null = null;
  let endNodeOffset = 0;

  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length || 0;
    if (!startNode && currentOffset + len >= startOffset) {
      startNode = node;
      startNodeOffset = startOffset - currentOffset;
    }
    if (!endNode && currentOffset + len >= endOffset) {
      endNode = node;
      endNodeOffset = endOffset - currentOffset;
      break;
    }
    currentOffset += len;
    node = walker.nextNode();
  }

  if (startNode && endNode) {
    try {
      const range = document.createRange();
      range.setStart(startNode, startNodeOffset);
      range.setEnd(endNode, endNodeOffset);
      return range;
    } catch {
      return null;
    }
  }

  return null;
}
