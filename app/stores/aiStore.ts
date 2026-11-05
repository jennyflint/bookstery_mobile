import { defineStore } from 'pinia';
import { Clipboard } from '@capacitor/clipboard';
import { AiSettingsRepository } from '../services/database/AiSettingsRepository';
import { AiAssistantService } from '../services/ai/AiAssistantService';
import { AiClientService } from '../services/ai/AiClientService';
import { SqliteService } from '../services/database/SqliteService';
import { TranslationService } from '../services/translation/TranslationService';
import type {
  AiChatMessage,
  AiPromptType,
  AiRequestContext,
  CustomQuickPrompt,
  DictionaryEntry,
  LlmSettingsRecord,
  TestConnectionResult,
  VocabularyWordRecord,
} from '../types';

export const DEFAULT_QUICK_PROMPTS: CustomQuickPrompt[] = [
  {
    id: 'summarize_page',
    title: 'Summarize page',
    prompt: 'Summarize the current page or scene concisely, highlighting key actions.',
  },
  {
    id: 'explain_simply',
    title: 'Explain simply',
    prompt: 'Explain the current passage, its literary nuance, and subtext in simple terms.',
  },
  {
    id: 'key_takeaways',
    title: 'Key takeaways',
    prompt: 'What are the most important narrative takeaways or clues in this scene?',
  },
  {
    id: 'analyze_characters',
    title: 'Analyze characters',
    prompt: 'Analyze the characters present in this scene, their dynamics and motivations.',
  },
];

export const useAiStore = defineStore('ai', {
  state: () => ({
    settings: {
      id: 1,
      provider: 'openai',
      api_key: null,
      base_url: null,
      model_id: 'gpt-4o-mini',
      temperature: 0.5,
      max_tokens: 1000,
      is_enabled: 0,
      target_language: 'uk',
      custom_system_prompt: null,
      custom_prompts_json: null,
      updated_at: 0,
    } as LlmSettingsRecord,

    // Base state
    isInitialized: false,
    isStreaming: false,
    currentOutput: '',
    currentPromptType: null as AiPromptType | null,
    currentSelectionText: '',
    currentContext: null as AiRequestContext | null,
    isSheetOpen: false,
    isSettingsModalOpen: false,
    isOnboardingModalOpen: false,
    activeBookId: null as string | null,
    lastError: null as string | null,
    showInactivityBanner: false,
    inactivityDismissed: false,

    // Chat Drawer state
    isChatDrawerOpen: false,
    chatMessages: [] as AiChatMessage[],
    isChatStreaming: false,
    chatError: null as string | null,
    includePageContext: true,
    attachedSelection: null as string | null,
    customQuickPrompts: [...DEFAULT_QUICK_PROMPTS] as CustomQuickPrompt[],
    activeAbortController: null as AbortController | null,

    // Dictionary Modal state
    isDictionaryModalOpen: false,
    isDictionaryLoading: false,
    dictionaryEntry: null as DictionaryEntry | null,
    dictionaryError: null as string | null,
    isSavedToVocabulary: false,
  }),

  getters: {
    isConfigured(state): boolean {
      if (state.settings.provider === 'custom') {
        return Boolean(state.settings.base_url?.trim());
      }
      return Boolean(state.settings.api_key?.trim());
    },
  },

  actions: {
    async init(): Promise<void> {
      if (this.isInitialized) {
        return;
      }
      await this.loadSettings();
      this.loadCustomPrompts();
      this.isInitialized = true;
    },

    async loadSettings(): Promise<void> {
      const repo = AiSettingsRepository.getInstance();
      this.settings = await repo.getSettings();
      this.loadCustomPrompts();
    },

    loadCustomPrompts(): void {
      if (this.settings.custom_prompts_json) {
        try {
          const parsed = JSON.parse(this.settings.custom_prompts_json) as CustomQuickPrompt[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.customQuickPrompts = parsed;
            return;
          }
        } catch {}
      }
      this.customQuickPrompts = [...DEFAULT_QUICK_PROMPTS];
    },

    async saveSettings(
      partial: Partial<Omit<LlmSettingsRecord, 'id'>>,
    ): Promise<LlmSettingsRecord> {
      const repo = AiSettingsRepository.getInstance();
      this.settings = await repo.saveSettings(partial);
      return this.settings;
    },

    async testConnection(): Promise<TestConnectionResult> {
      const client = AiClientService.getInstance();
      return await client.testConnection(this.settings);
    },

    // ------------------------------------------------------------------------
    // Chat Actions
    // ------------------------------------------------------------------------
    async openChat(bookId: string, initialSelection?: string): Promise<void> {
      await this.init();
      this.activeBookId = bookId;
      this.attachedSelection = initialSelection ? initialSelection.trim() : null;
      this.chatError = null;

      if (!this.isConfigured) {
        this.openOnboardingModal();
        return;
      }

      await this.loadChatHistory(bookId);
      this.isChatDrawerOpen = true;
    },

    closeChat(): void {
      this.abortChatStream();
      this.isChatDrawerOpen = false;
    },

    async loadChatHistory(bookId: string): Promise<void> {
      const sqlite = SqliteService.getInstance();
      await sqlite.init();
      this.chatMessages = await sqlite.getAiChatMessages(bookId);
    },

    async clearChatHistory(bookId: string): Promise<void> {
      this.abortChatStream();
      const sqlite = SqliteService.getInstance();
      await sqlite.clearAiChatMessages(bookId);
      this.chatMessages = [];
    },

    abortChatStream(): void {
      if (this.activeAbortController) {
        this.activeAbortController.abort();
        this.activeAbortController = null;
      }
      this.isChatStreaming = false;
    },

    setAttachedSelection(text: string | null): void {
      this.attachedSelection = text ? text.trim() : null;
    },

    setIncludePageContext(val: boolean): void {
      this.includePageContext = val;
    },

    async sendChatMessage(params: {
      userText: string;
      bookTitle?: string;
      author?: string;
      currentPage?: number | string;
      pageContext?: string | Promise<string>;
    }): Promise<void> {
      const text = typeof params.userText === 'string' ? params.userText.trim() : '';
      if (!text || !this.activeBookId) {
        return;
      }

      if (!this.isConfigured) {
        this.openOnboardingModal();
        return;
      }

      this.abortChatStream();
      this.chatError = null;

      const userMsg: AiChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        bookId: this.activeBookId,
        role: 'user',
        content: text,
        contextSnippet: this.attachedSelection || undefined,
        createdAt: Date.now(),
      };

      this.chatMessages.push(userMsg);
      const sqlite = SqliteService.getInstance();
      await sqlite.saveAiChatMessage(userMsg);

      const attachedQuote = this.attachedSelection;
      this.attachedSelection = null; // Consume selection quote

      const assistantMsg: AiChatMessage = {
        id: `msg-${Date.now() + 1}-${Math.random().toString(36).substring(2, 7)}`,
        bookId: this.activeBookId,
        role: 'assistant',
        content: '',
        createdAt: Date.now() + 1,
      };

      this.chatMessages.push(assistantMsg);
      this.isChatStreaming = true;

      const controller = new AbortController();
      this.activeAbortController = controller;

      try {
        const client = AiClientService.getInstance();
        const history = this.chatMessages.slice(0, -1).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        let resolvedPageContext: string | undefined;
        if (this.includePageContext && params.pageContext !== undefined && params.pageContext !== null) {
          const raw =
            typeof (params.pageContext as Promise<unknown>)?.then === 'function'
              ? await params.pageContext
              : params.pageContext;
          resolvedPageContext = typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
        }

        const result = await client.streamChat({
          bookId: this.activeBookId,
          bookTitle: params.bookTitle,
          author: params.author,
          currentPage: params.currentPage,
          messages: history,
          pageContext: resolvedPageContext,
          selectedText: attachedQuote || undefined,
          customSystemPrompt: this.settings.custom_system_prompt || undefined,
          abortSignal: controller.signal,
          onChunk: (chunk: string) => {
            assistantMsg.content += chunk;
          },
        });

        assistantMsg.content = result || assistantMsg.content;
        await sqlite.saveAiChatMessage(assistantMsg);
      } catch (err: unknown) {
        if (!controller.signal.aborted) {
          const errorObj = err as Error;
          this.chatError = errorObj.message || 'Failed to complete message.';
        }
      } finally {
        this.isChatStreaming = false;
        this.activeAbortController = null;
      }
    },

    async regenerateLastChatMessage(params: {
      bookTitle?: string;
      author?: string;
      currentPage?: number | string;
      pageContext?: string | Promise<string>;
    }): Promise<void> {
      if (!this.activeBookId || this.chatMessages.length === 0) {
        return;
      }

      // If last message is assistant, remove it and re-run with preceding messages
      const lastIndex = this.chatMessages.length - 1;
      let lastUserText = '';
      let contextSnippet: string | undefined;

      if (this.chatMessages[lastIndex].role === 'assistant') {
        const lastMsg = this.chatMessages.pop();
        if (lastMsg && this.activeBookId) {
          const sqlite = SqliteService.getInstance();
          await sqlite.runSql('DELETE FROM ai_chat_messages WHERE id = ?;', [lastMsg.id]);
        }
      }

      if (this.chatMessages.length === 0) {
        return;
      }

      const lastMsg = this.chatMessages[this.chatMessages.length - 1];
      if (lastMsg.role === 'user') {
        lastUserText = lastMsg.content;
        contextSnippet = lastMsg.contextSnippet;
        // Pop user message as sendChatMessage will re-add it
        this.chatMessages.pop();
        if (this.activeBookId) {
          const sqlite = SqliteService.getInstance();
          await sqlite.runSql('DELETE FROM ai_chat_messages WHERE id = ?;', [lastMsg.id]);
        }
      }

      if (lastUserText) {
        this.attachedSelection = contextSnippet || null;
        await this.sendChatMessage({
          userText: lastUserText,
          bookTitle: params.bookTitle,
          author: params.author,
          currentPage: params.currentPage,
          pageContext: params.pageContext,
        });
      }
    },

    async copyChatMessage(content: string): Promise<boolean> {
      if (!content.trim()) return false;
      try {
        await Clipboard.write({ string: content.trim() });
        return true;
      } catch {
        try {
          const translationService = TranslationService.getInstance();
          await translationService.copyToClipboard(content.trim());
          return true;
        } catch {
          return false;
        }
      }
    },

    // ------------------------------------------------------------------------
    // Custom Quick Prompts Management
    // ------------------------------------------------------------------------
    async addCustomQuickPrompt(title: string, prompt: string): Promise<void> {
      const newPrompt: CustomQuickPrompt = {
        id: `qp-${Date.now()}`,
        title: title.trim(),
        prompt: prompt.trim(),
      };
      this.customQuickPrompts.push(newPrompt);
      await this.saveSettings({
        custom_prompts_json: JSON.stringify(this.customQuickPrompts),
      });
    },

    async updateCustomQuickPrompt(id: string, title: string, prompt: string): Promise<void> {
      const idx = this.customQuickPrompts.findIndex((p) => p.id === id);
      if (idx !== -1) {
        this.customQuickPrompts[idx] = {
          ...this.customQuickPrompts[idx],
          title: title.trim(),
          prompt: prompt.trim(),
        };
        await this.saveSettings({
          custom_prompts_json: JSON.stringify(this.customQuickPrompts),
        });
      }
    },

    async deleteCustomQuickPrompt(id: string): Promise<void> {
      this.customQuickPrompts = this.customQuickPrompts.filter((p) => p.id !== id);
      await this.saveSettings({
        custom_prompts_json: JSON.stringify(this.customQuickPrompts),
      });
    },

    // ------------------------------------------------------------------------
    // Dictionary & Vocabulary Actions
    // ------------------------------------------------------------------------
    async lookupWordInDictionary(params: {
      word: string;
      contextSentence: string;
      bookId?: string;
      bookTitle?: string;
    }): Promise<void> {
      await this.init();

      if (!this.isConfigured) {
        this.openOnboardingModal();
        return;
      }

      this.isDictionaryModalOpen = true;
      this.isDictionaryLoading = true;
      this.dictionaryError = null;
      this.dictionaryEntry = null;
      this.isSavedToVocabulary = false;

      try {
        const client = AiClientService.getInstance();
        const entry = await client.lookupDictionary({
          word: params.word.trim(),
          contextSentence: params.contextSentence.trim(),
          bookTitle: params.bookTitle,
          targetLanguage: this.settings.target_language || 'uk',
        });

        entry.bookId = params.bookId;
        entry.bookTitle = params.bookTitle;
        this.dictionaryEntry = entry;
      } catch (err: unknown) {
        const errorObj = err as Error;
        this.dictionaryError = errorObj.message || 'Failed to lookup word in dictionary.';
      } finally {
        this.isDictionaryLoading = false;
      }
    },

    async saveCurrentWordToVocabulary(): Promise<void> {
      if (!this.dictionaryEntry) {
        return;
      }

      const sqlite = SqliteService.getInstance();
      await sqlite.init();

      const wordRecord: Omit<VocabularyWordRecord, 'id'> = {
        book_id: this.dictionaryEntry.bookId || null,
        book_title: this.dictionaryEntry.bookTitle || null,
        word: this.dictionaryEntry.word,
        lemma: this.dictionaryEntry.lemma || null,
        part_of_speech: this.dictionaryEntry.partOfSpeech || null,
        phonetic: this.dictionaryEntry.phonetic || null,
        translation: this.dictionaryEntry.translation,
        contextual_definition: this.dictionaryEntry.contextualDefinition,
        general_definition: this.dictionaryEntry.generalDefinition || null,
        synonyms_json: this.dictionaryEntry.synonyms?.length
          ? JSON.stringify(this.dictionaryEntry.synonyms)
          : null,
        example_sentence: this.dictionaryEntry.exampleSentence || null,
        context_sentence: this.dictionaryEntry.contextSentence || null,
        created_at: Date.now(),
      };

      const newId = await sqlite.saveVocabularyWord(wordRecord);
      this.dictionaryEntry.id = newId;
      this.isSavedToVocabulary = true;
    },

    closeDictionaryModal(): void {
      this.isDictionaryModalOpen = false;
      this.dictionaryError = null;
    },

    // ------------------------------------------------------------------------
    // Legacy One-Off Assistant Actions (Preserved for backward compatibility)
    // ------------------------------------------------------------------------
    async openAssistant(context: AiRequestContext): Promise<void> {
      await this.init();

      this.currentContext = context;
      this.currentPromptType = context.promptType;
      this.currentSelectionText = context.selectedText || '';
      this.activeBookId = context.bookId || null;
      this.lastError = null;

      if (!this.isConfigured) {
        this.isOnboardingModalOpen = true;
        return;
      }

      this.isSheetOpen = true;
      this.currentOutput = '';
      this.isStreaming = true;

      try {
        const service = AiAssistantService.getInstance();
        await service.streamPrompt(context, (chunk) => {
          this.currentOutput += chunk;
        });
      } catch (err: unknown) {
        const errorObj = err as Error;
        this.lastError = errorObj.message || 'Failed to complete AI request.';
      } finally {
        this.isStreaming = false;
      }
    },

    async regenerate(): Promise<void> {
      if (!this.currentContext || !this.isConfigured) {
        return;
      }
      this.currentOutput = '';
      this.lastError = null;
      this.isStreaming = true;

      try {
        const service = AiAssistantService.getInstance();
        await service.streamPrompt(this.currentContext, (chunk) => {
          this.currentOutput += chunk;
        });
      } catch (err: unknown) {
        const errorObj = err as Error;
        this.lastError = errorObj.message || 'Failed to regenerate response.';
      } finally {
        this.isStreaming = false;
      }
    },

    async copyCurrentOutput(): Promise<boolean> {
      if (!this.currentOutput.trim()) {
        return false;
      }
      const translationService = TranslationService.getInstance();
      await translationService.copyToClipboard(this.currentOutput);
      return true;
    },

    closeSheet(): void {
      this.isSheetOpen = false;
      this.isStreaming = false;
    },

    openOnboardingModal(): void {
      this.isOnboardingModalOpen = true;
    },

    openSettingsModal(): void {
      this.isSettingsModalOpen = true;
      this.isOnboardingModalOpen = false;
    },

    closeSettingsModal(): void {
      this.isSettingsModalOpen = false;
    },

    closeOnboardingModal(): void {
      this.isOnboardingModalOpen = false;
    },

    checkInactivityCatchUp(lastReadAt: number): void {
      if (this.inactivityDismissed || !lastReadAt) {
        return;
      }
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - lastReadAt > sevenDaysMs) {
        this.showInactivityBanner = true;
      }
    },

    dismissInactivityBanner(): void {
      this.showInactivityBanner = false;
      this.inactivityDismissed = true;
    },

    async clearCache(bookId?: string): Promise<void> {
      const repo = AiSettingsRepository.getInstance();
      await repo.clearCache(bookId);
    },
  },
});
