import { streamText } from 'ai';
import { LlmProviderFactory } from './LlmProviderFactory';
import { AiSettingsRepository } from '../database/AiSettingsRepository';
import { FileHashService } from '../scanner/FileHashService';
import type {
  AiPromptType,
  AiRequestContext,
  LlmSettingsRecord,
  TestConnectionResult,
} from '../../types';

export class AiAssistantService {
  private static instance: AiAssistantService | null = null;
  private readonly repository: AiSettingsRepository;

  constructor(repository: AiSettingsRepository = AiSettingsRepository.getInstance()) {
    this.repository = repository;
  }

  static getInstance(): AiAssistantService {
    if (!AiAssistantService.instance) {
      AiAssistantService.instance = new AiAssistantService();
    }
    return AiAssistantService.instance;
  }

  buildSystemPrompt(promptType: AiPromptType, locale: string = 'en'): string {
    const isUk = locale.toLowerCase().startsWith('uk');

    if (isUk) {
      switch (promptType) {
        case 'explain':
          return 'Ти досвідчений літературний редактор та гід з читання. Поясни наданий уривок тексту, його підтекст, художні засоби та значення для поточної сцени. Відповідай українською мовою, структуровано, лаконічно, без зайвих вступів.';
        case 'character':
          return 'Ти літературний аналітик. Визнач персонажа з наданого уривка: його роль, характер, зв\'язки та поточні наміри. КРИТИЧНО ВАЖЛИВО: жодних спойлерів до майбутніх розділів книги, аналізуй лише в межах поточної сцени. Відповідай українською мовою.';
        case 'dictionary':
          return 'Ти фахівець з мовознавства та контекстного перекладу. Поясни значення виділеного слова, ідіоми чи архаїзму в точному контексті поданого речення. Формат: 1) Коротке тлумачення; 2) Нюанс / етимологія; 3) Контекстний переклад українською мовою.';
        case 'tldr':
          return 'Ти уважний читацький асистент. Склади лаконічний підсумок попереднього розділу книги рівно у 3 марковані пункти найважливіших сюжетних подій, щоб читач міг миттєво пригадати прочитане. Відповідай українською мовою.';
        case 'ping':
        default:
          return 'You are an AI connectivity test assistant. Reply strictly with: Ping acknowledged.';
      }
    }

    switch (promptType) {
      case 'explain':
        return 'You are an insightful literary editor and reading companion. Explain the provided text snippet, its emotional tone, subtext, and narrative significance within the current scene. Keep the explanation concise and structured without fluff.';
      case 'character':
        return 'You are a literary character analyst. Identify the character mentioned in the snippet: describe their role, allegiance, and significance. CRITICAL RULE: Absolutely no spoilers for future chapters; analyze strictly within the provided context.';
      case 'dictionary':
        return 'You are a contextual linguistics expert. Explain the meaning of the selected word, idiom, or archaic term in the exact context of the surrounding sentence. Format: 1) Definition; 2) Etymology or cultural nuance; 3) Accurate localized translation.';
      case 'tldr':
        return 'You are a concise reading assistant. Provide a 60-second catch-up summary of the previous chapter in exactly 3 clear bullet points focusing on critical plot developments.';
      case 'ping':
      default:
        return 'You are an AI connectivity test assistant. Reply strictly with: Ping acknowledged.';
    }
  }

  buildUserPrompt(context: AiRequestContext): string {
    const bookInfo = context.bookTitle ? `Book: "${context.bookTitle}"\n` : '';

    switch (context.promptType) {
      case 'explain':
        return `${bookInfo}Surrounding Scene Context:\n"...${context.surroundingContext || ''}..."\n\nSelected Passage to Explain:\n"${context.selectedText || ''}"`;

      case 'character':
        return `${bookInfo}Surrounding Scene Context:\n"...${context.surroundingContext || ''}..."\n\nCharacter to Analyze:\n"${context.selectedText || ''}"`;

      case 'dictionary':
        return `${bookInfo}Full Sentence Context:\n"${context.surroundingContext || ''}"\n\nWord/Phrase to Define:\n"${context.selectedText || ''}"`;

      case 'tldr':
        return `${bookInfo}Chapter: ${context.chapterTitle || 'Previous Chapter'}\n\nChapter Content:\n${context.previousChapterText || context.surroundingContext || ''}`;

      case 'ping':
      default:
        return 'Ping';
    }
  }

  async generateCacheKey(context: AiRequestContext): Promise<string> {
    const raw = `${context.promptType}:${context.bookId || 'nobook'}:${context.selectedText || ''}:${context.surroundingContext || ''}:${context.chapterTitle || ''}`;
    return await FileHashService.calculateSha256(raw);
  }

  async streamPrompt(
    context: AiRequestContext,
    onToken: (chunk: string) => void,
  ): Promise<string> {
    const settings = await this.repository.getSettings();

    if (!settings.api_key && settings.provider !== 'custom') {
      throw new Error('API key is not configured. Please set your API key in AI Settings.');
    }

    if (settings.provider === 'custom' && !settings.base_url) {
      throw new Error('Base URL is required for custom OpenAI-compatible endpoints.');
    }

    const cacheKey = await this.generateCacheKey(context);
    const cachedResponse = await this.repository.getCachedResponse(cacheKey);

    if (cachedResponse) {
      onToken(cachedResponse);
      return cachedResponse;
    }

    const systemPrompt = this.buildSystemPrompt(context.promptType, context.locale || 'en');
    const userPrompt = this.buildUserPrompt(context);

    try {
      const model = await LlmProviderFactory.createLanguageModel(settings);

      const result = streamText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        temperature: settings.temperature,
      });

      let fullOutput = '';
      for await (const chunk of result.textStream) {
        fullOutput += chunk;
        onToken(chunk);
      }

      if (context.bookId && fullOutput.trim()) {
        await this.repository.saveCachedResponse({
          id: cacheKey,
          book_id: context.bookId,
          prompt_type: context.promptType,
          response_text: fullOutput,
          model_used: `${settings.provider}:${settings.model_id}`,
          created_at: Date.now(),
        });
      }

      return fullOutput;
    } catch (err: unknown) {
      throw this.normalizeError(err);
    }
  }

  async testConnection(settings: LlmSettingsRecord): Promise<TestConnectionResult> {
    if (!settings.api_key && settings.provider !== 'custom') {
      return {
        success: false,
        latencyMs: 0,
        error: 'API key is missing. Please enter your provider key.',
      };
    }

    const startTime = Date.now();
    try {
      const model = await LlmProviderFactory.createLanguageModel(settings);
      const result = streamText({
        model,
        system: 'You are a test assistant. Answer with: Ping acknowledged.',
        prompt: 'Ping',
      });

      let responseText = '';
      for await (const chunk of result.textStream) {
        responseText += chunk;
        if (responseText.length > 5) {
          break;
        }
      }

      const latencyMs = Date.now() - startTime;
      return {
        success: true,
        latencyMs,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const normalized = this.normalizeError(err);
      return {
        success: false,
        latencyMs,
        error: normalized.message,
      };
    }
  }

  private normalizeError(err: unknown): Error {
    if (err instanceof Error) {
      const msg = err.message || '';
      if (msg.includes('401') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('invalid api key')) {
        return new Error('Invalid or expired API key. Please check your credentials in AI Settings.');
      }
      if (msg.includes('429') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('quota')) {
        return new Error('Rate limit or quota exceeded. Please check your provider billing status or try again shortly.');
      }
      if (msg.includes('Failed to fetch') || msg.toLowerCase().includes('networkerror') || msg.includes('ECONNREFUSED')) {
        return new Error('Network connection failed. Verify the base URL and ensure your local server or proxy is reachable.');
      }
      return err;
    }
    return new Error('An unexpected error occurred while communicating with the AI provider.');
  }
}
