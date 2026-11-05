import { Directory, Filesystem } from '@capacitor/filesystem';
import { BookRepository } from '../database/BookRepository';
import { HighlightRepository } from '../database/HighlightRepository';
import type {
  BookRecord,
  ExportFormat,
  HighlightRecord,
} from '../../types';

function formatLocatorLabel(locator: string, format: string): string {
  if (format === 'pdf') {
    try {
      const parsed = JSON.parse(locator);
      if (parsed && typeof parsed.page === 'number') {
        return `Page ${parsed.page}`;
      }
    } catch {}
    const asNum = parseInt(locator, 10);
    if (!isNaN(asNum) && String(asNum) === locator.trim()) {
      return `Page ${asNum}`;
    }
  }
  if (format === 'fb2') {
    const clean = locator.replace(/^fb2-p-/, '');
    const asNum = parseInt(clean, 10);
    if (!isNaN(asNum)) {
      return `Paragraph ${asNum + 1}`;
    }
  }
  if (format === 'mobi') {
    const clean = locator.replace(/^mobi-p-/, '');
    const asNum = parseInt(clean, 10);
    if (!isNaN(asNum)) {
      return `Paragraph ${asNum + 1}`;
    }
  }
  return locator;
}

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class NotesExportService {
  private static instance: NotesExportService | null = null;
  private bookRepository: BookRepository;
  private highlightRepository: HighlightRepository;

  constructor(
    bookRepository?: BookRepository,
    highlightRepository?: HighlightRepository,
  ) {
    this.bookRepository = bookRepository || BookRepository.getInstance();
    this.highlightRepository = highlightRepository || HighlightRepository.getInstance();
  }

  static getInstance(): NotesExportService {
    if (!NotesExportService.instance) {
      NotesExportService.instance = new NotesExportService();
    }
    return NotesExportService.instance;
  }

  generateExportContent(
    book: BookRecord,
    highlights: HighlightRecord[],
    format: ExportFormat,
  ): string {
    const sortedHighlights = [...highlights].sort((a, b) => a.created_at - b.created_at);

    switch (format) {
      case 'md':
        return this.formatMarkdown(book, sortedHighlights);
      case 'html':
        return this.formatHtml(book, sortedHighlights);
      case 'txt':
        return this.formatPlainText(book, sortedHighlights);
      case 'json':
        return this.formatJson(book, sortedHighlights);
      default:
        throw new Error('Unsupported export format');
    }
  }

  private formatMarkdown(book: BookRecord, highlights: HighlightRecord[]): string {
    const dateStr = new Date().toISOString().split('T')[0];
    const authorStr = book.author || 'Unknown Author';

    const header = [
      '---',
      `title: "${book.title.replace(/"/g, '\\"')}"`,
      `author: "${authorStr.replace(/"/g, '\\"')}"`,
      `highlights_count: ${highlights.length}`,
      `export_date: "${dateStr}"`,
      '---',
      '',
      `# ${book.title}`,
      `*By ${authorStr}*`,
      '',
      `Total Highlights: ${highlights.length}`,
      '',
      '---',
      '',
    ].join('\n');

    if (highlights.length === 0) {
      return header + '*No highlights recorded for this book.*';
    }

    const items = highlights.map((hl) => {
      const locLabel = formatLocatorLabel(hl.locator, hl.format);
      const colorLabel = capitalize(hl.color);
      const lines = [
        `> [!quote] ${locLabel} | ${colorLabel}`,
        `> "${hl.selected_text.trim()}"`,
      ];
      if (hl.note && hl.note.trim()) {
        lines.push('>');
        lines.push(`> **Note:** ${hl.note.trim()}`);
      }
      return lines.join('\n');
    });

    return header + items.join('\n\n') + '\n';
  }

  private formatHtml(book: BookRecord, highlights: HighlightRecord[]): string {
    const dateStr = new Date().toISOString().split('T')[0];
    const authorStr = book.author || 'Unknown Author';

    const colorMap: Record<string, { bg: string; border: string; text: string }> = {
      yellow: { bg: '#FEF08A', border: '#CA8A04', text: '#854D0E' },
      green: { bg: '#C8E695', border: '#3E5725', text: '#273C14' },
      pink: { bg: '#FBCFE8', border: '#DB2777', text: '#9D174D' },
      blue: { bg: '#BAE6FD', border: '#0284C7', text: '#0369A1' },
      purple: { bg: '#E9D5FF', border: '#9333EA', text: '#7E22CE' },
    };

    const highlightsHtml = highlights.length === 0
      ? '<p class="empty-state">No highlights recorded for this book.</p>'
      : highlights
          .map((hl) => {
            const locLabel = escapeHtml(formatLocatorLabel(hl.locator, hl.format));
            const colorMeta = colorMap[hl.color] || colorMap.green;
            const quoteText = escapeHtml(hl.selected_text.trim());
            const noteBlock = hl.note && hl.note.trim()
              ? `<div class="note-block"><strong>Note:</strong> ${escapeHtml(hl.note.trim())}</div>`
              : '';

            return `
        <article class="highlight-card" style="border-left-color: ${colorMeta.border};">
          <header class="card-meta">
            <span class="locator-badge">${locLabel}</span>
            <span class="color-badge" style="background-color: ${colorMeta.bg}; color: ${colorMeta.text};">${capitalize(hl.color)}</span>
          </header>
          <blockquote class="quote-text">“${quoteText}”</blockquote>
          ${noteBlock}
        </article>`;
          })
          .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(book.title)} - Highlights & Notes</title>
  <style>
    @media print {
      body { background: #fff !important; color: #000 !important; font-size: 11pt; }
      .container { max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
      .highlight-card { page-break-inside: avoid; border-left-width: 4px !important; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #18181b;
      background-color: #fafafa;
      padding: 32px 16px;
    }
    .container {
      max-width: 720px;
      margin: 0 auto;
      background: #ffffff;
      padding: 36px 32px;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    }
    .doc-header {
      border-bottom: 2px solid #f4f4f5;
      padding-bottom: 20px;
      margin-bottom: 28px;
    }
    .doc-title { font-size: 26px; font-weight: 800; color: #18181b; line-height: 1.25; }
    .doc-author { font-size: 16px; color: #71717a; margin-top: 6px; }
    .doc-meta { display: flex; gap: 16px; font-size: 13px; color: #a1a1aa; margin-top: 12px; }
    .highlight-card {
      margin-bottom: 20px;
      padding: 16px 20px;
      background: #fbfbfb;
      border-radius: 10px;
      border-left: 5px solid #C8E695;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .card-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      font-size: 12px;
      font-weight: 600;
    }
    .locator-badge { color: #52525b; }
    .color-badge { padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; }
    .quote-text {
      font-size: 15px;
      font-style: italic;
      color: #27272a;
      line-height: 1.55;
    }
    .note-block {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px dashed #e4e4e7;
      font-size: 13.5px;
      color: #3f3f46;
    }
    .empty-state { text-align: center; color: #a1a1aa; padding: 40px 0; }
    .footer {
      text-align: center;
      margin-top: 40px;
      font-size: 12px;
      color: #a1a1aa;
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="doc-header">
      <h1 class="doc-title">${escapeHtml(book.title)}</h1>
      <p class="doc-author">By ${escapeHtml(authorStr)}</p>
      <div class="doc-meta">
        <span>Total Highlights: ${highlights.length}</span>
        <span>Exported: ${dateStr}</span>
      </div>
    </header>
    <main>
      ${highlightsHtml}
    </main>
    <footer class="footer">
      Exported from Bookstery
    </footer>
  </div>
</body>
</html>`;
  }

  private formatPlainText(book: BookRecord, highlights: HighlightRecord[]): string {
    const dateStr = new Date().toISOString().split('T')[0];
    const authorStr = book.author || 'Unknown Author';

    const lines = [
      '==================================================',
      book.title.toUpperCase(),
      `Author: ${authorStr}`,
      `Total Highlights: ${highlights.length}`,
      `Export Date: ${dateStr}`,
      '==================================================',
      '',
    ];

    if (highlights.length === 0) {
      lines.push('No highlights recorded for this book.');
      return lines.join('\n') + '\n';
    }

    highlights.forEach((hl, index) => {
      const locLabel = formatLocatorLabel(hl.locator, hl.format);
      lines.push(`[${index + 1}] ${locLabel} (${capitalize(hl.color)})`);
      lines.push(`"${hl.selected_text.trim()}"`);
      if (hl.note && hl.note.trim()) {
        lines.push(`Note: ${hl.note.trim()}`);
      }
      lines.push('');
    });

    return lines.join('\n');
  }

  private formatJson(book: BookRecord, highlights: HighlightRecord[]): string {
    const payload = {
      book: {
        id: book.id,
        title: book.title,
        author: book.author,
        format: book.format,
      },
      export_date: new Date().toISOString(),
      highlights_count: highlights.length,
      highlights: highlights.map((hl) => ({
        id: hl.id,
        format: hl.format,
        locator: hl.locator,
        selected_text: hl.selected_text,
        color: hl.color,
        note: hl.note,
        created_at: hl.created_at,
        updated_at: hl.updated_at,
      })),
    };
    return JSON.stringify(payload, null, 2);
  }

  async exportBookNotes(bookId: string, format: ExportFormat): Promise<string> {
    const book = await this.bookRepository.getBookById(bookId);
    if (!book) {
      throw new Error('Book not found');
    }

    const highlights = await this.highlightRepository.getHighlightsByBook(bookId);
    return this.generateExportContent(book, highlights, format);
  }

  async saveExportFileToCache(
    bookId: string,
    format: ExportFormat,
  ): Promise<{ path: string; uri: string; fileName: string; content: string }> {
    const book = await this.bookRepository.getBookById(bookId);
    if (!book) {
      throw new Error('Book not found');
    }

    const content = await this.exportBookNotes(bookId, format);
    const sanitizedTitle = book.title
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 40);

    const fileName = `${sanitizedTitle}_notes.${format}`;
    const filePath = `exports/${fileName}`;

    let fileUri = '';
    try {
      const writeResult = await Filesystem.writeFile({
        path: filePath,
        data: content,
        directory: Directory.Cache,
      });
      fileUri = writeResult.uri;
    } catch {
      fileUri = filePath;
    }

    return {
      path: filePath,
      uri: fileUri,
      fileName,
      content,
    };
  }

  async shareExportedNotes(bookId: string, format: ExportFormat): Promise<void> {
    const book = await this.bookRepository.getBookById(bookId);
    if (!book) {
      throw new Error('Book not found');
    }

    const { uri, fileName, content } = await this.saveExportFileToCache(bookId, format);
    const shareTitle = `${book.title} - Notes`;

    try {
      const shareModule = await import('@capacitor/share').catch(() => null);
      if (shareModule && shareModule.Share) {
        await shareModule.Share.share({
          title: shareTitle,
          text: `Highlights and notes from ${book.title}`,
          url: uri,
          dialogTitle: shareTitle,
        });
        return;
      }
    } catch {}

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: shareTitle,
          text: content,
        });
        return;
      } catch {}
    }

    this.triggerBrowserDownload(fileName, content, format);
  }

  triggerBrowserDownload(fileName: string, content: string, format: ExportFormat): void {
    if (typeof window === 'undefined') return;

    const mimeTypes: Record<ExportFormat, string> = {
      md: 'text/markdown;charset=utf-8',
      html: 'text/html;charset=utf-8',
      txt: 'text/plain;charset=utf-8',
      json: 'application/json;charset=utf-8',
    };

    const blob = new Blob([content], { type: mimeTypes[format] || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
