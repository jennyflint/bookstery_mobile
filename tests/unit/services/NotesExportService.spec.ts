import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotesExportService } from '../../../app/services/export/NotesExportService';
import { BookRepository } from '../../../app/services/database/BookRepository';
import { HighlightRepository } from '../../../app/services/database/HighlightRepository';
import { SqliteService } from '../../../app/services/database/SqliteService';
import { Filesystem, Directory } from '@capacitor/filesystem';
import type { BookRecord, CreateHighlightInput } from '../../../app/types';

describe('NotesExportService', () => {
  let exportService: NotesExportService;
  let bookRepository: BookRepository;
  let highlightRepository: HighlightRepository;
  let sqliteService: SqliteService;

  const sampleBook: BookRecord = {
    id: 'book-export-1',
    title: 'Meditations',
    author: 'Marcus Aurelius',
    format: 'epub',
    file_path: 'books/meditations.epub',
    cover_path: null,
    locator: '1',
    progress_percentage: 45,
    total_items: 200,
    last_read_at: 100000,
    updated_at: 100000,
  };

  const highlightWithNote: CreateHighlightInput = {
    id: 'hl-exp-1',
    book_id: 'book-export-1',
    format: 'epub',
    locator: 'epubcfi(/6/2[book]!/4/2/1)',
    selected_text: 'You have power over your mind - not outside events.',
    color: 'yellow',
    note: 'Key stoic realization about agency.',
  };

  const highlightWithoutNote: CreateHighlightInput = {
    id: 'hl-exp-2',
    book_id: 'book-export-1',
    format: 'epub',
    locator: 'epubcfi(/6/4[book]!/4/2/10)',
    selected_text: 'The happiness of your life depends upon the quality of your thoughts.',
    color: 'green',
    note: null,
  };

  beforeEach(async () => {
    localStorage.clear();
    sqliteService = SqliteService.getInstance();
    await sqliteService.init();

    bookRepository = new BookRepository(sqliteService);
    highlightRepository = new HighlightRepository(sqliteService);
    exportService = new NotesExportService(bookRepository, highlightRepository);

    await bookRepository.upsertBook(sampleBook);
    await highlightRepository.createHighlight(highlightWithNote);
    await highlightRepository.createHighlight(highlightWithoutNote);
  });

  it('should export notes in Markdown with frontmatter and Obsidian callouts', async () => {
    const md = await exportService.exportBookNotes('book-export-1', 'md');

    expect(md).toContain('---');
    expect(md).toContain('title: "Meditations"');
    expect(md).toContain('author: "Marcus Aurelius"');
    expect(md).toContain('highlights_count: 2');
    expect(md).toContain('export_date: "');
    expect(md).toContain('# Meditations');
    expect(md).toContain('*By Marcus Aurelius*');

    expect(md).toContain('> [!quote] epubcfi(/6/2[book]!/4/2/1) | Yellow');
    expect(md).toContain('> "You have power over your mind - not outside events."');
    expect(md).toContain('> **Note:** Key stoic realization about agency.');
  });

  it('should omit Note block for highlights without note in Markdown export', async () => {
    const md = await exportService.exportBookNotes('book-export-1', 'md');

    expect(md).toContain('> [!quote] epubcfi(/6/4[book]!/4/2/10) | Green');
    expect(md).toContain('> "The happiness of your life depends upon the quality of your thoughts."');

    const greenCallout = md
      .split('> [!quote]')
      .find((section) => section.includes('Green'));
    expect(greenCallout).toBeDefined();
    expect(greenCallout).not.toContain('**Note:**');
  });

  it('should export clean self-contained HTML with print styles', async () => {
    const html = await exportService.exportBookNotes('book-export-1', 'html');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Meditations - Highlights & Notes</title>');
    expect(html).toContain('@media print');
    expect(html).toContain('Marcus Aurelius');
    expect(html).toContain('You have power over your mind');
    expect(html).toContain('Key stoic realization about agency.');
    expect(html).toContain('The happiness of your life depends');
  });

  it('should export structured plain text', async () => {
    const txt = await exportService.exportBookNotes('book-export-1', 'txt');

    expect(txt).toContain('MEDITATIONS');
    expect(txt).toContain('Author: Marcus Aurelius');
    expect(txt).toContain('Total Highlights: 2');
    expect(txt).toContain('[1]');
    expect(txt).toContain('You have power over your mind');
    expect(txt).toContain('Note: Key stoic realization about agency.');
  });

  it('should export structured JSON', async () => {
    const jsonStr = await exportService.exportBookNotes('book-export-1', 'json');
    const parsed = JSON.parse(jsonStr);

    expect(parsed.book.title).toBe('Meditations');
    expect(parsed.book.author).toBe('Marcus Aurelius');
    expect(parsed.highlights_count).toBe(2);
    expect(parsed.highlights).toHaveLength(2);

    const hlWithNote = parsed.highlights.find(
      (h: { id: string }) => h.id === 'hl-exp-1',
    );
    const hlWithoutNote = parsed.highlights.find(
      (h: { id: string }) => h.id === 'hl-exp-2',
    );

    expect(hlWithNote).toBeDefined();
    expect(hlWithNote.selected_text).toBe(highlightWithNote.selected_text);
    expect(hlWithNote.note).toBe(highlightWithNote.note);

    expect(hlWithoutNote).toBeDefined();
    expect(hlWithoutNote.selected_text).toBe(highlightWithoutNote.selected_text);
    expect(hlWithoutNote.note).toBeNull();
  });

  it('should throw English error if book is not found', async () => {
    await expect(exportService.exportBookNotes('missing-book-id', 'md')).rejects.toThrow(
      'Book not found',
    );
  });

  it('should write exported file to Filesystem Cache directory', async () => {
    const result = await exportService.saveExportFileToCache('book-export-1', 'md');

    expect(Filesystem.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining('meditations_notes.md'),
        directory: Directory.Cache,
      }),
    );
    expect(result.fileName).toBe('meditations_notes.md');
    expect(result.content).toContain('title: "Meditations"');
  });
});
