import { streamText, generateText } from 'ai';
import { Network } from '@capacitor/network';
import { LlmProviderFactory } from './LlmProviderFactory';
import { AiSettingsRepository } from '../database/AiSettingsRepository';
import type {
  AiChatMessage,
  DictionaryEntry,
  LlmSettingsRecord,
  TestConnectionResult,
} from '../../types';

export interface StreamChatOptions {
  bookId: string;
  bookTitle?: string;
  author?: string;
  currentPage?: number | string;
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  pageContext?: string | Promise<string>;
  selectedText?: string;
  customSystemPrompt?: string;
  abortSignal?: AbortSignal;
  onChunk: (chunk: string) => void;
}

export interface LookupDictionaryOptions {
  word: string;
  contextSentence: string;
  bookTitle?: string;
  targetLanguage?: string;
  abortSignal?: AbortSignal;
}

export class AiClientService {
  private static instance: AiClientService | null = null;
  private readonly repository: AiSettingsRepository;

  constructor(repository: AiSettingsRepository = AiSettingsRepository.getInstance()) {
    this.repository = repository;
  }

  static getInstance(): AiClientService {
    if (!AiClientService.instance) {
      AiClientService.instance = new AiClientService();
    }
    return AiClientService.instance;
  }

  private async checkOnline(): Promise<void> {
    try {
      const status = await Network.getStatus();
      if (!status.connected) {
        throw new Error('Device is offline. Please connect to the internet to use AI features.');
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('Device is offline')) {
        throw err;
      }
      // If Network plugin is not functional on web, proceed
    }
  }

  async testConnection(settings?: LlmSettingsRecord): Promise<TestConnectionResult> {
    const config = settings || (await this.repository.getSettings());

    if (!config.api_key && config.provider !== 'custom') {
      return {
        success: false,
        latencyMs: 0,
        error: 'API key is missing. Please enter your provider key.',
      };
    }

    if (config.provider === 'custom' && !config.base_url?.trim()) {
      return {
        success: false,
        latencyMs: 0,
        error: 'Base URL is required for custom OpenAI-compatible endpoints.',
      };
    }

    const startTime = Date.now();

    try {
      await this.checkOnline();
      const model = await LlmProviderFactory.createLanguageModel(config);
      const result = await generateText({
        model,
        system: 'You are a test assistant. Answer strictly with: Ping acknowledged.',
        prompt: 'Ping',
      });

      if (!result.text) {
        throw new Error('No response from AI provider.');
      }

      return {
        success: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        error: this.normalizeError(err).message,
      };
    }
  }

  async streamChat(options: StreamChatOptions): Promise<string> {
    await this.checkOnline();
    const settings = await this.repository.getSettings();

    if (!settings.api_key && settings.provider !== 'custom') {
      throw new Error('API key is not configured. Please open AI Settings to add your key.');
    }
    if (settings.provider === 'custom' && !settings.base_url?.trim()) {
      throw new Error('Base URL is required for custom OpenAI-compatible endpoints.');
    }

    const model = await LlmProviderFactory.createLanguageModel(settings);

    // Build system prompt
    let system = `You are Bookstery AI, an intelligent, helpful literary reading companion.
You are discussing the book "${options.bookTitle || 'Unknown Title'}"${options.author ? ` by ${options.author}` : ''}.
Current Reader Location: Page/Section ${options.currentPage || 'Unknown'}.

Instructions:
- Discuss themes, character motivations, plot nuances, vocabulary, and literary context with the reader.
- Avoid unsolicited spoilers beyond the current location unless explicitly asked by the user.
- Be concise, engaging, and structured in your explanations. Use markdown formatting where helpful.`;

    const rawPageContext =
      options.pageContext && typeof (options.pageContext as Promise<unknown>).then === 'function'
        ? await options.pageContext
        : options.pageContext;
    const safePageContext = typeof rawPageContext === 'string' ? rawPageContext.trim() : '';
    const safeCustomPrompt =
      typeof options.customSystemPrompt === 'string' ? options.customSystemPrompt.trim() : '';
    const safeSelectedText =
      typeof options.selectedText === 'string' ? options.selectedText.trim() : '';

    if (safeCustomPrompt) {
      system += `\n\nUser Custom Instructions:\n${safeCustomPrompt}`;
    }

    if (safePageContext) {
      system += `\n\nActive Page/Scene Text:\n"""\n${safePageContext.substring(0, 3500)}\n"""`;
    }

    if (safeSelectedText) {
      system += `\n\nCurrently Selected Passage from Book:\n"""\n${safeSelectedText}\n"""`;
    }

    try {
      const result = streamText({
        model,
        system,
        messages: options.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: settings.temperature,
        abortSignal: options.abortSignal,
      });

      let fullText = '';
      for await (const chunk of result.textStream) {
        if (options.abortSignal?.aborted) {
          break;
        }
        fullText += chunk;
        options.onChunk(chunk);
      }

      return fullText;
    } catch (err: unknown) {
      if (options.abortSignal?.aborted) {
        return '';
      }
      throw this.normalizeError(err);
    }
  }

  async lookupDictionary(options: LookupDictionaryOptions): Promise<DictionaryEntry> {
    await this.checkOnline();
    const settings = await this.repository.getSettings();

    if (!settings.api_key && settings.provider !== 'custom') {
      throw new Error('API key is not configured. Please open AI Settings to add your key.');
    }
    if (settings.provider === 'custom' && !settings.base_url?.trim()) {
      throw new Error('Base URL is required for custom OpenAI-compatible endpoints.');
    }

    const targetLang = options.targetLanguage || settings.target_language || 'uk';
    const langName = targetLang === 'uk' ? 'Ukrainian' : targetLang === 'en' ? 'English' : targetLang;

    const system = `You are an expert bilingual lexicographer and literary context analyst.
Your task is to analyze a word or phrase within its exact literary sentence context and produce a structured linguistic breakdown.
Translate and explain in ${langName}.

You MUST respond strictly with a valid JSON object without markdown formatting or code blocks:
{
  "word": "canonical word or phrase",
  "lemma": "base dictionary form (infinitive/singular)",
  "partOfSpeech": "noun, verb, adjective, adverb, idiom, etc.",
  "phonetic": "IPA pronunciation or transcription if known, e.g. /dɪfɪˈnɪʃn/",
  "translation": "direct concise translation into ${langName}",
  "contextualDefinition": "what the word specifically means in this sentence context (in ${langName})",
  "generalDefinition": "broader dictionary definition (in ${langName})",
  "synonyms": ["synonym 1", "synonym 2", "synonym 3"],
  "exampleSentence": "an illustrative example sentence using this word with translation"
}`;

    const prompt = `Book: "${options.bookTitle || 'Reading Book'}"
Context Sentence:
"${options.contextSentence || options.word}"

Target Word/Phrase to Analyze:
"${options.word}"`;

    try {
      const model = await LlmProviderFactory.createLanguageModel(settings);
      const result = await generateText({
        model,
        system,
        prompt,
        temperature: 0.2,
        abortSignal: options.abortSignal,
      });

      const raw = result.text.trim();
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

      let parsed: Partial<DictionaryEntry> = {};
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Fallback simple parsing if model returned free text
        return {
          word: options.word,
          translation: cleaned.split('\n')[0] || options.word,
          contextualDefinition: cleaned,
          contextSentence: options.contextSentence,
          bookTitle: options.bookTitle,
          createdAt: Date.now(),
        };
      }

      return {
        word: parsed.word || options.word,
        lemma: parsed.lemma || options.word,
        partOfSpeech: parsed.partOfSpeech || 'word',
        phonetic: parsed.phonetic || '',
        translation: parsed.translation || options.word,
        contextualDefinition: parsed.contextualDefinition || '',
        generalDefinition: parsed.generalDefinition || '',
        synonyms: Array.isArray(parsed.synonyms) ? parsed.synonyms : [],
        exampleSentence: parsed.exampleSentence || '',
        contextSentence: options.contextSentence,
        bookTitle: options.bookTitle,
        createdAt: Date.now(),
      };
    } catch (err: unknown) {
      if (options.abortSignal?.aborted) {
        throw new Error('Dictionary lookup was cancelled.');
      }
      throw this.normalizeError(err);
    }
  }

  private normalizeError(err: unknown): Error {
    if (err instanceof Error) {
      const msg = err.message || '';
      if (
        msg.includes('401') ||
        msg.toLowerCase().includes('unauthorized') ||
        msg.toLowerCase().includes('invalid api key')
      ) {
        return new Error('Invalid or expired API key. Please check your credentials in AI Settings.');
      }
      if (
        msg.includes('429') ||
        msg.toLowerCase().includes('rate limit') ||
        msg.toLowerCase().includes('quota')
      ) {
        return new Error('Rate limit or quota exceeded. Please check your provider account or try again later.');
      }
      if (
        msg.includes('Failed to fetch') ||
        msg.toLowerCase().includes('networkerror') ||
        msg.includes('ECONNREFUSED')
      ) {
        return new Error('Network error. Unable to connect to AI server. Check your connection or endpoint URL.');
      }
      return err;
    }
    return new Error('An unexpected error occurred while communicating with the AI service.');
  }
}
