import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiClientService } from '../../../app/services/ai/AiClientService';
import { LlmProviderFactory } from '../../../app/services/ai/LlmProviderFactory';
import { mockNetworkStatus } from '../../mocks/capacitor-plugins';
import type { LlmSettingsRecord } from '../../../app/types';

const mockGenerateText = vi.fn();
const mockStreamText = vi.fn();

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: (...args: unknown[]) => mockGenerateText(...args),
    streamText: (...args: unknown[]) => mockStreamText(...args),
  };
});

describe('AiClientService', () => {
  let service: AiClientService;
  let mockRepository: {
    getSettings: ReturnType<typeof vi.fn>;
    saveSettings: ReturnType<typeof vi.fn>;
  };

  const defaultMockSettings: LlmSettingsRecord = {
    id: 1,
    provider: 'openai',
    api_key: 'sk-test-mock-key-12345',
    base_url: null,
    model_id: 'gpt-4o-mini',
    temperature: 0.3,
    max_tokens: 1000,
    is_enabled: 1,
    target_language: 'uk',
    custom_system_prompt: 'Custom literary advice',
    custom_prompts_json: '[]',
    updated_at: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockNetworkStatus.connected = true;

    mockRepository = {
      getSettings: vi.fn().mockResolvedValue({ ...defaultMockSettings }),
      saveSettings: vi.fn().mockResolvedValue({ ...defaultMockSettings }),
    };

    service = new AiClientService(mockRepository as any);
  });

  describe('testConnection', () => {
    it('should return failure if API key is missing for standard provider', async () => {
      const result = await service.testConnection({
        ...defaultMockSettings,
        api_key: null,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API key is missing');
    });

    it('should return failure if base_url is missing for custom provider', async () => {
      const result = await service.testConnection({
        ...defaultMockSettings,
        provider: 'custom',
        api_key: null,
        base_url: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Base URL is required');
    });

    it('should return success and latency when ping test succeeds', async () => {
      vi.spyOn(LlmProviderFactory, 'createLanguageModel').mockResolvedValue({} as any);
      mockGenerateText.mockResolvedValue({
        text: 'Ping acknowledged.',
      });

      const result = await service.testConnection(defaultMockSettings);

      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Ping',
        }),
      );
    });

    it('should return failure with normalized error when ping fails', async () => {
      vi.spyOn(LlmProviderFactory, 'createLanguageModel').mockResolvedValue({} as any);
      mockGenerateText.mockRejectedValue(new Error('HTTP 401 Unauthorized: Invalid API key'));

      const result = await service.testConnection(defaultMockSettings);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid or expired API key');
    });

    it('should return failure when device is offline', async () => {
      mockNetworkStatus.connected = false;

      const result = await service.testConnection(defaultMockSettings);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Device is offline');
    });
  });

  describe('streamChat', () => {
    it('should throw error if API key is missing', async () => {
      mockRepository.getSettings.mockResolvedValue({
        ...defaultMockSettings,
        api_key: null,
      });

      await expect(
        service.streamChat({
          bookId: 'book-1',
          messages: [{ role: 'user', content: 'Hello' }],
          onChunk: vi.fn(),
        }),
      ).rejects.toThrow('API key is not configured');
    });

    it('should throw error if base URL is missing for custom provider', async () => {
      mockRepository.getSettings.mockResolvedValue({
        ...defaultMockSettings,
        provider: 'custom',
        api_key: null,
        base_url: '',
      });

      await expect(
        service.streamChat({
          bookId: 'book-1',
          messages: [{ role: 'user', content: 'Hello' }],
          onChunk: vi.fn(),
        }),
      ).rejects.toThrow('Base URL is required');
    });

    it('should format system prompt with book details, active page text, selected text, and custom instructions', async () => {
      vi.spyOn(LlmProviderFactory, 'createLanguageModel').mockResolvedValue({} as any);

      async function* mockStream() {
        yield 'Hello ';
        yield 'world!';
      }

      mockStreamText.mockReturnValue({
        textStream: mockStream(),
      } as any);

      const chunks: string[] = [];
      const onChunk = (chunk: string) => chunks.push(chunk);

      const result = await service.streamChat({
        bookId: 'book-1',
        bookTitle: 'Dune',
        author: 'Frank Herbert',
        currentPage: 42,
        pageContext: 'Desert landscape with giant worms.',
        selectedText: 'Fear is the mind-killer.',
        customSystemPrompt: 'Focus on philosophical themes.',
        messages: [{ role: 'user', content: 'What is the Litany Against Fear?' }],
        onChunk,
      });

      expect(result).toBe('Hello world!');
      expect(chunks).toEqual(['Hello ', 'world!']);

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('Dune'),
          messages: [{ role: 'user', content: 'What is the Litany Against Fear?' }],
        }),
      );

      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs.system).toContain('Frank Herbert');
      expect(callArgs.system).toContain('Page/Section 42');
      expect(callArgs.system).toContain('Desert landscape with giant worms.');
      expect(callArgs.system).toContain('Fear is the mind-killer.');
      expect(callArgs.system).toContain('Focus on philosophical themes.');
    });

    it('should exit cleanly when abort signal is triggered', async () => {
      vi.spyOn(LlmProviderFactory, 'createLanguageModel').mockResolvedValue({} as any);

      const controller = new AbortController();

      async function* mockInfiniteStream() {
        yield 'First chunk';
        controller.abort();
        yield 'Second chunk';
      }

      mockStreamText.mockReturnValue({
        textStream: mockInfiniteStream(),
      } as any);

      const chunks: string[] = [];
      const result = await service.streamChat({
        bookId: 'book-1',
        messages: [{ role: 'user', content: 'Hi' }],
        abortSignal: controller.signal,
        onChunk: (c) => chunks.push(c),
      });

      expect(result).toBe('First chunk');
      expect(chunks).toEqual(['First chunk']);
    });

    it('should normalize rate limit errors during streaming', async () => {
      vi.spyOn(LlmProviderFactory, 'createLanguageModel').mockResolvedValue({} as any);

      mockStreamText.mockImplementation(() => {
        throw new Error('429 Rate limit reached');
      });

      await expect(
        service.streamChat({
          bookId: 'book-1',
          messages: [{ role: 'user', content: 'Hi' }],
          onChunk: vi.fn(),
        }),
      ).rejects.toThrow('Rate limit or quota exceeded');
    });

    it('should safely handle Promise<string> as pageContext without throwing trim error', async () => {
      vi.spyOn(LlmProviderFactory, 'createLanguageModel').mockResolvedValue({} as any);

      async function* mockTextStream() {
        yield 'Response chunk';
      }

      mockStreamText.mockReturnValue({
        textStream: mockTextStream(),
      } as any);

      const asyncPageContext = Promise.resolve('Asynchronously resolved PDF page text.');

      const result = await service.streamChat({
        bookId: 'book-1',
        messages: [{ role: 'user', content: 'What is happening?' }],
        pageContext: asyncPageContext,
        onChunk: vi.fn(),
      });

      expect(result).toBe('Response chunk');
      expect(mockStreamText).toHaveBeenCalled();
      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs.system).toContain('Asynchronously resolved PDF page text.');
    });

    it('should safely handle non-string values in pageContext, customSystemPrompt, and selectedText', async () => {
      vi.spyOn(LlmProviderFactory, 'createLanguageModel').mockResolvedValue({} as any);

      async function* mockTextStream() {
        yield 'Safe response';
      }

      mockStreamText.mockReturnValue({
        textStream: mockTextStream(),
      } as any);

      const result = await service.streamChat({
        bookId: 'book-1',
        messages: [{ role: 'user', content: 'Hello' }],
        pageContext: 12345 as unknown as string,
        customSystemPrompt: { prompt: 'bad' } as unknown as string,
        selectedText: null as unknown as string,
        onChunk: vi.fn(),
      });

      expect(result).toBe('Safe response');
    });
  });

  describe('lookupDictionary', () => {
    it('should throw error if API key is not configured', async () => {
      mockRepository.getSettings.mockResolvedValue({
        ...defaultMockSettings,
        api_key: null,
      });

      await expect(
        service.lookupDictionary({
          word: 'ephemeral',
          contextSentence: 'Life is ephemeral and fleeting.',
        }),
      ).rejects.toThrow('API key is not configured');
    });

    it('should parse valid JSON response into structured DictionaryEntry', async () => {
      vi.spyOn(LlmProviderFactory, 'createLanguageModel').mockResolvedValue({} as any);

      const mockDictionaryPayload = {
        word: 'ephemeral',
        lemma: 'ephemeral',
        partOfSpeech: 'adjective',
        phonetic: '/ɪˈfem.ər.əl/',
        translation: 'ефемерний, скороминущий',
        contextualDefinition: 'що триває дуже короткий проміжок часу',
        generalDefinition: 'короткочасний, перехідний',
        synonyms: ['transient', 'fleeting', 'momentary'],
        exampleSentence: 'Fame in the digital age is often ephemeral.',
      };

      mockGenerateText.mockResolvedValue({
        text: JSON.stringify(mockDictionaryPayload),
      });

      const entry = await service.lookupDictionary({
        word: 'ephemeral',
        contextSentence: 'Life is ephemeral and fleeting.',
        bookTitle: 'Meditations',
        targetLanguage: 'uk',
      });

      expect(entry.word).toBe('ephemeral');
      expect(entry.translation).toBe('ефемерний, скороминущий');
      expect(entry.partOfSpeech).toBe('adjective');
      expect(entry.synonyms).toEqual(['transient', 'fleeting', 'momentary']);
      expect(entry.contextSentence).toBe('Life is ephemeral and fleeting.');
      expect(entry.bookTitle).toBe('Meditations');
      expect(entry.createdAt).toBeGreaterThan(0);
    });

    it('should parse JSON even when wrapped in markdown code fences', async () => {
      vi.spyOn(LlmProviderFactory, 'createLanguageModel').mockResolvedValue({} as any);

      const mockData = {
        word: 'labyrinth',
        lemma: 'labyrinth',
        partOfSpeech: 'noun',
        phonetic: '/ˈlæb.ə.rɪnθ/',
        translation: 'лабіринт',
        contextualDefinition: 'складне переплетіння шляхів',
        generalDefinition: 'заплутана мережа проходів',
        synonyms: ['maze', 'tangle', 'network'],
        exampleSentence: 'He got lost in the labyrinth of streets.',
      };

      mockGenerateText.mockResolvedValue({
        text: `\`\`\`json\n${JSON.stringify(mockData, null, 2)}\n\`\`\``,
      });

      const entry = await service.lookupDictionary({
        word: 'labyrinth',
        contextSentence: 'The old city was a labyrinth of dark alleys.',
      });

      expect(entry.word).toBe('labyrinth');
      expect(entry.translation).toBe('лабіринт');
      expect(entry.synonyms).toEqual(['maze', 'tangle', 'network']);
    });

    it('should fall back to raw text parsing if response is not valid JSON', async () => {
      vi.spyOn(LlmProviderFactory, 'createLanguageModel').mockResolvedValue({} as any);

      mockGenerateText.mockResolvedValue({
        text: 'Швидкоплинний — той, що швидко зникає.',
      });

      const entry = await service.lookupDictionary({
        word: 'fleeting',
        contextSentence: 'A fleeting moment of joy.',
      });

      expect(entry.word).toBe('fleeting');
      expect(entry.translation).toBe('Швидкоплинний — той, що швидко зникає.');
      expect(entry.contextSentence).toBe('A fleeting moment of joy.');
    });

    it('should throw cancellation error when abort signal is aborted', async () => {
      vi.spyOn(LlmProviderFactory, 'createLanguageModel').mockResolvedValue({} as any);

      const controller = new AbortController();
      controller.abort();

      mockGenerateText.mockRejectedValue(new Error('AbortError: The operation was aborted.'));

      await expect(
        service.lookupDictionary({
          word: 'test',
          contextSentence: 'test sentence',
          abortSignal: controller.signal,
        }),
      ).rejects.toThrow('Dictionary lookup was cancelled.');
    });
  });
});
