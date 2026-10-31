import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useHighlightStore } from '../../../app/stores/highlightStore';
import { SqliteService } from '../../../app/services/database/SqliteService';

describe('highlightStore', () => {
  let store: ReturnType<typeof useHighlightStore>;

  beforeEach(async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    const sqlite = SqliteService.getInstance();
    await sqlite.init();
    store = useHighlightStore();
    store.setBookContext('book-test-1', 'Meditations', 'Marcus Aurelius', 'epub');
  });

  it('should create highlight from active selection', async () => {
    store.setActiveSelection({
      text: 'Waste no more time arguing what a good man should be. Be one.',
      locator: 'epubcfi(/6/2[book]!/4/2/1)',
      format: 'epub',
      x: 150,
      y: 200,
    });

    const created = await store.createHighlight('green', 'Classic stoic advice');
    expect(created).not.toBeNull();
    expect(created?.selected_text).toContain('Waste no more time');
    expect(created?.color).toBe('green');
    expect(created?.note).toBe('Classic stoic advice');

    expect(store.highlights).toHaveLength(1);
    expect(store.totalHighlightsCount).toBe(1);
    expect(store.activeSelection).toBeNull();
  });

  it('should filter highlights by color and search query', async () => {
    store.setActiveSelection({
      text: 'First highlight quote about wisdom',
      locator: '1',
      format: 'epub',
      x: 100,
      y: 100,
    });
    await store.createHighlight('yellow');

    store.setActiveSelection({
      text: 'Second highlight quote about courage',
      locator: '2',
      format: 'epub',
      x: 100,
      y: 100,
    });
    await store.createHighlight('green');

    expect(store.filteredHighlights).toHaveLength(2);

    store.setColorFilter('green');
    expect(store.filteredHighlights).toHaveLength(1);
    expect(store.filteredHighlights[0].color).toBe('green');

    store.setColorFilter(null);
    store.setSearchQuery('courage');
    expect(store.filteredHighlights).toHaveLength(1);
    expect(store.filteredHighlights[0].selected_text).toContain('courage');
  });

  it('should draft and save note for existing highlight', async () => {
    store.setActiveSelection({
      text: 'Dwell on the beauty of life.',
      locator: '3',
      format: 'epub',
      x: 100,
      y: 100,
    });
    const created = await store.createHighlight('purple');
    expect(created).not.toBeNull();

    if (!created) return;

    store.openNoteEditorForExisting(created);
    expect(store.isNoteModalOpen).toBe(true);
    expect(store.draftQuoteText).toBe(created.selected_text);

    await store.saveDraftNote('Added thought about beauty.');
    expect(store.isNoteModalOpen).toBe(false);

    const updated = store.highlights.find((h) => h.id === created.id);
    expect(updated?.note).toBe('Added thought about beauty.');
  });

  it('should open and configure quote card modal', () => {
    store.setActiveSelection({
      text: 'Very inspiring quote',
      locator: '4',
      format: 'epub',
      x: 100,
      y: 100,
    });

    store.openQuoteCardForSelection();
    expect(store.isQuoteCardModalOpen).toBe(true);
    expect(store.quoteCardOptions).not.toBeNull();
    expect(store.quoteCardOptions?.quoteText).toBe('Very inspiring quote');
    expect(store.quoteCardOptions?.bookTitle).toBe('Meditations');
    expect(store.quoteCardOptions?.author).toBe('Marcus Aurelius');

    store.closeQuoteCardModal();
    expect(store.isQuoteCardModalOpen).toBe(false);
  });

  it('should delete highlight and update store list', async () => {
    store.setActiveSelection({
      text: 'Delete me later',
      locator: '5',
      format: 'epub',
      x: 100,
      y: 100,
    });
    const created = await store.createHighlight('pink');
    expect(created).not.toBeNull();
    expect(store.highlights).toHaveLength(1);

    if (!created) return;
    await store.deleteHighlight(created.id);
    expect(store.highlights).toHaveLength(0);
  });
});
