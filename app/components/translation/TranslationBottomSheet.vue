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
    await dictionaryStore.translate(
      props.result.sourceText,
      props.result.targetLang,
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
      class="w-full max-w-lg bg-white rounded-t-3xl p-6 shadow-2xl border-t border-zinc-100 space-y-4 animate-in slide-in-from-bottom duration-200"
      :style="{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }"
    >
      <div class="flex items-center justify-between pb-2 border-b border-zinc-100">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
            {{ result.sourceLang }} &rarr; {{ result.targetLang }}
          </span>
          <span class="text-xs text-zinc-400 font-medium">{{ t('translation.translate') }}</span>
        </div>

        <button
          type="button"
          class="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 transition-colors"
          @click="emit('close')"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="space-y-3">
        <div class="bg-zinc-50 rounded-2xl p-3 border border-zinc-100">
          <p class="text-xs font-medium text-zinc-400 mb-1">{{ t('translation.sourceText') }}</p>
          <p class="text-sm text-zinc-800 font-medium select-text leading-relaxed">{{ result.sourceText }}</p>
        </div>

        <div class="bg-indigo-50/50 rounded-2xl p-3 border border-indigo-100">
          <div class="flex items-center justify-between mb-1">
            <p class="text-xs font-medium text-indigo-600">{{ t('translation.translatedText') }}</p>
            <button
              type="button"
              class="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
              @click="handleCopyTranslation"
            >
              {{ isCopied ? t('translation.copied') : t('translation.copy') }}
            </button>
          </div>
          <p class="text-base text-zinc-900 font-semibold select-text leading-relaxed">
            {{ result.translatedText || t('translation.translating') }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3 pt-2">
        <button
          type="button"
          data-testid="open-google-translate-intent"
          class="flex-1 py-3 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 active:scale-95 text-zinc-800 font-semibold text-xs transition-all flex items-center justify-center gap-2"
          @click="handleOpenNativeTranslate"
        >
          <svg class="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          <span>{{ t('translation.openGoogleTranslate') }}</span>
        </button>

        <button
          type="button"
          class="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold text-xs shadow-md transition-all flex items-center justify-center gap-2"
          @click="handleSaveToDictionary"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <span>{{ t('translation.saveToDictionary') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
