import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDictionaryStore } from '../../../app/stores/dictionaryStore';
import { SqliteService } from '../../../app/services/database/SqliteService';

describe('useDictionaryStore', () => {
  beforeEach(async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    const sqlite = SqliteService.getInstance();
    await sqlite.init();
  });

  it('should initialize with empty state', () => {
    const store = useDictionaryStore();
    expect(store.vocabularyWords).toEqual([]);
    expect(store.isLoading).toBe(false);
  });

  it('should save translated word directly to vocabulary', async () => {
    const store = useDictionaryStore();
    const id = await store.saveTranslatedWord('courage', 'мужність', 'book-1', 'Test Book');

    expect(id).toBeDefined();
    expect(store.vocabularyWords).toHaveLength(1);
    expect(store.vocabularyWords[0].word).toBe('courage');
    expect(store.vocabularyWords[0].translation).toBe('мужність');
    expect(store.vocabularyWords[0].contextual_definition).toBe('мужність');
    expect(store.vocabularyWords[0].book_id).toBe('book-1');
  });

  it('should migrate existing dictionary history into vocabulary and clear history', async () => {
    const sqlite = SqliteService.getInstance();
    // Simulate legacy dictionary history items
    const rawLegacy = [
      {
        id: 1,
        book_id: 'book-1',
        source_text: 'wanderlust',
        translated_text: 'жага до мандрів',
        source_lang: 'en',
        target_lang: 'uk',
        created_at: Date.now() - 5000,
      },
    ];
    localStorage.setItem('bookstery_dictionary', JSON.stringify(rawLegacy));

    const store = useDictionaryStore();
    await store.loadAll();

    // The legacy item should now be in vocabularyWords
    expect(store.vocabularyWords.some((w) => w.word === 'wanderlust')).toBe(true);

    // And the legacy dictionary history should be cleared
    const history = await sqlite.getDictionaryHistory();
    expect(history).toHaveLength(0);
  });

  it('should filter vocabulary by search query and book filter', async () => {
    const store = useDictionaryStore();
    await store.saveTranslatedWord('apple', 'яблуко', 'book-1', 'Book One');
    await store.saveTranslatedWord('banana', 'банан', 'book-2', 'Book Two');

    store.setSearchQuery('apple');
    expect(store.filteredVocabulary).toHaveLength(1);
    expect(store.filteredVocabulary[0].word).toBe('apple');

    store.setSearchQuery('');
    store.setBookFilter('book-2');
    expect(store.filteredVocabulary).toHaveLength(1);
    expect(store.filteredVocabulary[0].word).toBe('banana');
  });

  it('should delete word from vocabulary', async () => {
    const store = useDictionaryStore();
    const id = await store.saveTranslatedWord('ephemeral', 'ефемерний');
    expect(store.vocabularyWords).toHaveLength(1);

    await store.deleteVocabularyWord(id);
    expect(store.vocabularyWords).toHaveLength(0);
  });
});
