<script setup lang="ts">
import { computed } from 'vue';
import { useReaderStore } from '../../stores/readerStore';
import { TranslationService } from '../../services/translation/TranslationService';

const emit = defineEmits<{
  (e: 'translate', text: string): void;
}>();

const { t } = useI18n();
const readerStore = useReaderStore();
const translationService = TranslationService.getInstance();

const tooltipStyle = computed(() => {
  if (!readerStore.selection) {
    return { display: 'none' };
  }
  const x = Math.max(16, Math.min(readerStore.selection.x, window.innerWidth - 120));
  const y = Math.max(16, readerStore.selection.y - 48);

  return {
    top: `${y}px`,
    left: `${x}px`,
    transform: 'translateX(-50%)',
  };
});

const handleTranslate = () => {
  if (readerStore.selection?.text) {
    emit('translate', readerStore.selection.text);
  }
};

const handleCopy = async () => {
  if (readerStore.selection?.text) {
    await translationService.copyToClipboard(readerStore.selection.text);
    readerStore.setSelection(null);
  }
};
</script>

<template>
  <div
    v-if="readerStore.selection"
    class="fixed z-50 flex items-center gap-1 bg-zinc-900/90 text-white rounded-xl px-2 py-1.5 shadow-2xl backdrop-blur border border-zinc-800 text-xs font-semibold animate-in fade-in zoom-in-95 duration-150"
    :style="tooltipStyle"
  >
    <button
      type="button"
      data-testid="translate-action-btn"
      class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-zinc-800 active:scale-95 transition-all text-indigo-400"
      @click="handleTranslate"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
      </svg>
      <span>{{ t('translation.translate') }}</span>
    </button>

    <div class="w-px h-3.5 bg-zinc-700" />

    <button
      type="button"
      class="p-1 rounded-lg hover:bg-zinc-800 active:scale-95 transition-all text-zinc-300"
      :title="t('translation.copy')"
      @click="handleCopy"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    </button>
  </div>
</template>
