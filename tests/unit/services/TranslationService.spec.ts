import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TranslationService } from '../../../app/services/translation/TranslationService';
import type { SqliteService } from '../../../app/services/database/SqliteService';

describe('TranslationService', () => {
  let service: TranslationService;
  const mockSqlite = {} as unknown as SqliteService;

  beforeEach(() => {
    service = new TranslationService(mockSqlite);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('translateText', () => {
    it('returns empty result for empty or whitespace-only input', async () => {
      const res = await service.translateText('   \n\t  ', 'uk', 'auto');
      expect(res).toEqual({
        sourceText: '',
        translatedText: '',
        sourceLang: 'auto',
        targetLang: 'uk',
      });
    });

    it('normalizes multiple spaces and translates short text via GET', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          [['Світ', 'World', null, null, 1]],
          null,
          'en',
        ],
      } as Response);

      const res = await service.translateText('  Hello   World  \n  ', 'uk', 'auto');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toContain('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=uk&dt=t&q=Hello%20World');
      expect((options as RequestInit | undefined)?.method).toBeUndefined(); // Default GET
      expect(res).toEqual({
        sourceText: 'Hello World',
        translatedText: 'Світ',
        sourceLang: 'en',
        targetLang: 'uk',
      });
    });

    it('falls back to POST when GET fails for short text (<= 350 chars)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: false,
          status: 414,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => [
            [['Привіт', 'Hello', null, null, 1]],
            null,
            'en',
          ],
        } as Response);

      const res = await service.translateText('Hello', 'uk', 'en');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const [postUrl, postOptions] = fetchSpy.mock.calls[1];
      expect(postUrl).toBe('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=uk&dt=t');
      expect(postOptions?.method).toBe('POST');
      expect(postOptions?.body).toBe('q=Hello');
      expect(res.translatedText).toBe('Привіт');
    });

    it('uses POST first for text between 351 and 450 characters', async () => {
      const text360 = 'A'.repeat(360);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          [['Переклад360', text360, null, null, 1]],
          null,
          'en',
        ],
      } as Response);

      const res = await service.translateText(text360, 'uk', 'auto');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [postUrl, postOptions] = fetchSpy.mock.calls[0];
      expect(postUrl).toBe('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=uk&dt=t');
      expect(postOptions?.method).toBe('POST');
      expect(postOptions?.body).toBe(`q=${encodeURIComponent(text360)}`);
      expect(res.translatedText).toBe('Переклад360');
    });

    it('falls back to GET if POST fails for text between 351 and 450 chars', async () => {
      const text360 = 'B'.repeat(360);
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: false,
          status: 405,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => [
            [['ПерекладB', text360, null, null, 1]],
            null,
            'en',
          ],
        } as Response);

      const res = await service.translateText(text360, 'uk', 'auto');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const [getUrl] = fetchSpy.mock.calls[1];
      expect(getUrl).toContain(`q=${encodeURIComponent(text360)}`);
      expect(res.translatedText).toBe('ПерекладB');
    });

    it('splits large paragraphs (> 450 chars) on sentence boundaries and joins translated chunks', async () => {
      const s1 = 'First sentence is approximately 250 characters long and contains important context. '.repeat(3).trim(); // ~240+ chars
      const s2 = 'Second sentence is another distinct sentence explaining the plot further in details. '.repeat(3).trim();
      const s3 = 'Third sentence concludes this long excerpt for reading testing purposes. '.repeat(3).trim();
      const largeParagraph = `${s1}. ${s2}. ${s3}.`;
      expect(largeParagraph.length).toBeGreaterThan(450);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (urlInput, options) => {
        const url = String(urlInput);
        const body = (options as RequestInit)?.body as string | undefined;
        let query = '';
        if (body) {
          query = decodeURIComponent(body.replace(/^q=/, ''));
        } else {
          const match = url.match(/[?&]q=([^&]+)/);
          if (match) query = decodeURIComponent(match[1]);
        }

        let translatedPiece = 'Частина.';
        if (query.includes('First sentence')) {
          translatedPiece = 'Перша частина.';
        } else if (query.includes('Second sentence')) {
          translatedPiece = 'Друга частина.';
        } else {
          translatedPiece = 'Третя частина.';
        }
        return {
          ok: true,
          status: 200,
          json: async () => [
            [[translatedPiece, 'src', null, null, 1]],
            null,
            'en',
          ],
        } as Response;
      });

      const res = await service.translateText(largeParagraph, 'uk', 'auto');

      expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      // All chunks must be <= 450 characters
      for (const call of fetchSpy.mock.calls) {
        const url = String(call[0]);
        const body = (call[1] as RequestInit)?.body as string | undefined;
        let rawChunk = '';
        if (body) {
          rawChunk = decodeURIComponent(body.replace(/^q=/, ''));
        } else {
          const match = url.match(/[?&]q=([^&]+)/);
          if (match) rawChunk = decodeURIComponent(match[1]);
        }
        expect(rawChunk.length).toBeLessThanOrEqual(450);
      }

      expect(res.translatedText).toContain('Перша частина.');
      expect(res.translatedText).toContain('Друга частина.');
      expect(res.sourceLang).toBe('en');
    });

    it('splits very long sentences (> 450 chars without punctuation) on word boundaries', async () => {
      // 100 words of 6 letters = ~700 characters with spaces, no punctuation
      const longSentence = Array.from({ length: 100 }, (_, i) => `word${i.toString().padStart(3, '0')}`).join(' ');
      expect(longSentence.length).toBeGreaterThan(600);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => [
            [['переклад_шматка', 'src', null, null, 1]],
            null,
            'en',
          ],
        } as Response;
      });

      const res = await service.translateText(longSentence, 'uk', 'auto');

      expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      for (const call of fetchSpy.mock.calls) {
        const body = (call[1] as RequestInit)?.body as string;
        const rawChunk = decodeURIComponent(body.replace(/^q=/, ''));
        expect(rawChunk.length).toBeLessThanOrEqual(450);
      }

      expect(res.translatedText).toBe('переклад_шматка переклад_шматка');
    });

    it('throws error when translation API returns non-ok response on both POST and GET', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      await expect(service.translateText('Failed sentence', 'uk', 'auto')).rejects.toThrow(
        'Translation API request failed with status: 500',
      );
    });
  });
});
