<script setup lang="ts">
import { ref, watch } from 'vue';
import { useHighlightStore } from '../../stores/highlightStore';
import { HIGHLIGHT_COLORS, type HighlightColor } from '../../types';

const { t } = useI18n();
const highlightStore = useHighlightStore();

const localNote = ref('');
const selectedColor = ref<HighlightColor>('green');
const colors: HighlightColor[] = ['yellow', 'green', 'pink', 'blue', 'purple'];

watch(
  () => highlightStore.isNoteModalOpen,
  (isOpen) => {
    if (isOpen) {
      localNote.value = highlightStore.draftNoteText || '';
      selectedColor.value = highlightStore.draftColor || 'green';
    }
  },
  { immediate: true },
);

const handleSave = async () => {
  highlightStore.draftColor = selectedColor.value;
  await highlightStore.saveDraftNote(localNote.value.trim());
};

const handleCancel = () => {
  highlightStore.closeNoteModal();
};

const handleDelete = async () => {
  if (highlightStore.draftHighlightId) {
    await highlightStore.deleteHighlight(highlightStore.draftHighlightId);
  } else {
    highlightStore.closeNoteModal();
  }
};
</script>

<template>
  <div
    v-if="highlightStore.isNoteModalOpen"
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    data-testid="highlight-note-modal"
    @click.self="handleCancel"
  >
    <div
      class="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl p-6 flex flex-col gap-4 animate-in slide-in-from-bottom duration-250 border-t border-zinc-200"
      :style="{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }"
    >
      <div class="w-12 h-1.5 bg-zinc-300 rounded-full mx-auto" />

      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-zinc-900">
          {{ highlightStore.draftHighlightId ? t('highlights.editNote') : t('highlights.addNote') }}
        </h3>
        <button
          type="button"
          data-testid="cancel-note-btn"
          class="p-1 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
          @click="handleCancel"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div
        class="p-3.5 bg-zinc-50 rounded-2xl border-l-4 text-xs italic text-zinc-700 max-h-28 overflow-y-auto leading-relaxed shadow-inner"
        :style="{
          borderLeftColor: HIGHLIGHT_COLORS[selectedColor].border,
          backgroundColor: HIGHLIGHT_COLORS[selectedColor].bg + '22',
        }"
      >
        <span class="font-bold not-italic block mb-1 text-[11px] text-zinc-500 uppercase tracking-wider">
          {{ t('highlights.quoteSnippet') }}
        </span>
        “{{ highlightStore.draftQuoteText }}”
      </div>

      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold text-zinc-500 mr-1">
          {{ t('highlights.notesTitle') }}:
        </span>
        <button
          v-for="color in colors"
          :key="color"
          type="button"
          :data-testid="`note-color-${color}`"
          :title="t(`highlights.colors.${color}`)"
          class="w-6 h-6 rounded-full transition-transform active:scale-95 border-2"
          :class="selectedColor === color ? 'ring-2 ring-zinc-800 scale-110' : 'opacity-80 hover:opacity-100'"
          :style="{
            backgroundColor: HIGHLIGHT_COLORS[color].bg,
            borderColor: HIGHLIGHT_COLORS[color].border,
          }"
          @click="selectedColor = color"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <textarea
          v-model="localNote"
          data-testid="note-textarea"
          rows="4"
          :placeholder="t('highlights.notePlaceholder')"
          class="w-full p-3.5 rounded-2xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600 text-sm text-zinc-800 placeholder-zinc-400 bg-white shadow-sm resize-none"
        />
      </div>

      <div class="flex items-center justify-between pt-1 gap-3">
        <button
          v-if="highlightStore.draftHighlightId"
          type="button"
          data-testid="delete-note-highlight-btn"
          class="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 active:scale-95 transition-all"
          @click="handleDelete"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span>{{ t('highlights.delete') }}</span>
        </button>
        <div v-else />

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-100 active:scale-95 transition-all"
            @click="handleCancel"
          >
            {{ t('highlights.cancel') }}
          </button>
          <button
            type="button"
            data-testid="save-note-btn"
            class="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 shadow-md transition-all flex items-center gap-1.5"
            @click="handleSave"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>{{ t('highlights.saveNote') }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
