import type { LanguageModel } from 'ai';
import type { AiModelPreset, LlmProviderType, LlmSettingsRecord } from '../../types';

export const AI_PROVIDER_PRESETS: Record<LlmProviderType, AiModelPreset[]> = {
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', description: 'Fast, lightweight and cost-effective' },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', description: 'High-intelligence flagship model' },
  ],
  google: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', description: 'Fast multimodal model' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', description: 'Complex reasoning flagship' },
  ],
  anthropic: [
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', provider: 'anthropic', description: 'High speed and low latency' },
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', provider: 'anthropic', description: 'Top-tier literary analysis' },
  ],
  custom: [
    { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', provider: 'custom', defaultBaseUrl: 'https://api.deepseek.com/v1' },
    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', provider: 'custom', defaultBaseUrl: 'https://api.deepseek.com/v1' },
    { id: 'google/gemini-2.5-flash', name: 'OpenRouter: Gemini 2.5 Flash', provider: 'custom', defaultBaseUrl: 'https://openrouter.ai/api/v1' },
    { id: 'llama-3.3-70b-versatile', name: 'Groq: Llama 3.3 70B', provider: 'custom', defaultBaseUrl: 'https://api.groq.com/openai/v1' },
    { id: 'qwen2.5:7b', name: 'Local Ollama: Qwen 2.5 7B', provider: 'custom', defaultBaseUrl: 'http://10.0.2.2:11434/v1' },
    { id: 'llama3.2:3b', name: 'Local Ollama: Llama 3.2 3B', provider: 'custom', defaultBaseUrl: 'http://10.0.2.2:11434/v1' },
  ],
};

export const CUSTOM_ENDPOINT_PRESETS = [
  { name: 'DeepSeek', url: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', defaultModel: 'google/gemini-2.5-flash' },
  { name: 'Groq', url: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile' },
  { name: 'Ollama (Android Emulator)', url: 'http://10.0.2.2:11434/v1', defaultModel: 'qwen2.5:7b' },
  { name: 'Ollama (Localhost)', url: 'http://localhost:11434/v1', defaultModel: 'qwen2.5:7b' },
];

export class LlmProviderFactory {
  static async createLanguageModel(settings: LlmSettingsRecord): Promise<LanguageModel> {
    const apiKey = settings.api_key || '';
    const baseUrl = settings.base_url?.trim() || undefined;

    switch (settings.provider) {
      case 'openai': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        const client = createOpenAI({
          apiKey,
          baseURL: baseUrl,
        });
        return client(settings.model_id);
      }

      case 'google': {
        const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
        const client = createGoogleGenerativeAI({
          apiKey,
          baseURL: baseUrl,
        });
        return client(settings.model_id);
      }

      case 'anthropic': {
        const { createAnthropic } = await import('@ai-sdk/anthropic');
        const client = createAnthropic({
          apiKey,
          baseURL: baseUrl,
        });
        return client(settings.model_id);
      }

      case 'custom':
      default: {
        const { createOpenAI } = await import('@ai-sdk/openai');
        const client = createOpenAI({
          apiKey,
          baseURL: baseUrl || 'http://10.0.2.2:11434/v1',
        });
        return client(settings.model_id);
      }
    }
  }

  static async fetchAvailableModels(baseURL: string, apiKey: string): Promise<string[]> {
    const normalizedUrl = baseURL.trim().replace(/\/+$/, '');
    const endpoint = `${normalizedUrl}/models`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey.trim()) {
      headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    const response = await fetch(endpoint, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models from ${endpoint} (HTTP ${response.status})`);
    }

    const payload = (await response.json()) as { data?: Array<{ id: string }> };
    if (Array.isArray(payload.data)) {
      return payload.data.map((m) => m.id).filter(Boolean);
    }
    return [];
  }
}
