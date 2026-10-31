import { defineStore } from 'pinia';
import { AiSettingsRepository } from '../services/database/AiSettingsRepository';
import { AiAssistantService } from '../services/ai/AiAssistantService';
import { TranslationService } from '../services/translation/TranslationService';
import type {
  AiPromptType,
  AiRequestContext,
  LlmSettingsRecord,
  TestConnectionResult,
} from '../types';

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
      updated_at: 0,
    } as LlmSettingsRecord,
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
      this.isInitialized = true;
    },

    async loadSettings(): Promise<void> {
      const repo = AiSettingsRepository.getInstance();
      this.settings = await repo.getSettings();
    },

    async saveSettings(
      partial: Partial<Omit<LlmSettingsRecord, 'id'>>,
    ): Promise<LlmSettingsRecord> {
      const repo = AiSettingsRepository.getInstance();
      this.settings = await repo.saveSettings(partial);
      return this.settings;
    },

    async testConnection(): Promise<TestConnectionResult> {
      const service = AiAssistantService.getInstance();
      return await service.testConnection(this.settings);
    },

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
