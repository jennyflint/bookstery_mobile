<script setup lang="ts">
import { computed, watch } from 'vue';
import { useReaderStore } from '../../stores/readerStore';
import { useHighlightStore } from '../../stores/highlightStore';
import { useTextSelection } from '../../composables/useTextSelection';
import { TranslationService } from '../../services/translation/TranslationService';
import { useAiReader } from '../../composables/useAiReader';
import { useAiStore } from '../../stores/aiStore';
import { HIGHLIGHT_COLORS, type HighlightColor, type BookFormat } from '../../types';

const emit = defineEmits<{
  (e: 'translate', text: string): void;
}>();

const { t } = useI18n();
const readerStore = useReaderStore();
const highlightStore = useHighlightStore();
const aiStore = useAiStore();
const { dismissSelection } = useTextSelection();
const translationService = TranslationService.getInstance();
const { triggerExplain, triggerCharacter, triggerDictionary, triggerAskInChat } = useAiReader();

const colors: HighlightColor[] = ['yellow', 'green', 'pink', 'blue', 'purple'];

const isExistingSelected = computed(() => !!highlightStore.selectedHighlight);

watch(
  () => readerStore.currentBook?.id,
  () => {
    readerStore.clearTextSelection();
  },
);

const isVisible = computed(() => {
  if (isExistingSelected.value) {
    return true;
  }
  const selectionText = readerStore.selection?.text?.trim() || '';
  const activeText = highlightStore.activeSelection?.text?.trim() || '';
  return selectionText.length > 0 || activeText.length > 0;
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
      locator: readerStore.selection.locator || readerStore.locator || '1',
      format: (readerStore.currentBook?.format || 'epub') as BookFormat,
      x: readerStore.selection.x,
      y: readerStore.selection.y,
      width: readerStore.selection.width,
      height: readerStore.selection.height,
      blockId: readerStore.selection.blockId,
      partType: readerStore.selection.partType,
      startOffset: readerStore.selection.startOffset,
      endOffset: readerStore.selection.endOffset,
    });
  }

  await highlightStore.createHighlight(color);
  handleDismiss();
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
      locator: readerStore.selection.locator || readerStore.locator || '1',
      format: (readerStore.currentBook?.format || 'epub') as BookFormat,
      x: readerStore.selection.x,
      y: readerStore.selection.y,
      width: readerStore.selection.width,
      height: readerStore.selection.height,
      blockId: readerStore.selection.blockId,
      partType: readerStore.selection.partType,
      startOffset: readerStore.selection.startOffset,
      endOffset: readerStore.selection.endOffset,
    });
  }

  highlightStore.openNoteEditorForSelection('green');
  handleDismiss();
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
      locator: readerStore.selection.locator || readerStore.locator || '1',
      format: (readerStore.currentBook?.format || 'epub') as BookFormat,
      x: readerStore.selection.x,
      y: readerStore.selection.y,
      width: readerStore.selection.width,
      height: readerStore.selection.height,
      blockId: readerStore.selection.blockId,
      partType: readerStore.selection.partType,
      startOffset: readerStore.selection.startOffset,
      endOffset: readerStore.selection.endOffset,
    });
  }

  highlightStore.openQuoteCardForSelection();
  handleDismiss();
};

const handleCopy = async () => {
  const text = getSelectionText();
  if (text) {
    await translationService.copyToClipboard(text);
    handleDismiss();
  }
};

const handleShare = async () => {
  const text = getSelectionText();
  if (!text) return;

  try {
    const shareModule = await import('@capacitor/share').catch(() => null);
    if (shareModule && shareModule.Share) {
      await shareModule.Share.share({
        title: readerStore.currentBook?.title || 'Bookstery',
        text,
        dialogTitle: t('highlights.shareText'),
      });
      handleDismiss();
      return;
    }
  } catch {
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: readerStore.currentBook?.title || 'Bookstery',
        text,
      });
      handleDismiss();
      return;
    } catch {
    }
  }

  await translationService.copyToClipboard(text);
  handleDismiss();
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
    if (!aiStore.isConfigured) {
      aiStore.openOnboardingModal();
      return;
    }
    handleDismiss();
    await triggerExplain(text);
  }
};

const handleAiCharacter = async () => {
  const text = getSelectionText();
  if (text) {
    if (!aiStore.isConfigured) {
      aiStore.openOnboardingModal();
      return;
    }
    handleDismiss();
    await triggerCharacter(text);
  }
};

const handleAiDictionary = async () => {
  const text = getSelectionText();
  if (text) {
    if (!aiStore.isConfigured) {
      aiStore.openOnboardingModal();
      return;
    }
    handleDismiss();
    await triggerDictionary(text);
  }
};

const handleAskInChat = async () => {
  const text = getSelectionText();
  if (text) {
    if (!aiStore.isConfigured) {
      aiStore.openOnboardingModal();
      return;
    }
    handleDismiss();
    await triggerAskInChat(text);
  }
};

const handleDeleteHighlight = async () => {
  if (highlightStore.selectedHighlight) {
    await highlightStore.deleteHighlight(highlightStore.selectedHighlight.id);
    handleDismiss();
  }
};

/** Clears reactive + native selection (including EPUB iframes) and hides the bar. */
const handleDismiss = () => {
  dismissSelection();
};
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-full opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-full opacity-0"
  >
    <div
      v-if="isVisible"
      data-testid="reader-selection-bar"
      class="fixed bottom-0 inset-x-0 z-50 bg-zinc-900/95 text-white backdrop-blur-xl border-t border-zinc-800/80 shadow-2xl px-3 py-3 select-none"
      :style="{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }"
      @mousedown.prevent
      @touchstart.stop
    >
      <!--
        mousedown.prevent keeps focus in the document so tapping an action never collapses
        the active native selection before the action runs; touchstart.stop keeps bar
        gestures away from reader gesture handlers.
      -->
      <div class="flex flex-wrap items-center justify-center">
        <!-- Color swatches -->
        <div class="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-zinc-800/90 border border-zinc-700/60 shadow-inner">
          <button
            v-for="color in colors"
            :key="color"
            type="button"
            :data-testid="`hl-color-${color}`"
            :title="t(`highlights.colors.${color}`)"
            class="w-6 h-6 rounded-full transition-transform hover:scale-125 active:scale-90 shadow-sm border border-black/30 focus:outline-none focus:ring-2 focus:ring-white/50"
            :style="{
              backgroundColor: HIGHLIGHT_COLORS[color].bg,
              borderColor: HIGHLIGHT_COLORS[color].border,
            }"
            @click="handleApplyHighlight(color)"
          />
        </div>

        <!-- Add / Edit Note -->
        <button
          type="button"
          data-testid="add-note-action"
          class="min-h-[40px] px-3 py-2 flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700/90 active:scale-95 transition-all text-amber-300 text-xs font-semibold shadow-sm"
          :title="highlightStore.selectedHighlight ? t('highlights.editNote') : t('highlights.addNote')"
          @click="handleAddNote"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span>{{ highlightStore.selectedHighlight ? t('highlights.editNote') : t('highlights.addNote') }}</span>
        </button>

        <!-- Quote Card -->
        <button
          type="button"
          data-testid="create-quote-card-action"
          class="min-h-[40px] px-3 py-2 flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700/90 active:scale-95 transition-all text-emerald-300 text-xs font-semibold shadow-sm"
          :title="t('highlights.quoteCard')"
          @click="handleQuoteCard"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>{{ t('highlights.quoteCard') }}</span>
        </button>

        <!-- Copy Text -->
        <button
          type="button"
          data-testid="copy-text-action"
          class="min-h-[40px] px-3 py-2 flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700/90 active:scale-95 transition-all text-zinc-200 text-xs font-semibold shadow-sm"
          :title="t('highlights.copyText')"
          @click="handleCopy"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>{{ t('highlights.copyText') }}</span>
        </button>

        <!-- Translate -->
        <button
          type="button"
          data-testid="translate-action-btn"
          class="min-h-[40px] px-3 py-2 flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700/90 active:scale-95 transition-all text-indigo-300 text-xs font-semibold shadow-sm"
          :title="t('translation.translate')"
          @click="handleTranslate"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
          </svg>
          <span>{{ t('translation.translate') }}</span>
        </button>

        <!-- Share -->
        <button
          type="button"
          data-testid="share-text-action"
          class="min-h-[40px] px-3 py-2 flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700/90 active:scale-95 transition-all text-cyan-300 text-xs font-semibold shadow-sm"
          :title="t('highlights.shareText')"
          @click="handleShare"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <span>{{ t('highlights.shareText') }}</span>
        </button>

        <!-- AI Explain -->
        <button
          type="button"
          data-testid="ai-explain-action"
          class="min-h-[40px] px-3 py-2 flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 rounded-xl transition-all text-xs font-semibold shadow-sm"
          :class="
            !aiStore.isConfigured
              ? 'bg-zinc-800/50 text-zinc-500 opacity-60 cursor-not-allowed'
              : 'bg-zinc-800/90 hover:bg-zinc-700/90 active:scale-95 text-[#C8E695]'
          "
          :aria-disabled="!aiStore.isConfigured"
          :title="!aiStore.isConfigured ? t('ai.keyRequiredTooltip') : t('ai.explainSnippet')"
          @click="handleAiExplain"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>{{ t('ai.explainSnippet') }}</span>
        </button>

        <!-- AI Character -->
        <button
          type="button"
          data-testid="ai-character-action"
          class="min-h-[40px] px-3 py-2 flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 rounded-xl transition-all text-xs font-semibold shadow-sm"
          :class="
            !aiStore.isConfigured
              ? 'bg-zinc-800/50 text-zinc-500 opacity-60 cursor-not-allowed'
              : 'bg-zinc-800/90 hover:bg-zinc-700/90 active:scale-95 text-sky-300'
          "
          :aria-disabled="!aiStore.isConfigured"
          :title="!aiStore.isConfigured ? t('ai.keyRequiredTooltip') : t('ai.whoIsCharacter')"
          @click="handleAiCharacter"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span>{{ t('ai.whoIsCharacter') }}</span>
        </button>

        <!-- AI Dictionary -->
        <button
          type="button"
          data-testid="ai-dictionary-action"
          class="min-h-[40px] px-3 py-2 flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 rounded-xl transition-all text-xs font-semibold shadow-sm"
          :class="
            !aiStore.isConfigured
              ? 'bg-zinc-800/50 text-zinc-500 opacity-60 cursor-not-allowed'
              : 'bg-zinc-800/90 hover:bg-zinc-700/90 active:scale-95 text-teal-300'
          "
          :aria-disabled="!aiStore.isConfigured"
          :title="!aiStore.isConfigured ? t('ai.keyRequiredTooltip') : t('ai.contextualDictionary')"
          @click="handleAiDictionary"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <span>{{ t('ai.contextualDictionary') }}</span>
        </button>

        <!-- Ask AI in Chat -->
        <button
          type="button"
          data-testid="ask-ai-chat-action"
          class="min-h-[40px] px-3 py-2 flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 rounded-xl transition-all text-xs font-semibold shadow-sm"
          :class="
            !aiStore.isConfigured
              ? 'bg-zinc-800/50 text-zinc-500 opacity-60 cursor-not-allowed'
              : 'bg-zinc-800/90 hover:bg-zinc-700/90 active:scale-95 text-amber-300'
          "
          :aria-disabled="!aiStore.isConfigured"
          :title="!aiStore.isConfigured ? t('ai.keyRequiredTooltip') : t('ai.askInChat')"
          @click="handleAskInChat"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span>{{ t('ai.askInChat') }}</span>
        </button>

        <!-- Delete Highlight (when highlight selected) -->
        <button
          v-if="highlightStore.selectedHighlight"
          type="button"
          data-testid="delete-highlight-btn"
          class="min-h-[40px] px-3 py-2 flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 rounded-xl bg-red-950/70 hover:bg-red-900/80 active:scale-95 transition-all text-red-300 text-xs font-semibold shadow-sm border border-red-800/40"
          :title="t('highlights.deleteHighlight')"
          @click="handleDeleteHighlight"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span>{{ t('highlights.deleteHighlight') }}</span>
        </button>

        <!-- Dismiss / Clear Selection Button -->
        <button
          type="button"
          data-testid="dismiss-selection-bar-btn"
          class="min-h-[40px] min-w-[40px] px-2.5 py-2 flex items-center justify-center rounded-xl bg-zinc-800/90 hover:bg-zinc-700/90 active:scale-95 transition-all text-zinc-400 hover:text-white shadow-sm"
          :title="t('highlights.cancel')"
          @click="handleDismiss"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </Transition>
</template>
