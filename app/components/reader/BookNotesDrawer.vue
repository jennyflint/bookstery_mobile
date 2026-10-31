<script setup lang="ts">
import { computed } from 'vue';
import { useHighlightStore } from '../../stores/highlightStore';
import { HIGHLIGHT_COLORS, type HighlightColor, type HighlightRecord } from '../../types';

const emit = defineEmits<{
  (e: 'navigate', locator: string): void;
}>();

const { t } = useI18n();
const highlightStore = useHighlightStore();

const colors: HighlightColor[] = ['yellow', 'green', 'pink', 'blue', 'purple'];

const searchQuery = computed({
  get: () => highlightStore.searchQuery,
  set: (val: string) => highlightStore.setSearchQuery(val),
});

const handleSelectFilter = (color: HighlightColor | null) => {
  highlightStore.setColorFilter(color);
};

const handleNavigate = (hl: HighlightRecord) => {
  emit('navigate', hl.locator);
  highlightStore.closeNotesDrawer();
};

const handleEditNote = (hl: HighlightRecord) => {
  highlightStore.openNoteEditorForExisting(hl);
};

const handleQuoteCard = (hl: HighlightRecord) => {
  highlightStore.openQuoteCardForHighlight(hl);
};

const handleDelete = async (id: string) => {
  await highlightStore.deleteHighlight(id);
};

const handleOpenExport = () => {
  highlightStore.openExportModal();
};

const handleClose = () => {
  highlightStore.closeNotesDrawer();
};
</script>

<template>
  <div
    v-if="highlightStore.isNotesDrawerOpen"
    class="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
    data-testid="book-notes-drawer"
    @click.self="handleClose"
  >
    <aside
      class="w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-250 border-l border-zinc-200"
      :style="{
        paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
      }"
    >
      <header class="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100">
        <div class="flex items-center gap-2">
          <h2 class="text-base font-bold text-zinc-900">
            {{ t('highlights.notesTitle') }}
          </h2>
          <span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-600">
            {{ highlightStore.totalHighlightsCount }}
          </span>
        </div>

        <div class="flex items-center gap-1">
          <button
            type="button"
            data-testid="open-export-modal-btn"
            class="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:scale-95 transition-all"
            :title="t('highlights.exportNotes')"
            @click="handleOpenExport"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>{{ t('highlights.exportNotes') }}</span>
          </button>

          <button
            type="button"
            data-testid="close-drawer-btn"
            class="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 active:scale-95 transition-colors"
            @click="handleClose"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      <div class="px-5 py-3 flex flex-col gap-2.5 border-b border-zinc-100 bg-zinc-50/60">
        <div class="relative">
          <input
            v-model="searchQuery"
            type="text"
            data-testid="notes-search-input"
            :placeholder="t('highlights.searchPlaceholder')"
            class="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 text-zinc-800 placeholder-zinc-400 shadow-sm"
          >
          <svg class="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            data-testid="filter-color-all"
            class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
            :class="highlightStore.activeColorFilter === null ? 'bg-zinc-800 text-white' : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100'"
            @click="handleSelectFilter(null)"
          >
            {{ t('highlights.filterAll') }}
          </button>
          <button
            v-for="color in colors"
            :key="color"
            type="button"
            :data-testid="`filter-color-${color}`"
            class="w-6 h-6 rounded-full border-2 transition-transform active:scale-95 flex items-center justify-center shrink-0"
            :class="highlightStore.activeColorFilter === color ? 'ring-2 ring-zinc-800 scale-110' : 'opacity-70 hover:opacity-100'"
            :style="{
              backgroundColor: HIGHLIGHT_COLORS[color].bg,
              borderColor: HIGHLIGHT_COLORS[color].border,
            }"
            @click="handleSelectFilter(color)"
          />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        <div
          v-if="highlightStore.filteredHighlights.length === 0"
          class="flex flex-col items-center justify-center h-64 text-center px-4"
        >
          <div class="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mb-3">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <p class="text-sm font-bold text-zinc-700">
            {{ t('highlights.emptyNotes') }}
          </p>
          <p class="text-xs text-zinc-400 mt-1 max-w-xs">
            {{ t('highlights.emptyNotesSubtitle') }}
          </p>
        </div>

        <article
          v-for="hl in highlightStore.filteredHighlights"
          :key="hl.id"
          data-testid="highlight-item"
          class="p-4 rounded-2xl bg-white border border-zinc-200/80 hover:border-zinc-300 shadow-sm transition-all flex flex-col gap-2.5 relative group"
          :style="{
            borderLeftWidth: '5px',
            borderLeftColor: HIGHLIGHT_COLORS[hl.color].border,
          }"
        >
          <div class="flex items-center justify-between text-[11px] font-semibold text-zinc-400">
            <span class="truncate max-w-[200px]">{{ hl.locator }}</span>
            <span
              class="px-2 py-0.5 rounded-full font-bold"
              :style="{
                backgroundColor: HIGHLIGHT_COLORS[hl.color].bg,
                color: HIGHLIGHT_COLORS[hl.color].border,
              }"
            >
              {{ t(`highlights.colors.${hl.color}`) }}
            </span>
          </div>

          <blockquote
            class="text-xs font-serif italic text-zinc-800 leading-relaxed cursor-pointer hover:text-emerald-800 transition-colors"
            @click="handleNavigate(hl)"
          >
            “{{ hl.selected_text }}”
          </blockquote>

          <div
            v-if="hl.note"
            class="p-2.5 rounded-xl bg-zinc-50 border border-zinc-100 text-xs text-zinc-700 font-sans"
          >
            <span class="font-bold text-[10px] text-zinc-400 uppercase tracking-wider block mb-0.5">
              {{ t('highlights.notesTitle') }}:
            </span>
            {{ hl.note }}
          </div>

          <div class="flex items-center justify-end gap-1 pt-1 border-t border-zinc-100">
            <button
              type="button"
              class="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-700 hover:bg-emerald-50 active:scale-95 transition-all text-xs flex items-center gap-1 font-semibold"
              :title="t('highlights.editNote')"
              @click="handleEditNote(hl)"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>

            <button
              type="button"
              class="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-700 hover:bg-emerald-50 active:scale-95 transition-all text-xs flex items-center gap-1 font-semibold"
              :title="t('highlights.quoteCard')"
              @click="handleQuoteCard(hl)"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>

            <button
              type="button"
              data-testid="delete-highlight-item-btn"
              class="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 active:scale-95 transition-all"
              :title="t('highlights.delete')"
              @click="handleDelete(hl.id)"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </article>
      </div>
    </aside>
  </div>
</template>
