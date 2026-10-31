import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiAssistantService } from '../../../app/services/ai/AiAssistantService';
import { LlmProviderFactory } from '../../../app/services/ai/LlmProviderFactory';
import type { AiRequestContext, LlmSettingsRecord } from '../../../app/types';

const mockStreamText = vi.fn();

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    streamText: (...args: unknown[]) => mockStreamText(...args),
  };
});

describe('AiAssistantService', () => {
  let service: AiAssistantService;
  let mockRepository: {
    getSettings: ReturnType<typeof vi.fn>;
    saveSettings: ReturnType<typeof vi.fn>;
    getCachedResponse: ReturnType<typeof vi.fn>;
    saveCachedResponse: ReturnType<typeof vi.fn>;
  };

  const defaultMockSettings: LlmSettingsRecord = {
    id: 1,
    provider: 'openai',
    api_key: 'sk-mock-key-12345',
    base_url: null,
    model_id: 'gpt-4o-mini',
    temperature: 0.5,
    max_tokens: 1000,
    is_enabled: 1,
    updated_at: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepository = {
      getSettings: vi.fn().mockResolvedValue({ ...defaultMockSettings }),
      saveSettings: vi.fn().mockResolvedValue({ ...defaultMockSettings }),
      getCachedResponse: vi.fn().mockResolvedValue(null),
      saveCachedResponse: vi.fn().mockResolvedValue(undefined),
    };

    service = new AiAssistantService(mockRepository as any);
  });

  describe('System Prompt Formatting', () => {
    it('should format English system prompts for all supported prompt types', () => {
      const explainPrompt = service.buildSystemPrompt('explain', 'en');
      expect(explainPrompt).toContain('literary editor');

      const charPrompt = service.buildSystemPrompt('character', 'en');
      expect(charPrompt).toContain('character analyst');
      expect(charPrompt).toContain('no spoilers');

      const dictPrompt = service.buildSystemPrompt('dictionary', 'en');
      expect(dictPrompt).toContain('contextual linguistics expert');

      const tldrPrompt = service.buildSystemPrompt('tldr', 'en');
      expect(tldrPrompt).toContain('3 clear bullet points');
    });

    it('should format Ukrainian system prompts when locale is uk', () => {
      const explainPrompt = service.buildSystemPrompt('explain', 'uk');
      expect(explainPrompt).toContain('літературний редактор');

      const charPrompt = service.buildSystemPrompt('character', 'uk');
      expect(charPrompt).toContain('літературний аналітик');
      expect(charPrompt).toContain('спойлерів');

      const dictPrompt = service.buildSystemPrompt('dictionary', 'uk');
      expect(dictPrompt).toContain('мовознавства');

      const tldrPrompt = service.buildSystemPrompt('tldr', 'uk');
      expect(tldrPrompt).toContain('3 марковані пункти');
    });
  });

  describe('User Prompt Building', () => {
    it('should structure user prompt with book title and surrounding scene context', () => {
      const context: AiRequestContext = {
        bookId: 'book-1',
        bookTitle: 'Dune',
        promptType: 'explain',
        selectedText: 'Fear is the mind-killer',
        surroundingContext: 'I must not fear. Fear is the mind-killer. Fear is the little-death.',
        locale: 'en',
      };

      const prompt = service.buildUserPrompt(context);
      expect(prompt).toContain('Book: "Dune"');
      expect(prompt).toContain('Fear is the mind-killer');
      expect(prompt).toContain('Surrounding Scene Context:');
    });
  });

  describe('Validation & Guardrails', () => {
    it('should throw error when API key is missing for standard provider', async () => {
      mockRepository.getSettings.mockResolvedValue({
        ...defaultMockSettings,
        api_key: null,
      });

      const context: AiRequestContext = {
        bookId: 'book-1',
        promptType: 'explain',
        selectedText: 'Some passage',
      };

      await expect(service.streamPrompt(context, vi.fn())).rejects.toThrow(
        'API key is not configured',
      );
    });

    it('should throw error when base URL is missing for custom provider', async () => {
      mockRepository.getSettings.mockResolvedValue({
        ...defaultMockSettings,
        provider: 'custom',
        api_key: null,
        base_url: null,
      });

      const context: AiRequestContext = {
        bookId: 'book-1',
        promptType: 'explain',
        selectedText: 'Some passage',
      };

      await expect(service.streamPrompt(context, vi.fn())).rejects.toThrow(
        'Base URL is required',
      );
    });
  });

  describe('Cache Hit Acceleration', () => {
    it('should return cached response immediately without calling language model', async () => {
      const cachedContent = 'This is a pre-cached literary explanation.';
      mockRepository.getCachedResponse.mockResolvedValue(cachedContent);

      const tokenSpy = vi.fn();
      const createModelSpy = vi.spyOn(LlmProviderFactory, 'createLanguageModel');

      const context: AiRequestContext = {
        bookId: 'book-1',
        promptType: 'explain',
        selectedText: 'Sample sentence',
      };

      const result = await service.streamPrompt(context, tokenSpy);

      expect(result).toBe(cachedContent);
      expect(tokenSpy).toHaveBeenCalledWith(cachedContent);
      expect(createModelSpy).not.toHaveBeenCalled();
    });
  });

  describe('Streaming & Error Normalization', () => {
    it('should stream tokens from language model and cache the complete result', async () => {
      vi.spyOn(LlmProviderFactory, 'createLanguageModel').mockResolvedValue({} as any);

      async function* generateMockStream() {
        yield 'Token 1 ';
        yield 'Token 2 ';
        yield 'Finished.';
      }

      mockStreamText.mockReturnValue({
        textStream: generateMockStream(),
      } as any);

      const receivedTokens: string[] = [];
      const context: AiRequestContext = {
        bookId: 'book-1',
        promptType: 'explain',
        selectedText: 'Snippet',
      };

      const finalOutput = await service.streamPrompt(context, (chunk) => {
        receivedTokens.push(chunk);
      });

      expect(finalOutput).toBe('Token 1 Token 2 Finished.');
      expect(receivedTokens).toEqual(['Token 1 ', 'Token 2 ', 'Finished.']);
      expect(mockRepository.saveCachedResponse).toHaveBeenCalledTimes(1);
    });

    it('should normalize 401 unauthorized errors into user-friendly message', async () => {
      vi.spyOn(LlmProviderFactory, 'createLanguageModel').mockResolvedValue({} as any);

      mockStreamText.mockImplementation(() => {
        throw new Error('HTTP 401 Unauthorized: Invalid API key');
      });

      const context: AiRequestContext = {
        bookId: 'book-1',
        promptType: 'explain',
        selectedText: 'Snippet',
      };

      await expect(service.streamPrompt(context, vi.fn())).rejects.toThrow(
        'Invalid or expired API key',
      );
    });

    it('should normalize 429 rate limit errors into user-friendly message', async () => {
      vi.spyOn(LlmProviderFactory, 'createLanguageModel').mockResolvedValue({} as any);

      mockStreamText.mockImplementation(() => {
        throw new Error('429 Rate limit exceeded');
      });

      const context: AiRequestContext = {
        bookId: 'book-1',
        promptType: 'explain',
        selectedText: 'Snippet',
      };

      await expect(service.streamPrompt(context, vi.fn())).rejects.toThrow(
        'Rate limit or quota exceeded',
      );
    });
  });

  describe('Connection Test Ping', () => {
    it('should return success and measure latency when ping succeeds', async () => {
      vi.spyOn(LlmProviderFactory, 'createLanguageModel').mockResolvedValue({} as any);

      async function* generatePingStream() {
        yield 'Ping acknowledged.';
      }

      mockStreamText.mockReturnValue({
        textStream: generatePingStream(),
      } as any);

      const result = await service.testConnection(defaultMockSettings);
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return failure with error diagnostic when ping fails', async () => {
      vi.spyOn(LlmProviderFactory, 'createLanguageModel').mockResolvedValue({} as any);

      mockStreamText.mockImplementation(() => {
        throw new Error('Failed to fetch from endpoint');
      });

      const result = await service.testConnection(defaultMockSettings);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network connection failed');
    });
  });
});
