export type HighlightColor = 'yellow' | 'green' | 'pink' | 'blue' | 'purple';

type BookFormat = 'pdf' | 'epub' | 'fb2' | 'mobi' | 'djvu';

export interface HighlightColorConfig {
  name: HighlightColor;
  bg: string;
  border: string;
}

export const HIGHLIGHT_COLORS: Record<HighlightColor, HighlightColorConfig> = {
  yellow: { name: 'yellow', bg: '#FEF08A', border: '#CA8A04' },
  green: { name: 'green', bg: '#C8E695', border: '#3E5725' },
  pink: { name: 'pink', bg: '#FBCFE8', border: '#DB2777' },
  blue: { name: 'blue', bg: '#BAE6FD', border: '#0284C7' },
  purple: { name: 'purple', bg: '#E9D5FF', border: '#9333EA' },
};

export interface HighlightRecord {
  id: string;
  book_id: string;
  format: BookFormat;
  locator: string;
  selected_text: string;
  color: HighlightColor;
  note: string | null;
  created_at: number;
  updated_at: number;
  blockId?: string;
  partType?: string;
  startOffset?: number;
  endOffset?: number;
  contextSentence?: string;
}

export type Highlight = HighlightRecord;

export interface CreateHighlightInput {
  id?: string;
  book_id: string;
  format: BookFormat;
  locator: string;
  selected_text: string;
  color: HighlightColor;
  note?: string | null;
  blockId?: string;
  partType?: string;
  startOffset?: number;
  endOffset?: number;
  contextSentence?: string;
}

export interface UpdateHighlightInput {
  color?: HighlightColor;
  note?: string | null;
}

export interface ActiveHighlightSelection {
  text: string;
  locator: string;
  format: BookFormat;
  x: number;
  y: number;
  width?: number;
  height?: number;
  blockId?: string;
  partType?: string;
  startOffset?: number;
  endOffset?: number;
}
