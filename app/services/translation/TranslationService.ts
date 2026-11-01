import { Clipboard } from '@capacitor/clipboard';
import { SqliteService } from '../database/SqliteService';
import type { TranslationResult } from '../../types';

export class TranslationService {
  private static instance: TranslationService | null = null;
  private sqliteService: SqliteService;

  constructor(sqliteService?: SqliteService) {
    this.sqliteService = sqliteService || SqliteService.getInstance();
  }

  static getInstance(): TranslationService {
    if (!TranslationService.instance) {
      TranslationService.instance = new TranslationService();
    }
    return TranslationService.instance;
  }

  async translateText(
    text: string,
    targetLang: string = 'uk',
    sourceLang: string = 'auto',
  ): Promise<TranslationResult> {
    const trimmed = text.trim();
    if (!trimmed) {
      return {
        sourceText: '',
        translatedText: '',
        sourceLang,
        targetLang,
      };
    }

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(trimmed)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Translation API request failed with status: ${response.status}`);
    }

    const json = await response.json();
    let translated = '';
    let detectedSource = sourceLang;

    if (Array.isArray(json) && Array.isArray(json[0])) {
      for (const segment of json[0]) {
        if (Array.isArray(segment) && typeof segment[0] === 'string') {
          translated += segment[0];
        }
      }
    }

    if (Array.isArray(json) && typeof json[2] === 'string') {
      detectedSource = json[2];
    }

    return {
      sourceText: trimmed,
      translatedText: translated,
      sourceLang: detectedSource,
      targetLang,
    };
  }

  async saveToDictionary(
    bookId: string | null,
    sourceText: string,
    translatedText: string,
    _sourceLang: string | null = null,
    _targetLang: string = 'uk',
    bookTitle: string | null = null,
  ): Promise<number> {
    let resolvedTitle = bookTitle;
    if (!resolvedTitle && bookId) {
      const book = await this.sqliteService.getBookById(bookId);
      resolvedTitle = book?.title || null;
    }
    return await this.sqliteService.saveVocabularyWord({
      book_id: bookId,
      book_title: resolvedTitle,
      word: sourceText.trim(),
      lemma: null,
      part_of_speech: null,
      phonetic: null,
      translation: translatedText.trim(),
      contextual_definition: translatedText.trim(),
      general_definition: null,
      synonyms_json: null,
      example_sentence: null,
      context_sentence: null,
      created_at: Date.now(),
    });
  }

  openGoogleTranslateIntent(text: string, targetLang: string = 'uk'): void {
    const cleanText = encodeURIComponent(text.trim());
    const nativeUri = `googletranslate://translate?text=${cleanText}&tl=${targetLang}`;
    const webFallback = `https://translate.google.com/?sl=auto&tl=${targetLang}&text=${cleanText}&op=translate`;

    if (typeof window !== 'undefined') {
      window.location.href = nativeUri;
      setTimeout(() => {
        window.open(webFallback, '_blank');
      }, 500);
    }
  }

  async getClipboardText(): Promise<string> {
    try {
      const result = await Clipboard.read();
      return result.value || '';
    } catch {
      return '';
    }
  }

  async copyToClipboard(text: string): Promise<void> {
    await Clipboard.write({ string: text });
  }
}
