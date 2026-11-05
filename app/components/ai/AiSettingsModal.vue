<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAiStore, DEFAULT_QUICK_PROMPTS } from '../../stores/aiStore';
import {
  AI_PROVIDER_PRESETS,
  CUSTOM_ENDPOINT_PRESETS,
  LlmProviderFactory,
} from '../../services/ai/LlmProviderFactory';
import type { CustomQuickPrompt, LlmProviderType } from '../../types';

defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved'): void;
}>();

const { t } = useI18n();
const aiStore = useAiStore();

const provider = ref<LlmProviderType>('openai');
const apiKey = ref('');
const baseUrl = ref('');
const modelId = ref('gpt-4o-mini');
const customModelId = ref('');
const temperature = ref(0.5);
const maxTokens = ref(1000);
const targetLanguage = ref('uk');
const customSystemPrompt = ref('');
const showKey = ref(false);

// Custom Prompts UI
const isAddingCustomPrompt = ref(false);
const newPromptTitle = ref('');
const newPromptText = ref('');

const isTesting = ref(false);
const testResult = ref<{ success: boolean; latencyMs?: number; error?: string } | null>(null);

const isFetchingModels = ref(false);
const fetchedModels = ref<string[]>([]);
const fetchError = ref<string | null>(null);
const isKeyDeletedFeedback = ref(false);

const hasKey = computed(() => {
  return Boolean(apiKey.value.trim());
});

const handleDeleteKey = async () => {
  apiKey.value = '';
  testResult.value = null;
  if (aiStore.settings.api_key) {
    aiStore.settings.api_key = null;
    await aiStore.saveSettings({
      api_key: null,
      is_enabled: 0,
    });
  }
  isKeyDeletedFeedback.value = true;
  setTimeout(() => {
    isKeyDeletedFeedback.value = false;
  }, 2500);
};

const providers: { id: LlmProviderType; name: string }[] = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'google', name: 'Google Gemini' },
  { id: 'anthropic', name: 'Anthropic Claude' },
  { id: 'custom', name: 'Custom (OpenAI-Compatible)' },
];

const targetLanguages = [
  { code: 'uk', label: 'Українська (Ukrainian)' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch (German)' },
  { code: 'fr', label: 'Français (French)' },
  { code: 'es', label: 'Español (Spanish)' },
  { code: 'pl', label: 'Polski (Polish)' },
];

const availablePresets = computed(() => {
  return AI_PROVIDER_PRESETS[provider.value] || [];
});

onMounted(async () => {
  await aiStore.init();
  syncFromStore();
});

const syncFromStore = () => {
  provider.value = aiStore.settings.provider;
  apiKey.value = aiStore.settings.api_key || '';
  baseUrl.value = aiStore.settings.base_url || '';
  modelId.value = aiStore.settings.model_id;
  customModelId.value = aiStore.settings.model_id;
  temperature.value = aiStore.settings.temperature;
  maxTokens.value = aiStore.settings.max_tokens;
  targetLanguage.value = aiStore.settings.target_language || 'uk';
  customSystemPrompt.value = aiStore.settings.custom_system_prompt || '';
  testResult.value = null;
  fetchError.value = null;
};

const handleProviderChange = (newProvider: LlmProviderType) => {
  provider.value = newProvider;
  testResult.value = null;
  fetchError.value = null;
  fetchedModels.value = [];

  const presets = AI_PROVIDER_PRESETS[newProvider];
  if (presets && presets.length > 0 && presets[0]) {
    modelId.value = presets[0].id;
    customModelId.value = presets[0].id;
    if (presets[0].defaultBaseUrl) {
      baseUrl.value = presets[0].defaultBaseUrl;
    } else {
      baseUrl.value = '';
    }
  }
};

const applyCustomPreset = (preset: { name: string; url: string; defaultModel: string }) => {
  baseUrl.value = preset.url;
  modelId.value = preset.defaultModel;
  customModelId.value = preset.defaultModel;
  testResult.value = null;
};

const isEndpointPresetActive = (presetUrl: string): boolean => {
  if (!baseUrl.value) return false;
  return (
    baseUrl.value.trim().replace(/\/+$/, '').toLowerCase() ===
    presetUrl.trim().replace(/\/+$/, '').toLowerCase()
  );
};

const selectPresetModel = (selectedModelId: string) => {
  modelId.value = selectedModelId;
  customModelId.value = selectedModelId;
};

const handleCustomModelInput = (value: string) => {
  customModelId.value = value;
  modelId.value = value.trim() || 'gpt-4o-mini';
};

const handleFetchModels = async () => {
  const url = baseUrl.value.trim() || (provider.value === 'openai' ? 'https://api.openai.com/v1' : '');
  if (!url) {
    fetchError.value = 'Please provide a valid Base URL first.';
    return;
  }

  isFetchingModels.value = true;
  fetchError.value = null;

  try {
    const list = await LlmProviderFactory.fetchAvailableModels(url, apiKey.value);
    fetchedModels.value = list;
    if (list.length === 0) {
      fetchError.value = 'No models returned from endpoint.';
    }
  } catch (err: unknown) {
    const errorObj = err as Error;
    fetchError.value = errorObj.message || 'Failed to query /models endpoint.';
  } finally {
    isFetchingModels.value = false;
  }
};

const handleTestConnection = async () => {
  isTesting.value = true;
  testResult.value = null;

  try {
    const activeModel = customModelId.value.trim() || modelId.value;
    const tempSettings = {
      ...aiStore.settings,
      provider: provider.value,
      api_key: apiKey.value.trim() || null,
      base_url: baseUrl.value.trim() || null,
      model_id: activeModel,
      temperature: temperature.value,
      max_tokens: maxTokens.value,
      target_language: targetLanguage.value,
      custom_system_prompt: customSystemPrompt.value.trim() || null,
    };

    await aiStore.saveSettings(tempSettings);
    const result = await aiStore.testConnection();
    testResult.value = result;
  } finally {
    isTesting.value = false;
  }
};

const handleSave = async () => {
  const activeModel = customModelId.value.trim() || modelId.value || 'gpt-4o-mini';
  await aiStore.saveSettings({
    provider: provider.value,
    api_key: apiKey.value.trim() || null,
    base_url: baseUrl.value.trim() || null,
    model_id: activeModel,
    temperature: Number(temperature.value),
    max_tokens: Number(maxTokens.value),
    target_language: targetLanguage.value,
    custom_system_prompt: customSystemPrompt.value.trim() || null,
    is_enabled: 1,
  });

  emit('saved');
  emit('close');
};

const handleClose = () => {
  syncFromStore();
  emit('close');
};

const handleCreatePrompt = async () => {
  if (!newPromptTitle.value.trim() || !newPromptText.value.trim()) return;
  await aiStore.addCustomQuickPrompt(newPromptTitle.value, newPromptText.value);
  newPromptTitle.value = '';
  newPromptText.value = '';
  isAddingCustomPrompt.value = false;
};

const handleDeletePrompt = async (id: string) => {
  await aiStore.deleteCustomQuickPrompt(id);
};

const handleResetPrompts = async () => {
  aiStore.customQuickPrompts = [...DEFAULT_QUICK_PROMPTS];
  await aiStore.saveSettings({
    custom_prompts_json: JSON.stringify(DEFAULT_QUICK_PROMPTS),
  });
};
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
  >
    <div
      data-testid="ai-settings-modal"
      class="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white text-gray-900 shadow-xl transition-all"
    >
      <!-- Header -->
      <header class="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-white">
        <div class="flex items-center gap-2.5">
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-[#C8E695] text-[#3E5725]">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 class="text-base font-bold text-gray-900">
            {{ t('ai.settingsTitle') }}
          </h3>
        </div>
        <button
          type="button"
          class="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
          @click="handleClose"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <!-- Modal Body -->
      <div class="flex-1 space-y-5 overflow-y-auto p-6 bg-white">
        <!-- 1. Provider Selection -->
        <div>
          <label class="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-700">
            {{ t('ai.provider') }}
          </label>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="item in providers"
              :key="item.id"
              type="button"
              class="flex items-center justify-center rounded-2xl border p-2.5 text-xs font-bold transition"
              :class="
                provider === item.id
                  ? 'border-[#3E5725] bg-[#3E5725] text-white shadow-xs'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900'
              "
              @click="handleProviderChange(item.id)"
            >
              {{ item.name }}
            </button>
          </div>
        </div>

        <!-- Custom Endpoints Presets -->
        <div v-if="provider === 'custom'" class="space-y-2">
          <label class="block text-xs font-bold uppercase tracking-wider text-gray-700">
            {{ t('ai.quickEndpoints') }}
          </label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="ep in CUSTOM_ENDPOINT_PRESETS"
              :key="ep.name"
              type="button"
              class="rounded-xl border px-3 py-1.5 text-xs font-bold transition-all active:scale-95"
              :class="
                isEndpointPresetActive(ep.url)
                  ? 'border-[#3E5725] bg-[#3E5725] text-white shadow-xs'
                  : 'border-gray-300 bg-white text-gray-800 hover:border-[#3E5725]/50 hover:bg-gray-50'
              "
              @click="applyCustomPreset(ep)"
            >
              {{ ep.name }}
            </button>
          </div>
        </div>

        <!-- Base URL Input -->
        <div v-if="provider === 'custom' || provider === 'openai'">
          <label class="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-700">
            {{ t('ai.baseUrl') }}
          </label>
          <input
            v-model="baseUrl"
            type="text"
            data-testid="ai-baseurl-input"
            class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-[#3E5725] focus:outline-hidden focus:ring-1 focus:ring-[#3E5725]"
            :placeholder="t('ai.baseUrlPlaceholder')"
          />
        </div>

        <!-- API Key Input -->
        <div>
          <label class="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-700">
            {{ t('ai.apiKey') }}
          </label>
          <div class="flex items-center gap-2">
            <div class="relative flex-1">
              <input
                v-model="apiKey"
                :type="showKey ? 'text' : 'password'"
                data-testid="ai-key-input"
                class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-2.5 pr-11 text-sm text-gray-900 focus:border-[#3E5725] focus:outline-hidden focus:ring-1 focus:ring-[#3E5725]"
                :placeholder="t('ai.apiKeyPlaceholder')"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                @click="showKey = !showKey"
              >
                <svg v-if="!showKey" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <svg v-else class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              </button>
            </div>
            <button
              v-if="hasKey"
              type="button"
              data-testid="delete-ai-key-btn"
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-300 bg-rose-50 text-rose-600 shadow-xs transition hover:bg-rose-100 active:scale-95"
              :title="t('ai.deleteKey')"
              @click="handleDeleteKey"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
          <p v-if="isKeyDeletedFeedback" class="mt-1.5 text-xs font-semibold text-emerald-600">
            {{ t('ai.keyDeleted') }}
          </p>
        </div>

        <!-- Model Selector -->
        <div>
          <label class="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-700">
            {{ t('ai.model') }}
          </label>
          <div class="mb-3 flex flex-wrap gap-2">
            <button
              v-for="preset in availablePresets"
              :key="preset.id"
              type="button"
              class="rounded-xl border px-3 py-1.5 text-xs font-bold transition"
              :class="
                modelId === preset.id
                  ? 'border-[#3E5725] bg-[#3E5725] text-white shadow-xs'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900'
              "
              @click="selectPresetModel(preset.id)"
            >
              {{ preset.name }}
            </button>
          </div>

          <div class="space-y-1.5">
            <label class="block text-[11px] font-semibold text-gray-500">
              {{ t('ai.customModelId') }}
            </label>
            <input
              v-model="customModelId"
              type="text"
              data-testid="custom-model-input"
              class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 focus:border-[#3E5725] focus:outline-hidden focus:ring-1 focus:ring-[#3E5725]"
              :placeholder="t('ai.customModelPlaceholder')"
              @input="handleCustomModelInput(($event.target as HTMLInputElement).value)"
            />
          </div>

          <div v-if="provider === 'custom' || provider === 'openai'" class="mt-2 flex items-center justify-between">
            <button
              type="button"
              data-testid="fetch-models-btn"
              :disabled="isFetchingModels"
              class="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3E5725] hover:underline"
              @click="handleFetchModels"
            >
              <svg v-if="isFetchingModels" class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>{{ isFetchingModels ? t('ai.fetchingModels') : t('ai.fetchModels') }}</span>
            </button>
          </div>

          <div v-if="fetchedModels.length > 0" class="mt-2 max-h-32 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-2">
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="m in fetchedModels"
                :key="m"
                type="button"
                class="rounded-lg border px-2 py-1 text-[11px] font-medium transition-all active:scale-95"
                :class="
                  modelId === m
                    ? 'border-[#3E5725] bg-[#3E5725] text-white shadow-xs'
                    : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-100'
                "
                @click="selectPresetModel(m)"
              >
                {{ m }}
              </button>
            </div>
          </div>
          <p v-if="fetchError" class="mt-1 text-xs text-red-500">{{ fetchError }}</p>
        </div>

        <!-- Dictionary & Translation Target Language -->
        <div>
          <label class="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-700">
            {{ t('ai.targetLanguage') }}
          </label>
          <select
            v-model="targetLanguage"
            data-testid="ai-target-lang-select"
            class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-[#3E5725] focus:outline-hidden"
          >
            <option v-for="lang in targetLanguages" :key="lang.code" :value="lang.code">
              {{ lang.label }}
            </option>
          </select>
        </div>

        <!-- Temperature Slider -->
        <div>
          <div class="mb-1 flex items-center justify-between text-xs font-semibold text-gray-700">
            <span>{{ t('ai.temperature') }}</span>
            <span class="font-bold">{{ temperature }}</span>
          </div>
          <input
            v-model.number="temperature"
            type="range"
            min="0"
            max="1"
            step="0.05"
            class="w-full accent-[#3E5725]"
          />
        </div>

        <!-- Custom System Prompt for Book Discussions -->
        <div>
          <label class="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-700">
            {{ t('ai.customSystemPrompt') }}
          </label>
          <textarea
            v-model="customSystemPrompt"
            rows="3"
            data-testid="custom-system-prompt-input"
            class="w-full rounded-2xl border border-gray-300 bg-white p-3 text-xs text-gray-900 placeholder-gray-400 focus:border-[#3E5725] focus:outline-hidden"
            :placeholder="t('ai.customSystemPromptPlaceholder')"
          />
        </div>

        <!-- Manage Custom Quick Prompts -->
        <div class="space-y-3 border-t border-gray-200 pt-4">
          <div class="flex items-center justify-between">
            <label class="text-xs font-bold uppercase tracking-wider text-gray-700">
              {{ t('ai.manageQuickPrompts') }}
            </label>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="text-[11px] font-semibold text-gray-500 hover:text-gray-800 underline"
                @click="handleResetPrompts"
              >
                {{ t('ai.resetToDefaults') }}
              </button>
              <button
                type="button"
                data-testid="add-prompt-btn"
                class="rounded-xl border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100"
                @click="isAddingCustomPrompt = !isAddingCustomPrompt"
              >
                + {{ t('ai.addPrompt') }}
              </button>
            </div>
          </div>

          <!-- Add Prompt Form -->
          <div
            v-if="isAddingCustomPrompt"
            class="rounded-2xl border border-gray-200 bg-gray-50 p-3 space-y-2 text-xs"
          >
            <input
              v-model="newPromptTitle"
              type="text"
              placeholder="Prompt title (e.g., Deep Symbolism)"
              class="w-full rounded-xl border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-900 focus:outline-hidden"
            />
            <textarea
              v-model="newPromptText"
              rows="2"
              placeholder="Prompt instructions for the AI..."
              class="w-full rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-gray-900 focus:outline-hidden"
            />
            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="px-3 py-1 rounded-lg text-gray-500 font-semibold"
                @click="isAddingCustomPrompt = false"
              >
                {{ t('common.cancel') }}
              </button>
              <button
                type="button"
                data-testid="save-new-prompt-btn"
                class="px-3 py-1 rounded-lg bg-[#3E5725] text-white font-bold"
                @click="handleCreatePrompt"
              >
                {{ t('common.add') }}
              </button>
            </div>
          </div>

          <!-- Existing Prompts List -->
          <div class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            <div
              v-for="p in aiStore.customQuickPrompts"
              :key="p.id"
              class="flex items-start justify-between gap-2 rounded-xl border border-gray-200 bg-white p-2.5 text-xs"
            >
              <div class="min-w-0">
                <span class="font-bold text-gray-900 block truncate">{{ p.title }}</span>
                <span class="text-gray-500 text-[11px] block line-clamp-1">{{ p.prompt }}</span>
              </div>
              <button
                type="button"
                class="p-1 text-gray-400 hover:text-rose-600"
                @click="handleDeletePrompt(p.id)"
              >
                &times;
              </button>
            </div>
          </div>
        </div>

        <!-- Connection Test -->
        <div class="pt-2">
          <button
            type="button"
            data-testid="test-ai-connection-btn"
            :disabled="isTesting"
            class="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-300 bg-gray-50 py-2.5 text-xs font-bold text-gray-800 shadow-xs transition hover:bg-gray-100 active:scale-95 disabled:opacity-50"
            @click="handleTestConnection"
          >
            <svg v-if="isTesting" class="h-4 w-4 animate-spin text-current" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>{{ isTesting ? t('ai.testingConnection') : t('ai.testConnection') }}</span>
          </button>

          <div
            v-if="testResult"
            class="mt-2.5 rounded-2xl p-3 text-xs font-medium"
            :class="
              testResult.success
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            "
          >
            <span v-if="testResult.success">
              {{ t('ai.testSuccess', { ms: testResult.latencyMs }) }}
            </span>
            <span v-else>
              {{ t('ai.testFailed', { error: testResult.error }) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <footer class="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
        <button
          type="button"
          class="rounded-2xl border border-gray-300 bg-white px-5 py-2.5 text-xs font-bold text-gray-700 transition hover:bg-gray-100"
          @click="handleClose"
        >
          {{ t('ai.cancel') }}
        </button>
        <button
          type="button"
          data-testid="save-ai-settings-btn"
          class="rounded-2xl bg-[#3E5725] px-6 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#3E5725]/90 active:scale-95"
          @click="handleSave"
        >
          {{ t('ai.save') }}
        </button>
      </footer>
    </div>
  </div>
</template>
