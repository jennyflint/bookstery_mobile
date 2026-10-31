import { defineStore } from 'pinia';
import { SqliteService } from '../services/database/SqliteService';
import { TranslationService } from '../services/translation/TranslationService';
import type { DictionaryItem, TranslationResult } from '../types';

export const useDictionaryStore = defineStore('dictionary', {
  state: () => ({
    items: [] as DictionaryItem[],
    activeTranslation: null as TranslationResult | null,
    isLoading: false,
    selectedTargetLang: 'uk',
  }),
  actions: {
    async loadHistory(): Promise<void> {
      this.isLoading = true;
      try {
        const sqlite = SqliteService.getInstance();
        this.items = await sqlite.getDictionaryHistory();
      } finally {
        this.isLoading = false;
      }
    },
    async translate(text: string, targetLang: string = 'uk', bookId: string | null = null): Promise<TranslationResult> {
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
  },
});
