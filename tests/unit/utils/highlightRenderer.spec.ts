import { describe, it, expect } from 'vitest';
import {
  renderTextSegments,
  getHighlightStyle,
  createRangeFromOffsets,
} from '../../../app/utils/highlightRenderer';
import type { HighlightRecord } from '../../../app/types/highlight';

describe('highlightRenderer', () => {
  it('correctly slices exact character range without expanding to whole words', () => {
    const text = 'Я певен, що треба йти в непроглядну темряву, бо вже пізно.';
    // Selecting the single letter "е" inside "певен" (startOffset: 3, endOffset: 4)
    const highlights: HighlightRecord[] = [
      {
        id: 'hl-1',
        book_id: 'b-1',
        format: 'pdf',
        locator: '1',
        selected_text: 'е',
        color: 'green',
        note: null,
        created_at: 1000,
        updated_at: 1000,
        blockId: 'bubble-1',
        startOffset: 3,
        endOffset: 4,
      },
    ];

    const segments = renderTextSegments(text, 'bubble-1', 'dialogue', highlights);

    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({
      text: 'Я п',
      isHighlight: false,
    });
    expect(segments[1]).toEqual({
      text: 'е',
      isHighlight: true,
      highlight: highlights[0],
    });
    expect(segments[2]).toEqual({
      text: 'вен, що треба йти в непроглядну темряву, бо вже пізно.',
      isHighlight: false,
    });
  });

  it('filters highlights strictly by blockId and ignores other bubbles on the page', () => {
    const bubble1Text = 'Я певен, що треба.';
    const bubble2Text = 'Треба йти в непроглядну темряву.';

    const highlightForBubble1: HighlightRecord = {
      id: 'hl-bubble-1',
      book_id: 'b-1',
      format: 'pdf',
      locator: '1',
      selected_text: 'е',
      color: 'yellow',
      note: null,
      created_at: 1000,
      updated_at: 1000,
      blockId: 'bubble-1',
      startOffset: 3,
      endOffset: 4,
    };

    // Rendering bubble-2 with the highlight list containing only bubble-1's highlight
    const bubble2Segments = renderTextSegments(bubble2Text, 'bubble-2', 'dialogue', [highlightForBubble1]);

    // Bubble-2 should have NO highlights at all
    expect(bubble2Segments).toHaveLength(1);
    expect(bubble2Segments[0]).toEqual({
      text: bubble2Text,
      isHighlight: false,
    });
  });

  it('filters highlights by partType when provided', () => {
    const text = 'Dialogue text here';
    const highlight: HighlightRecord = {
      id: 'hl-part-test',
      book_id: 'b-1',
      format: 'epub',
      locator: '1',
      selected_text: 'text',
      color: 'blue',
      note: null,
      created_at: 1000,
      updated_at: 1000,
      blockId: 'block-x',
      partType: 'dialogue',
      startOffset: 9,
      endOffset: 13,
    };

    // When partType matches 'dialogue'
    const matchingSegments = renderTextSegments(text, 'block-x', 'dialogue', [highlight]);
    expect(matchingSegments.some((s) => s.isHighlight)).toBe(true);

    // When partType is 'narration', should not match
    const nonMatchingSegments = renderTextSegments(text, 'block-x', 'narration', [highlight]);
    expect(nonMatchingSegments).toHaveLength(1);
    expect(nonMatchingSegments[0].isHighlight).toBe(false);
  });

  it('handles legacy highlights by matching first occurrence or contextSentence without whole-page proliferation', () => {
    const text = 'First word and second word.';
    const legacyHighlight: HighlightRecord = {
      id: 'hl-legacy',
      book_id: 'b-1',
      format: 'fb2',
      locator: '1',
      selected_text: 'word',
      color: 'pink',
      note: null,
      created_at: 1000,
      updated_at: 1000,
      // No blockId, no startOffset, no endOffset
    };

    const segments = renderTextSegments(text, 'p-1', undefined, [legacyHighlight]);

    // Only the first 'word' is highlighted, not every occurrence
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ text: 'First ', isHighlight: false });
    expect(segments[1]).toEqual({ text: 'word', isHighlight: true, highlight: legacyHighlight });
    expect(segments[2]).toEqual({ text: ' and second word.', isHighlight: false });
  });

  it('creates DOM Range from character offsets within element', () => {
    const container = document.createElement('div');
    container.innerHTML = 'Hello <b>beautiful</b> world!';
    document.body.appendChild(container);

    // "beautiful" starts at character 6 and ends at 15
    const range = createRangeFromOffsets(container, 6, 15);
    expect(range).not.toBeNull();
    expect(range?.toString()).toBe('beautiful');

    container.remove();
  });

  it('returns valid highlight style configuration with bg and border', () => {
    const highlight: HighlightRecord = {
      id: 'hl-style',
      book_id: 'b-1',
      format: 'epub',
      locator: '1',
      selected_text: 'sample',
      color: 'green',
      note: null,
      created_at: 1000,
      updated_at: 1000,
    };

    const style = getHighlightStyle(highlight);
    expect(style.backgroundColor).toBe('#C8E695');
    expect(style.borderBottom).toContain('#3E5725');
  });
});
