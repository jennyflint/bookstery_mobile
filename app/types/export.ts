import type { HighlightColor } from './highlight';

export type ExportFormat = 'md' | 'html' | 'txt' | 'json';

export type QuoteCardTheme = 'sepia' | 'green' | 'oled' | 'white';

export type QuoteCardAspectRatio = 'portrait' | 'square';

export interface QuoteCardOptions {
  theme: QuoteCardTheme;
  quoteText: string;
  bookTitle: string;
  author?: string | null;
  aspectRatio?: QuoteCardAspectRatio;
  highlightColor?: HighlightColor;
}

export interface QuoteCardThemeColors {
  background: string;
  backgroundSecondary?: string;
  text: string;
  authorText: string;
  quoteMark: string;
  watermark: string;
  mascotColor: string;
  cardBorder?: string;
}

export interface ExportBookNotesOptions {
  bookId: string;
  format: ExportFormat;
}

export interface ExportedDocumentPayload {
  fileName: string;
  mimeType: string;
  content: string;
}
