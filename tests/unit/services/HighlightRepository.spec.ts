import { describe, it, expect, beforeEach } from 'vitest';
import { HighlightRepository } from '../../../app/services/database/HighlightRepository';
import { SqliteService } from '../../../app/services/database/SqliteService';
import type { CreateHighlightInput } from '../../../app/types';

describe('HighlightRepository', () => {
  let repository: HighlightRepository;
  let sqliteService: SqliteService;

  const sampleHighlight1: CreateHighlightInput = {
    id: 'hl-1',
    book_id: 'book-100',
    format: 'epub',
    locator: 'epubcfi(/6/4[chap01]!/4/2/10/1:0,/4/2/10/1:25)',
    selected_text: 'The journey of a thousand miles begins with a single step.',
    color: 'yellow',
    note: 'Classic philosophical quote.',
  };

  const sampleHighlight2: CreateHighlightInput = {
    id: 'hl-2',
    book_id: 'book-100',
    format: 'epub',
    locator: 'epubcfi(/6/6[chap02]!/4/2/4/1:0,/4/2/4/1:30)',
    selected_text: 'It is not length of life, but depth of life.',
    color: 'green',
    note: null,
  };

  const sampleHighlightOtherBook: CreateHighlightInput = {
    id: 'hl-3',
    book_id: 'book-200',
    format: 'pdf',
    locator: JSON.stringify({ page: 4, bounds: [10, 20, 100, 40] }),
    selected_text: 'Knowledge speaks, but wisdom listens.',
    color: 'pink',
    note: 'Deep thoughts on listening.',
  };

  beforeEach(async () => {
    localStorage.clear();
    sqliteService = SqliteService.getInstance();
    await sqliteService.init();
    repository = new HighlightRepository(sqliteService);
  });

  it('should create and retrieve highlights for a specific book ordered by created_at DESC', async () => {
    await repository.createHighlight(sampleHighlight1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await repository.createHighlight(sampleHighlight2);
    await repository.createHighlight(sampleHighlightOtherBook);

    const book100Highlights = await repository.getHighlightsByBook('book-100');
    expect(book100Highlights).toHaveLength(2);
    expect(book100Highlights[0].id).toBe('hl-2');
    expect(book100Highlights[0].color).toBe('green');
    expect(book100Highlights[1].id).toBe('hl-1');
    expect(book100Highlights[1].color).toBe('yellow');

    const book200Highlights = await repository.getHighlightsByBook('book-200');
    expect(book200Highlights).toHaveLength(1);
    expect(book200Highlights[0].id).toBe('hl-3');
    expect(book200Highlights[0].format).toBe('pdf');
  });

  it('should get highlight by id and return null when not found', async () => {
    await repository.createHighlight(sampleHighlight1);

    const found = await repository.getHighlightById('hl-1');
    expect(found).not.toBeNull();
    expect(found?.selected_text).toBe(sampleHighlight1.selected_text);

    const notFound = await repository.getHighlightById('non-existent');
    expect(notFound).toBeNull();
  });

  it('should update highlight note and timestamp', async () => {
    await repository.createHighlight(sampleHighlight1);

    const updated = await repository.updateNote('hl-1', 'Updated note content');
    expect(updated.note).toBe('Updated note content');
    expect(updated.updated_at).toBeGreaterThanOrEqual(updated.created_at);

    const fetched = await repository.getHighlightById('hl-1');
    expect(fetched?.note).toBe('Updated note content');
  });

  it('should throw English error when updating note for non-existent highlight', async () => {
    await expect(repository.updateNote('missing-id', 'test')).rejects.toThrow(
      'Highlight not found',
    );
  });

  it('should update highlight color', async () => {
    await repository.createHighlight(sampleHighlight1);

    const updated = await repository.updateColor('hl-1', 'purple');
    expect(updated.color).toBe('purple');

    const fetched = await repository.getHighlightById('hl-1');
    expect(fetched?.color).toBe('purple');
  });

  it('should throw English error when updating color for non-existent highlight', async () => {
    await expect(repository.updateColor('missing-id', 'blue')).rejects.toThrow(
      'Highlight not found',
    );
  });

  it('should delete highlight by id', async () => {
    await repository.createHighlight(sampleHighlight1);
    await repository.createHighlight(sampleHighlight2);

    await repository.deleteHighlight('hl-1');

    const remaining = await repository.getHighlightsByBook('book-100');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('hl-2');

    const deleted = await repository.getHighlightById('hl-1');
    expect(deleted).toBeNull();
  });
});
