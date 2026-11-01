<script setup lang="ts">
import { ref } from 'vue';
import { useAiStore } from '../../stores/aiStore';
import { useDictionaryStore } from '../../stores/dictionaryStore';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { t } = useI18n();
const aiStore = useAiStore();
const dictionaryStore = useDictionaryStore();

const isCopied = ref(false);

const handleSaveToVocabulary = async () => {
  await aiStore.saveCurrentWordToVocabulary();
  // Refresh vocabulary in dictionaryStore
  await dictionaryStore.loadVocabulary();
};

const handleCopyTranslation = async () => {
  if (!aiStore.dictionaryEntry?.translation) return;
  const success = await aiStore.copyChatMessage(
    `${aiStore.dictionaryEntry.word} — ${aiStore.dictionaryEntry.translation}\n${aiStore.dictionaryEntry.contextualDefinition}`,
  );
  if (success) {
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2000);
  }
};
</script>

<template>
  <div>
    <!-- Backdrop -->
    <Transition
      enter-active-class="transition-opacity duration-300 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="aiStore.isDictionaryModalOpen"
        class="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs"
        @click="aiStore.closeDictionaryModal"
      />
    </Transition>

    <!-- Modal Box -->
    <Transition
      enter-active-class="transform transition ease-out duration-300"
      enter-from-class="opacity-0 scale-95 translate-y-4"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transform transition ease-in duration-200"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 translate-y-4"
    >
      <div
        v-if="aiStore.isDictionaryModalOpen"
        data-testid="ai-dictionary-modal"
        class="fixed inset-x-4 top-1/2 z-50 mx-auto max-h-[85vh] w-full max-w-lg -translate-y-1/2 flex flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white text-gray-900 shadow-2xl"
      >
        <!-- Modal Header -->
        <header class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div class="flex items-center gap-2.5">
            <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
            <div>
              <h3 class="text-sm font-bold text-gray-900">
                {{ t('ai.dictionaryTitle') }}
              </h3>
              <p class="text-xs font-medium text-gray-500">
                {{ t('ai.contextualLinguistics') }}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="close-dictionary-btn"
            class="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 active:scale-95"
            :title="t('common.close')"
            @click="aiStore.closeDictionaryModal"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <!-- Content Area -->
        <div class="flex-1 overflow-y-auto p-6 space-y-5 select-text">
          <!-- Loading State -->
          <div
            v-if="aiStore.isDictionaryLoading"
            data-testid="dictionary-loading-spinner"
            class="flex flex-col items-center justify-center py-12 text-center"
          >
            <div class="h-9 w-9 animate-spin rounded-full border-3 border-teal-600 border-t-transparent" />
            <p class="mt-3 text-xs font-semibold text-gray-600">
              {{ t('ai.analyzingWordInContext') }}
            </p>
          </div>

          <!-- Error State -->
          <div
            v-else-if="aiStore.dictionaryError"
            data-testid="dictionary-error-banner"
            class="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800"
          >
            <p class="font-medium">{{ aiStore.dictionaryError }}</p>
            <button
              type="button"
              class="mt-2 inline-block font-bold text-rose-900 underline"
              @click="aiStore.closeDictionaryModal"
            >
              {{ t('common.close') }}
            </button>
          </div>

          <!-- Dictionary Breakdown Result -->
          <template v-else-if="aiStore.dictionaryEntry">
            <!-- Word Header -->
            <div class="space-y-1">
              <div class="flex flex-wrap items-baseline gap-2">
                <h2 class="text-xl font-extrabold tracking-tight text-gray-900">
                  {{ aiStore.dictionaryEntry.word }}
                </h2>
                <span
                  v-if="aiStore.dictionaryEntry.phonetic"
                  class="font-mono text-xs text-gray-500"
                >
                  {{ aiStore.dictionaryEntry.phonetic }}
                </span>
                <span
                  v-if="aiStore.dictionaryEntry.partOfSpeech"
                  class="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-700"
                >
                  {{ aiStore.dictionaryEntry.partOfSpeech }}
                </span>
              </div>

              <p
                v-if="aiStore.dictionaryEntry.lemma && aiStore.dictionaryEntry.lemma !== aiStore.dictionaryEntry.word"
                class="text-xs text-gray-500 font-medium"
              >
                {{ t('ai.baseForm') }}: <span class="font-bold text-gray-700">{{ aiStore.dictionaryEntry.lemma }}</span>
              </p>
            </div>

            <!-- Translation Card -->
            <div class="rounded-2xl border border-teal-100 bg-teal-50/60 p-4 space-y-1">
              <span class="text-[10px] font-bold uppercase tracking-wider text-teal-800">
                {{ t('ai.translation') }}
              </span>
              <p class="text-base font-bold text-teal-900">
                {{ aiStore.dictionaryEntry.translation }}
              </p>
            </div>

            <!-- Contextual Definition (Specific to this sentence) -->
            <div class="space-y-1.5">
              <span class="text-xs font-bold uppercase tracking-wider text-gray-500">
                {{ t('ai.contextualMeaning') }}
              </span>
              <p class="text-xs font-medium leading-relaxed text-gray-800">
                {{ aiStore.dictionaryEntry.contextualDefinition }}
              </p>
            </div>

            <!-- Surrounding Sentence Context Reference -->
            <div
              v-if="aiStore.dictionaryEntry.contextSentence"
              class="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 italic"
            >
              "{{ aiStore.dictionaryEntry.contextSentence }}"
            </div>

            <!-- General Definition (if present) -->
            <div v-if="aiStore.dictionaryEntry.generalDefinition" class="space-y-1">
              <span class="text-xs font-bold uppercase tracking-wider text-gray-500">
                {{ t('ai.generalDefinition') }}
              </span>
              <p class="text-xs text-gray-700 leading-relaxed">
                {{ aiStore.dictionaryEntry.generalDefinition }}
              </p>
            </div>

            <!-- Synonyms Pills -->
            <div
              v-if="aiStore.dictionaryEntry.synonyms && aiStore.dictionaryEntry.synonyms.length > 0"
              class="space-y-1.5"
            >
              <span class="text-xs font-bold uppercase tracking-wider text-gray-500">
                {{ t('ai.synonyms') }}
              </span>
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="syn in aiStore.dictionaryEntry.synonyms"
                  :key="syn"
                  class="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700"
                >
                  {{ syn }}
                </span>
              </div>
            </div>

            <!-- Example Sentence -->
            <div v-if="aiStore.dictionaryEntry.exampleSentence" class="space-y-1">
              <span class="text-xs font-bold uppercase tracking-wider text-gray-500">
                {{ t('ai.exampleUsage') }}
              </span>
              <p class="text-xs text-gray-700 font-serif italic">
                {{ aiStore.dictionaryEntry.exampleSentence }}
              </p>
            </div>
          </template>
        </div>

        <!-- Footer Actions -->
        <footer
          v-if="aiStore.dictionaryEntry && !aiStore.isDictionaryLoading"
          class="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-3.5"
        >
          <button
            type="button"
            data-testid="copy-dictionary-btn"
            class="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 shadow-xs transition-all hover:bg-gray-50 active:scale-95"
            @click="handleCopyTranslation"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span>{{ isCopied ? t('translation.copied') : t('translation.copy') }}</span>
          </button>

          <button
            type="button"
            data-testid="save-to-vocabulary-btn"
            class="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold shadow-xs transition-all active:scale-95"
            :class="
              aiStore.isSavedToVocabulary
                ? 'bg-emerald-600 text-white cursor-default'
                : 'bg-[#3E5725] text-white hover:bg-[#3E5725]/90'
            "
            :disabled="aiStore.isSavedToVocabulary"
            @click="handleSaveToVocabulary"
          >
            <svg
              v-if="aiStore.isSavedToVocabulary"
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            <svg
              v-else
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <span>{{ aiStore.isSavedToVocabulary ? t('ai.savedToVocabulary') : t('ai.saveToVocabulary') }}</span>
          </button>
        </footer>
      </div>
    </Transition>
  </div>
</template>
