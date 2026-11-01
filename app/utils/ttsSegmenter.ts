import type { TtsSentence } from '../types';

/**
 * Clean up text by removing broken word hyphenations (e.g., across line breaks)
 * and normalizing multiple whitespaces.
 */
export function normalizeTtsText(rawText: string): string {
  if (!rawText) return '';

  return (
    rawText
      // Merge words hyphenated across lines/spaces (supports both Cyrillic and Latin)
      .replace(/([а-яіїєґa-z])-\s+([а-яіїєґa-z])/gi, '$1$2')
      // Normalize whitespace and line breaks
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Automatically detect the language of the text.
 * Recognizes Ukrainian (Cyrillic), Polish, German, French, Spanish, Italian, and English.
 */
export function detectLanguage(text: string): string {
  if (!text) return 'uk-UA';

  // 1. Cyrillic characters (Ukrainian / Slavic)
  const cyrillicMatches = text.match(/[\u0400-\u04FF]/g);
  const cyrillicCount = cyrillicMatches ? cyrillicMatches.length : 0;

  // 2. Specific language diacritics
  const polishMatches = text.match(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g);
  const polishCount = polishMatches ? polishMatches.length : 0;

  const germanMatches = text.match(/[äöüßÄÖÜ]/g);
  const germanCount = germanMatches ? germanMatches.length : 0;

  const frenchMatches = text.match(/[éèêëàâîïôûùçœæÉÈÊËÀÂÎÏÔÛÙÇ]/g);
  const frenchCount = frenchMatches ? frenchMatches.length : 0;

  const spanishMatches = text.match(/[ñáéíóú¿¡ÑÁÉÍÓÚ]/g);
  const spanishCount = spanishMatches ? spanishMatches.length : 0;

  const italianMatches = text.match(/[àèéìíîòóùúÀÈÉÌÍÎÒÓÙÚ]/g);
  const italianCount = italianMatches ? italianMatches.length : 0;

  // 3. Base Latin letters
  const latinMatches = text.match(/[a-zA-Z]/g);
  const latinCount = latinMatches ? latinMatches.length : 0;

  // Cyrillic dominance -> Ukrainian default
  if (cyrillicCount > 0 && cyrillicCount >= latinCount) {
    return 'uk-UA';
  }

  // European languages with distinctive diacritics
  if (polishCount >= 2 && polishCount > germanCount && polishCount > frenchCount) {
    return 'pl-PL';
  }
  if (germanCount >= 2 && germanCount > frenchCount && germanCount > spanishCount) {
    return 'de-DE';
  }
  if (frenchCount >= 2 && frenchCount > spanishCount && frenchCount > italianCount) {
    return 'fr-FR';
  }
  if (spanishCount >= 2 && spanishCount > italianCount) {
    return 'es-ES';
  }
  if (italianCount >= 2) {
    return 'it-IT';
  }

  if (latinCount > 0) {
    return 'en-US';
  }

  return 'uk-UA';
}

/**
 * Segment normalized text into an array of sentence items with sentence indices.
 * Uses Intl.Segmenter with a safe regex fallback when unavailable.
 */
export function segmentIntoSentences(text: string, lang: string = 'uk-UA'): TtsSentence[] {
  const normalized = normalizeTtsText(text);
  if (!normalized) return [];

  const rawSentences: string[] = [];

  if (typeof Intl !== 'undefined' && typeof (Intl as any).Segmenter === 'function') {
    try {
      const segmenter = new (Intl as any).Segmenter(lang, { granularity: 'sentence' });
      for (const segment of segmenter.segment(normalized)) {
        const str = segment.segment ? segment.segment.trim() : '';
        if (str.length > 0) {
          rawSentences.push(str);
        }
      }
    } catch {
      // Fall through to regex fallback on error
    }
  }

  // Fallback regex if Intl.Segmenter is not available or produced no sentences
  if (rawSentences.length === 0) {
    const matches = normalized.match(/[^.!?…\n]+(?:[.!?…]+(?:\s+|$)|$)/g);
    if (matches) {
      for (const match of matches) {
        const trimmed = match.trim();
        if (trimmed.length > 0) {
          rawSentences.push(trimmed);
        }
      }
    } else {
      rawSentences.push(normalized);
    }
  }

  return rawSentences.map((sentence, index) => ({
    index,
    text: sentence,
  }));
}
