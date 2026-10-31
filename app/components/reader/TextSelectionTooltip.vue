<script setup lang="ts">
import { computed } from 'vue';
import { useReaderStore } from '../../stores/readerStore';
import { useHighlightStore } from '../../stores/highlightStore';
import { TranslationService } from '../../services/translation/TranslationService';
import { useAiReader } from '../../composables/useAiReader';
import { HIGHLIGHT_COLORS, type HighlightColor } from '../../types';

const emit = defineEmits<{
  (e: 'translate', text: string): void;
}>();

const { t } = useI18n();
const readerStore = useReaderStore();
const highlightStore = useHighlightStore();
const translationService = TranslationService.getInstance();
const { triggerExplain, triggerCharacter, triggerDictionary } = useAiReader();

const colors: HighlightColor[] = ['yellow', 'green', 'pink', 'blue', 'purple'];

const isExistingSelected = computed(() => !!highlightStore.selectedHighlight);

const activeCoordinates = computed(() => {
  if (highlightStore.selectedHighlight) {
    return {
      x: window.innerWidth / 2,
      y: 120,
    };
  }
  if (highlightStore.activeSelection) {
    return {
      x: highlightStore.activeSelection.x,
      y: highlightStore.activeSelection.y,
    };
  }
  if (readerStore.selection) {
    return {
      x: readerStore.selection.x,
      y: readerStore.selection.y,
    };
  }
  return null;
});

const isVisible = computed(() => {
  return isExistingSelected.value || !!highlightStore.activeSelection || !!readerStore.selection;
});

const tooltipStyle = computed(() => {
  if (!activeCoordinates.value) {
    return { display: 'none' };
  }
  const x = Math.max(16, Math.min(activeCoordinates.value.x, window.innerWidth - 160));
  const y = Math.max(16, activeCoordinates.value.y - 54);

  return {
    top: `${y}px`,
    left: `${x}px`,
    transform: 'translateX(-50%)',
  };
});

const getSelectionText = (): string => {
  if (highlightStore.selectedHighlight) {
    return highlightStore.selectedHighlight.selected_text;
  }
  if (highlightStore.activeSelection) {
    return highlightStore.activeSelection.text;
  }
  return readerStore.selection?.text || '';
};

const handleApplyHighlight = async (color: HighlightColor) => {
  if (highlightStore.selectedHighlight) {
    await highlightStore.updateHighlightColor(highlightStore.selectedHighlight.id, color);
    return;
  }

  const text = getSelectionText();
  if (!text) return;

  if (!highlightStore.activeSelection && readerStore.selection) {
    highlightStore.setActiveSelection({
      text,
      locator: readerStore.locator || '1',
      format: (readerStore.currentBook?.format || 'epub') as 'pdf' | 'epub' | 'fb2',
      x: readerStore.selection.x,
      y: readerStore.selection.y,
    });
  }

  await highlightStore.createHighlight(color);
  readerStore.setSelection(null);
};

const handleAddNote = () => {
  if (highlightStore.selectedHighlight) {
    highlightStore.openNoteEditorForExisting(highlightStore.selectedHighlight);
    return;
  }

  const text = getSelectionText();
  if (!text) return;

  if (!highlightStore.activeSelection && readerStore.selection) {
    highlightStore.setActiveSelection({
      text,
      locator: readerStore.locator || '1',
      format: (readerStore.currentBook?.format || 'epub') as 'pdf' | 'epub' | 'fb2',
      x: readerStore.selection.x,
      y: readerStore.selection.y,
    });
  }

  highlightStore.openNoteEditorForSelection('green');
  readerStore.setSelection(null);
};

const handleQuoteCard = () => {
  if (highlightStore.selectedHighlight) {
    highlightStore.openQuoteCardForHighlight(highlightStore.selectedHighlight);
    return;
  }

  const text = getSelectionText();
  if (!text) return;

  if (!highlightStore.activeSelection && readerStore.selection) {
    highlightStore.setActiveSelection({
      text,
      locator: readerStore.locator || '1',
      format: (readerStore.currentBook?.format || 'epub') as 'pdf' | 'epub' | 'fb2',
      x: readerStore.selection.x,
      y: readerStore.selection.y,
    });
  }

  highlightStore.openQuoteCardForSelection();
  readerStore.setSelection(null);
};

const handleCopy = async () => {
  const text = getSelectionText();
  if (text) {
    await translationService.copyToClipboard(text);
    readerStore.setSelection(null);
    highlightStore.setActiveSelection(null);
    highlightStore.selectedHighlight = null;
  }
};

const handleTranslate = () => {
  const text = getSelectionText();
  if (text) {
    emit('translate', text);
  }
};

const handleAiExplain = async () => {
  const text = getSelectionText();
  if (text) {
    handleDismiss();
    await triggerExplain(text);
  }
};

const handleAiCharacter = async () => {
  const text = getSelectionText();
  if (text) {
    handleDismiss();
    await triggerCharacter(text);
  }
};

const handleAiDictionary = async () => {
  const text = getSelectionText();
  if (text) {
    handleDismiss();
    await triggerDictionary(text);
  }
};

const handleDeleteHighlight = async () => {
  if (highlightStore.selectedHighlight) {
    await highlightStore.deleteHighlight(highlightStore.selectedHighlight.id);
  }
};

const handleDismiss = () => {
  readerStore.setSelection(null);
  highlightStore.setActiveSelection(null);
  highlightStore.selectedHighlight = null;
};
</script>

<template>
  <div
    v-if="isVisible"
    class="fixed z-50 flex items-center gap-1.5 bg-zinc-900/95 text-white rounded-2xl px-3 py-2 shadow-2xl backdrop-blur-md border border-zinc-700/80 text-xs font-semibold animate-in fade-in zoom-in-95 duration-150 select-none"
    :style="tooltipStyle"
  >
    <div class="flex items-center gap-1.5 pr-1 border-r border-zinc-700/80">
      <button
        v-for="color in colors"
        :key="color"
        type="button"
        :data-testid="`hl-color-${color}`"
        :title="t(`highlights.colors.${color}`)"
        class="w-5 h-5 rounded-full transition-transform hover:scale-125 active:scale-95 shadow-sm border border-black/20 focus:outline-none focus:ring-2 focus:ring-white/40"
        :style="{
          backgroundColor: HIGHLIGHT_COLORS[color].bg,
          borderColor: HIGHLIGHT_COLORS[color].border,
        }"
        @click="handleApplyHighlight(color)"
      />
    </div>

    <button
      type="button"
      data-testid="add-note-action"
      class="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-zinc-800 active:scale-95 transition-all text-amber-300"
      :title="highlightStore.selectedHighlight ? t('highlights.editNote') : t('highlights.addNote')"
      @click="handleAddNote"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
      <span>{{ highlightStore.selectedHighlight ? t('highlights.editNote') : t('highlights.addNote') }}</span>
    </button>

    <button
      type="button"
      data-testid="create-quote-card-action"
      class="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-zinc-800 active:scale-95 transition-all text-emerald-300"
      :title="t('highlights.quoteCard')"
      @click="handleQuoteCard"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <span>{{ t('highlights.quoteCard') }}</span>
    </button>

    <button
      type="button"
      data-testid="copy-text-action"
      class="p-1 rounded-lg hover:bg-zinc-800 active:scale-95 transition-all text-zinc-300"
      :title="t('highlights.copyText')"
      @click="handleCopy"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    </button>

    <button
      type="button"
      data-testid="translate-action-btn"
      class="p-1 rounded-lg hover:bg-zinc-800 active:scale-95 transition-all text-indigo-400"
      :title="t('translation.translate')"
      @click="handleTranslate"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
      </svg>
    </button>

    <div class="h-3 w-px bg-zinc-700/80 mx-0.5" />

    <button
      type="button"
      data-testid="ai-explain-action"
      class="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-zinc-800 active:scale-95 transition-all text-[#C8E695]"
      :title="t('ai.explainSnippet')"
      @click="handleAiExplain"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <span>{{ t('ai.explainSnippet') }}</span>
    </button>

    <button
      type="button"
      data-testid="ai-character-action"
      class="p-1 rounded-lg hover:bg-zinc-800 active:scale-95 transition-all text-sky-300"
      :title="t('ai.whoIsCharacter')"
      @click="handleAiCharacter"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    </button>

    <button
      type="button"
      data-testid="ai-dictionary-action"
      class="p-1 rounded-lg hover:bg-zinc-800 active:scale-95 transition-all text-teal-300"
      :title="t('ai.contextualDictionary')"
      @click="handleAiDictionary"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    </button>

    <button
      v-if="highlightStore.selectedHighlight"
      type="button"
      data-testid="delete-highlight-btn"
      class="p-1 rounded-lg hover:bg-red-950/60 active:scale-95 transition-all text-red-400"
      :title="t('highlights.deleteHighlight')"
      @click="handleDeleteHighlight"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>

    <button
      type="button"
      data-testid="dismiss-tooltip-btn"
      class="p-1 rounded-lg hover:bg-zinc-800 active:scale-95 transition-all text-zinc-400"
      @click="handleDismiss"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>
