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

  private splitIntoChunks(text: string, maxChunkLength: number = 450): string[] {
    if (text.length <= maxChunkLength) {
      return [text];
    }

    const sentences = text.split(/(?<=[.!?…])\s+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if (sentence.length <= maxChunkLength) {
        if (!currentChunk) {
          currentChunk = sentence;
        } else if (currentChunk.length + 1 + sentence.length <= maxChunkLength) {
          currentChunk += ' ' + sentence;
        } else {
          chunks.push(currentChunk);
          currentChunk = sentence;
        }
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }

        const words = sentence.split(/\s+/);
        for (const word of words) {
          if (word.length > maxChunkLength) {
            if (currentChunk) {
              chunks.push(currentChunk);
              currentChunk = '';
            }
            for (let i = 0; i < word.length; i += maxChunkLength) {
              chunks.push(word.slice(i, i + maxChunkLength));
            }
          } else if (!currentChunk) {
            currentChunk = word;
          } else if (currentChunk.length + 1 + word.length <= maxChunkLength) {
            currentChunk += ' ' + word;
          } else {
            chunks.push(currentChunk);
            currentChunk = word;
          }
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  private async translateChunk(
    chunk: string,
    targetLang: string,
    sourceLang: string,
  ): Promise<{ translatedText: string; detectedSource: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const baseUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t`;

    try {
      let response: Response;

      if (chunk.length <= 350) {
        try {
          response = await fetch(`${baseUrl}&q=${encodeURIComponent(chunk)}`, {
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error(`GET request failed: ${response.status}`);
          }
        } catch (err) {
          if (controller.signal.aborted) {
            throw err;
          }
          response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            },
            body: `q=${encodeURIComponent(chunk)}`,
            signal: controller.signal,
          });
        }
      } else {
        try {
          response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            },
            body: `q=${encodeURIComponent(chunk)}`,
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error(`POST request failed: ${response.status}`);
          }
        } catch (err) {
          if (controller.signal.aborted) {
            throw err;
          }
          response = await fetch(`${baseUrl}&q=${encodeURIComponent(chunk)}`, {
            signal: controller.signal,
          });
        }
      }

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
        translatedText: translated,
        detectedSource,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async translateText(
    text: string,
    targetLang: string = 'uk',
    sourceLang: string = 'auto',
  ): Promise<TranslationResult> {
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (!trimmed) {
      return {
        sourceText: '',
        translatedText: '',
        sourceLang,
        targetLang,
      };
    }

    const chunks = this.splitIntoChunks(trimmed, 450);
    const translatedSegments: string[] = [];
    let detectedSource = sourceLang;

    for (const chunk of chunks) {
      const result = await this.translateChunk(chunk, targetLang, sourceLang);
      if (result.translatedText) {
        translatedSegments.push(result.translatedText.trim());
      }
      if (result.detectedSource && result.detectedSource !== 'auto') {
        detectedSource = result.detectedSource;
      }
    }

    return {
      sourceText: trimmed,
      translatedText: translatedSegments.join(' '),
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
