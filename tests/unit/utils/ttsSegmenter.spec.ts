import { describe, it, expect } from 'vitest';
import {
  normalizeTtsText,
  detectLanguage,
  segmentIntoSentences,
} from '../../../app/utils/ttsSegmenter';

describe('ttsSegmenter utils', () => {
  describe('normalizeTtsText', () => {
    it('merges words broken across lines with hyphens for Cyrillic', () => {
      const input = 'Це перше ре-\nчення, роз- \n бите на кілька рядків.';
      const output = normalizeTtsText(input);
      expect(output).toBe('Це перше речення, розбите на кілька рядків.');
    });

    it('merges words broken across lines with hyphens for Latin', () => {
      const input = 'This is an amaz-\n   ing test of head-\nphones.';
      const output = normalizeTtsText(input);
      expect(output).toBe('This is an amazing test of headphones.');
    });

    it('normalizes excessive whitespace, tabs, and line breaks into single spaces', () => {
      const input = '  Багато \t\t пробілів    і \n\n рядків.  ';
      const output = normalizeTtsText(input);
      expect(output).toBe('Багато пробілів і рядків.');
    });

    it('returns empty string for null or empty input', () => {
      expect(normalizeTtsText('')).toBe('');
      expect(normalizeTtsText(null as unknown as string)).toBe('');
    });
  });

  describe('detectLanguage', () => {
    it('detects Ukrainian when text is predominantly Cyrillic', () => {
      const text = 'Слава Україні! Героям слава!';
      expect(detectLanguage(text)).toBe('uk-UA');
    });

    it('detects English when text is predominantly Latin', () => {
      const text = 'The quick brown fox jumps over the lazy dog.';
      expect(detectLanguage(text)).toBe('en-US');
    });

    it('defaults to Ukrainian when Cyrillic characters exceed Latin in mixed text', () => {
      const text = 'Книга про програмування на TypeScript та Vue 3.';
      // Cyrillic count > Latin count
      expect(detectLanguage(text)).toBe('uk-UA');
    });

    it('defaults to English when Latin characters exceed Cyrillic in mixed text', () => {
      const text = 'Modern Vue 3 application built with Vite and TypeScript (версія 1.0).';
      expect(detectLanguage(text)).toBe('en-US');
    });

    it('detects German, Polish, French, and Spanish based on distinctive diacritics', () => {
      expect(detectLanguage('Über den großen Bäumen flog der schöne weiße Vogel.')).toBe('de-DE');
      expect(detectLanguage('Zażółć gęślą jaźń i chroń te piękne polskie słowa.')).toBe('pl-PL');
      expect(detectLanguage('C’est un très beau garçon qui parle français.')).toBe('fr-FR');
      expect(detectLanguage('¿Dónde está el niño español que come manzanas?')).toBe('es-ES');
    });
  });

  describe('segmentIntoSentences', () => {
    it('segments text into individual sentences with 0-based indices', () => {
      const text = 'Перше речення. Друге речення! Чи це третє речення?';
      const sentences = segmentIntoSentences(text, 'uk-UA');

      expect(sentences.length).toBe(3);
      expect(sentences[0]).toEqual({ index: 0, text: 'Перше речення.' });
      expect(sentences[1]).toEqual({ index: 1, text: 'Друге речення!' });
      expect(sentences[2]).toEqual({ index: 2, text: 'Чи це третє речення?' });
    });

    it('cleans up hyphenation and whitespace prior to segmentation', () => {
      const text = 'Чудо-\nва кни-\nга.   Другий абзац.';
      const sentences = segmentIntoSentences(text, 'uk-UA');

      expect(sentences.length).toBe(2);
      expect(sentences[0].text).toBe('Чудова книга.');
      expect(sentences[1].text).toBe('Другий абзац.');
    });

    it('handles empty or whitespace-only input safely', () => {
      expect(segmentIntoSentences('')).toEqual([]);
      expect(segmentIntoSentences('   \n\t  ')).toEqual([]);
    });
  });
});
