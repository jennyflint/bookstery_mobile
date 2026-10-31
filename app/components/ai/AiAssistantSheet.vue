<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAiStore } from '../../stores/aiStore';
import { useAiReader } from '../../composables/useAiReader';

const { t } = useI18n();
const aiStore = useAiStore();
const { saveAiResponseAsNote } = useAiReader();

const copySuccess = ref(false);
const saveSuccess = ref(false);

const titleText = computed(() => {
  switch (aiStore.currentPromptType) {
    case 'explain':
      return t('ai.explainSnippet');
    case 'character':
      return t('ai.whoIsCharacter');
    case 'dictionary':
      return t('ai.contextualDictionary');
    case 'tldr':
      return t('ai.chapterTldr');
    default:
      return t('ai.settingsTitle');
  }
});

const handleCopy = async () => {
  const ok = await aiStore.copyCurrentOutput();
  if (ok) {
    copySuccess.value = true;
    setTimeout(() => {
      copySuccess.value = false;
    }, 2000);
  }
};

const handleSaveAsNote = async () => {
  const ok = await saveAiResponseAsNote('purple');
  if (ok) {
    saveSuccess.value = true;
    setTimeout(() => {
      saveSuccess.value = false;
    }, 2500);
  }
};

const handleRegenerate = async () => {
  copySuccess.value = false;
  saveSuccess.value = false;
  await aiStore.regenerate();
};

const handleClose = () => {
  copySuccess.value = false;
  saveSuccess.value = false;
  aiStore.closeSheet();
};

const renderMarkdown = (text: string): string => {
  if (!text) return '';

  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/^\s*[-*]\s+(.*)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
};
</script>

<template>
  <div>
    <Transition
      enter-active-class="transform transition ease-out duration-300"
      enter-from-class="translate-y-full"
      enter-to-class="translate-y-0"
      leave-active-class="transform transition ease-in duration-200"
      leave-from-class="translate-y-0"
      leave-to-class="translate-y-full"
    >
      <div
        v-if="aiStore.isSheetOpen"
        class="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-t-[2rem] border-t border-zinc-200 bg-[#F4ECD8] shadow-2xl backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900"
        :style="{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }"
      >
        <div class="flex items-center justify-center pt-3 pb-1">
          <div class="h-1.5 w-12 rounded-full bg-zinc-400/50 dark:bg-zinc-600" />
        </div>

        <div class="flex items-center justify-between border-b border-zinc-200/80 px-6 py-3 dark:border-zinc-800">
          <div class="flex items-center gap-2.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-[#C8E695] text-[#3E5725]">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 class="text-xs font-bold uppercase tracking-wider text-[#3E5725] dark:text-[#C8E695]">
                {{ titleText }}
              </h3>
              <p
                v-if="aiStore.currentSelectionText"
                class="max-w-[240px] truncate text-[11px] text-zinc-500 dark:text-zinc-400 sm:max-w-md"
              >
                "{{ aiStore.currentSelectionText }}"
              </p>
            </div>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="rounded-xl p-1.5 text-zinc-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/5"
              @click="aiStore.openSettingsModal()"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              type="button"
              data-testid="dismiss-ai-sheet-btn"
              class="rounded-xl p-1.5 text-zinc-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/5"
              @click="handleClose"
            >
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div class="max-h-[55vh] overflow-y-auto px-6 py-4">
          <div v-if="aiStore.lastError" class="rounded-2xl bg-red-50 p-4 text-xs font-medium text-red-800 dark:bg-red-950/40 dark:text-red-300">
            <p class="font-bold">Error:</p>
            <p class="mt-1">{{ aiStore.lastError }}</p>
          </div>

          <div v-else class="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
            <div
              v-if="aiStore.currentOutput"
              class="prose prose-sm dark:prose-invert max-w-none"
              v-html="renderMarkdown(aiStore.currentOutput)"
            />
            <span
              v-if="aiStore.isStreaming"
              class="inline-block h-4 w-1.5 animate-pulse rounded-full bg-[#3E5725] align-middle dark:bg-[#C8E695]"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200/80 px-6 py-3 dark:border-zinc-800">
          <div class="flex items-center gap-2">
            <button
              type="button"
              data-testid="copy-ai-response-btn"
              :disabled="!aiStore.currentOutput || aiStore.isStreaming"
              class="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white/70 px-3 py-1.5 text-xs font-bold text-zinc-700 transition hover:bg-white active:scale-95 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              @click="handleCopy"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>{{ copySuccess ? t('ai.copied') : t('ai.copyAnswer') }}</span>
            </button>

            <button
              type="button"
              data-testid="save-ai-note-btn"
              :disabled="!aiStore.currentOutput || aiStore.isStreaming"
              class="inline-flex items-center gap-1.5 rounded-xl border border-purple-300 bg-purple-50/70 px-3 py-1.5 text-xs font-bold text-purple-800 transition hover:bg-purple-100 active:scale-95 disabled:opacity-40 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300"
              @click="handleSaveAsNote"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span>{{ saveSuccess ? t('ai.noteSaved') : t('ai.saveNote') }}</span>
            </button>
          </div>

          <button
            type="button"
            data-testid="regenerate-ai-btn"
            :disabled="aiStore.isStreaming"
            class="inline-flex items-center gap-1.5 rounded-xl bg-[#3E5725] px-3.5 py-1.5 text-xs font-bold text-[#F4ECD8] shadow-sm transition hover:bg-[#3E5725]/90 active:scale-95 disabled:opacity-40 dark:bg-[#C8E695] dark:text-[#3E5725]"
            @click="handleRegenerate"
          >
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{{ t('ai.regenerate') }}</span>
          </button>
        </div>
      </div>
    </Transition>

    <div
      v-if="aiStore.isOnboardingModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div class="w-full max-w-sm rounded-3xl border border-zinc-200 bg-[#F4ECD8] p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C8E695] text-[#3E5725]">
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h3 class="mb-2 text-base font-bold text-[#3E5725] dark:text-[#C8E695]">
          {{ t('ai.onboardingTitle') }}
        </h3>
        <p class="mb-6 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          {{ t('ai.onboardingSubtitle') }}
        </p>
        <div class="flex flex-col gap-2">
          <button
            type="button"
            class="w-full rounded-2xl bg-[#3E5725] py-2.5 text-xs font-bold text-[#F4ECD8] shadow-sm transition hover:bg-[#3E5725]/90 active:scale-95 dark:bg-[#C8E695] dark:text-[#3E5725]"
            @click="aiStore.openSettingsModal()"
          >
            {{ t('ai.connectKey') }}
          </button>
          <button
            type="button"
            class="w-full rounded-2xl py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            @click="aiStore.closeOnboardingModal()"
          >
            {{ t('ai.maybeLater') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
