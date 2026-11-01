export type LlmProviderType = 'openai' | 'google' | 'anthropic' | 'custom';

export type AiPromptType = 'explain' | 'character' | 'tldr' | 'dictionary' | 'ping' | 'chat';

export interface LlmSettingsRecord {
  id: number;
  provider: LlmProviderType;
  api_key: string | null;
  base_url: string | null;
  model_id: string;
  temperature: number;
  max_tokens: number;
  is_enabled: number;
  target_language?: string;
  custom_system_prompt?: string | null;
  custom_prompts_json?: string | null;
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
  customUserMessage?: string;
}

export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  error?: string;
}

export interface AiChatMessage {
  id: string;
  bookId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  contextSnippet?: string;
  createdAt: number;
}

export interface CustomQuickPrompt {
  id: string;
  title: string;
  prompt: string;
  icon?: string;
}

export interface DictionaryEntry {
  id?: number;
  bookId?: string | null;
  bookTitle?: string | null;
  word: string;
  lemma?: string;
  partOfSpeech?: string;
  phonetic?: string;
  translation: string;
  contextualDefinition: string;
  generalDefinition?: string;
  synonyms?: string[];
  exampleSentence?: string;
  contextSentence?: string;
  createdAt: number;
}

export interface VocabularyWordRecord {
  id?: number;
  book_id: string | null;
  book_title: string | null;
  word: string;
  lemma: string | null;
  part_of_speech: string | null;
  phonetic: string | null;
  translation: string;
  contextual_definition: string;
  general_definition: string | null;
  synonyms_json: string | null;
  example_sentence: string | null;
  context_sentence: string | null;
  created_at: number;
}
