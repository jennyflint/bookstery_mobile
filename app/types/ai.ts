export type LlmProviderType = 'openai' | 'google' | 'anthropic' | 'custom';

export type AiPromptType = 'explain' | 'character' | 'tldr' | 'dictionary' | 'ping';

export interface LlmSettingsRecord {
  id: number;
  provider: LlmProviderType;
  api_key: string | null;
  base_url: string | null;
  model_id: string;
  temperature: number;
  max_tokens: number;
  is_enabled: number;
  updated_at: number;
}

export interface AiCacheRecord {
  id: string;
  book_id: string;
  prompt_type: AiPromptType;
  response_text: string;
  model_used: string;
  created_at: number;
}

export interface AiModelPreset {
  id: string;
  name: string;
  provider: LlmProviderType;
  defaultBaseUrl?: string;
  description?: string;
}

export interface AiRequestContext {
  bookId?: string;
  bookTitle?: string;
  promptType: AiPromptType;
  selectedText?: string;
  surroundingContext?: string;
  previousChapterText?: string;
  chapterTitle?: string;
  locale?: string;
}

export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  error?: string;
}
