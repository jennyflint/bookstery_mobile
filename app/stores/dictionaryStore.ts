import { defineStore } from 'pinia';
import { SqliteService } from '../services/database/SqliteService';
import { TranslationService } from '../services/translation/TranslationService';
import type { DictionaryItem, TranslationResult, VocabularyWordRecord } from '../types';

export const useDictionaryStore = defineStore('dictionary', {
  state: () => ({
    items: [] as DictionaryItem[],
    vocabularyWords: [] as VocabularyWordRecord[],
    activeTranslation: null as TranslationResult | null,
    isLoading: false,
    selectedTargetLang: 'uk',
    selectedBookFilter: '' as string,
    searchQuery: '',
  }),

  getters: {
    uniqueBooks(state): { id: string; title: string }[] {
      const map = new Map<string, string>();
      for (const v of state.vocabularyWords) {
        if (v.book_id && v.book_title) {
          map.set(v.book_id, v.book_title);
        }
      }
      return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
    },

    filteredVocabulary(state): VocabularyWordRecord[] {
      let result = state.vocabularyWords;
      if (state.selectedBookFilter) {
        result = result.filter((item) => item.book_id === state.selectedBookFilter);
      }
      if (state.searchQuery.trim()) {
        const q = state.searchQuery.trim().toLowerCase();
        result = result.filter(
          (item) =>
            item.word.toLowerCase().includes(q) ||
            item.translation.toLowerCase().includes(q) ||
            item.contextual_definition.toLowerCase().includes(q) ||
            (item.lemma && item.lemma.toLowerCase().includes(q)) ||
            (item.general_definition && item.general_definition.toLowerCase().includes(q)),
        );
      }
      return result;
    },
  },

  actions: {
    async loadAll(): Promise<void> {
      this.isLoading = true;
      try {
        await Promise.all([this.loadVocabulary(), this.loadHistory()]);
      } finally {
        this.isLoading = false;
      }
    },

    async loadVocabulary(bookId?: string, search?: string): Promise<void> {
      const sqlite = SqliteService.getInstance();
      await sqlite.init();
      this.vocabularyWords = await sqlite.getVocabularyWords(bookId, search);
    },

    async deleteVocabularyWord(id: number): Promise<void> {
      const sqlite = SqliteService.getInstance();
      await sqlite.deleteVocabularyWord(id);
      this.vocabularyWords = this.vocabularyWords.filter((w) => w.id !== id);
    },

    async loadHistory(): Promise<void> {
      this.isLoading = true;
      try {
        const sqlite = SqliteService.getInstance();
        this.items = await sqlite.getDictionaryHistory();
      } finally {
        this.isLoading = false;
      }
    },

    async translate(
      text: string,
      targetLang: string = 'uk',
      bookId: string | null = null,
    ): Promise<TranslationResult> {
      this.isLoading = true;
      try {
        const translationService = TranslationService.getInstance();
        const result = await translationService.translateText(text, targetLang);
        this.activeTranslation = result;

        if (result.translatedText) {
          const newId = await translationService.saveToDictionary(
            bookId,
            result.sourceText,
            result.translatedText,
            result.sourceLang,
            result.targetLang,
          );
          this.items.unshift({
            id: newId,
            book_id: bookId,
            source_text: result.sourceText,
            translated_text: result.translatedText,
            source_lang: result.sourceLang,
            target_lang: result.targetLang,
            created_at: Date.now(),
          });
        }
        return result;
      } finally {
        this.isLoading = false;
      }
    },

    async deleteItem(id: number): Promise<void> {
      const sqlite = SqliteService.getInstance();
      await sqlite.deleteDictionaryItem(id);
      this.items = this.items.filter((item) => item.id !== id);
    },

    clearActive(): void {
      this.activeTranslation = null;
    },

    setTargetLang(lang: string): void {
      this.selectedTargetLang = lang;
    },

    setBookFilter(bookId: string): void {
      this.selectedBookFilter = bookId;
    },

    setSearchQuery(q: string): void {
      this.searchQuery = q;
    },
  },
});
