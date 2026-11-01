<script setup lang="ts">
import { ref } from 'vue';
import { useDictionaryStore } from '../../stores/dictionaryStore';
import { TranslationService } from '../../services/translation/TranslationService';
import type { TranslationResult } from '../../types';

const props = defineProps<{
  isOpen: boolean;
  result: TranslationResult | null;
  bookId?: string | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { t } = useI18n();
const dictionaryStore = useDictionaryStore();
const translationService = TranslationService.getInstance();
const isCopied = ref(false);

const handleOpenNativeTranslate = () => {
  if (props.result?.sourceText) {
    translationService.openGoogleTranslateIntent(
      props.result.sourceText,
      props.result.targetLang || 'uk',
    );
  }
};

const handleCopyTranslation = async () => {
  if (props.result?.translatedText) {
    await translationService.copyToClipboard(props.result.translatedText);
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2000);
  }
};

const handleSaveToDictionary = async () => {
  if (props.result && props.result.sourceText && props.result.translatedText) {
    await dictionaryStore.saveTranslatedWord(
      props.result.sourceText,
      props.result.translatedText,
      props.bookId || null,
    );
    emit('close');
  }
};
</script>

<template>
  <div
    v-if="isOpen && result"
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div
      class="animate-in slide-in-from-bottom w-full max-w-lg space-y-4 rounded-t-3xl border-t border-zinc-100 bg-white p-6 shadow-2xl duration-200"
      :style="{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }"
    >
      <div class="flex items-center justify-between border-b border-zinc-100 pb-2">
        <div class="flex items-center gap-2">
          <span
            class="rounded bg-indigo-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-indigo-600"
          >
            {{ result.sourceLang }} &rarr; {{ result.targetLang }}
          </span>
          <span class="text-xs font-medium text-zinc-400">{{ t('translation.translate') }}</span>
        </div>

        <button
          type="button"
          class="rounded-lg p-1 text-zinc-400 transition-colors hover:text-zinc-600"
          @click="emit('close')"
        >
          <svg
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div class="space-y-3">
        <div class="rounded-2xl border border-zinc-100 bg-zinc-50 p-3">
          <p class="mb-1 text-xs font-medium text-zinc-400">{{ t('translation.sourceText') }}</p>
          <p class="select-text text-sm font-medium leading-relaxed text-zinc-800">
            {{ result.sourceText }}
          </p>
        </div>

        <div class="rounded-2xl border border-indigo-100 bg-indigo-50 p-3">
          <div class="mb-1 flex items-center justify-between">
            <p class="text-xs font-medium text-indigo-600">{{ t('translation.translatedText') }}</p>
            <button
              type="button"
              class="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              @click="handleCopyTranslation"
            >
              {{ isCopied ? t('translation.copied') : t('translation.copy') }}
            </button>
          </div>
          <p class="select-text text-base font-semibold leading-relaxed text-zinc-900">
            {{ result.translatedText || t('translation.translating') }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3 pt-2">
        <button
          type="button"
          data-testid="open-google-translate-intent"
          class="flex flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 py-3 text-xs font-semibold text-zinc-800 transition-all hover:bg-zinc-200 active:scale-95"
          @click="handleOpenNativeTranslate"
        >
          <svg
            class="h-4 w-4 text-indigo-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
          <span>{{ t('translation.openGoogleTranslate') }}</span>
        </button>

        <button
          type="button"
          class="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95"
          @click="handleSaveToDictionary"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
          <span>{{ t('ai.saveToVocabulary') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
