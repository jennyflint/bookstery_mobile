<script setup lang="ts">
import { useLibraryStore } from '../../stores/libraryStore';
import type { BookFormat, BookRecord } from '../../types';
import BookCard from './BookCard.vue';

const emit = defineEmits<{
  (e: 'select-book', book: BookRecord): void;
  (e: 'open-scanner'): void;
}>();

const { t } = useI18n();
const libraryStore = useLibraryStore();

const setFormat = (format: 'all' | BookFormat) => {
  libraryStore.setFormatFilter(format);
};

const handleDelete = async (id: string) => {
  await libraryStore.removeBook(id);
};
</script>

<template>
  <div data-testid="book-grid" class="space-y-6">
    <div class="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
      <div class="relative flex-1">
        <input
          v-model="libraryStore.searchQuery"
          type="text"
          :placeholder="t('library.searchPlaceholder')"
          class="w-full pl-10 pr-4 py-3 rounded-2xl bg-zinc-100 border-none text-zinc-900 placeholder:text-zinc-400 text-sm focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all shadow-inner"
        />
        <svg
          class="w-5 h-5 absolute left-3.5 top-3.5 text-zinc-400 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      <button
        type="button"
        class="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold text-sm shadow-md transition-all"
        @click="emit('open-scanner')"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        <span>{{ t('library.scanDevice') }}</span>
      </button>
    </div>

    <div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
      <button
        type="button"
        class="px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all"
        :class="libraryStore.formatFilter === 'all' ? 'bg-zinc-900 text-white shadow-sm' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'"
        @click="setFormat('all')"
      >
        {{ t('library.filterAll') }}
      </button>
      <button
        type="button"
        class="px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all"
        :class="libraryStore.formatFilter === 'pdf' ? 'bg-zinc-900 text-white shadow-sm' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'"
        @click="setFormat('pdf')"
      >
        {{ t('library.filterPdf') }}
      </button>
      <button
        type="button"
        class="px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all"
        :class="libraryStore.formatFilter === 'epub' ? 'bg-zinc-900 text-white shadow-sm' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'"
        @click="setFormat('epub')"
      >
        {{ t('library.filterEpub') }}
      </button>
      <button
        type="button"
        class="px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all"
        :class="libraryStore.formatFilter === 'fb2' ? 'bg-zinc-900 text-white shadow-sm' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'"
        @click="setFormat('fb2')"
      >
        {{ t('library.filterFb2') }}
      </button>
    </div>

    <div
      v-if="libraryStore.filteredBooks.length > 0"
      class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
    >
      <BookCard
        v-for="book in libraryStore.filteredBooks"
        :key="book.id"
        :book="book"
        @select="emit('select-book', $event)"
        @delete="handleDelete"
      />
    </div>

    <div
      v-else
      class="flex flex-col items-center justify-center py-16 px-4 text-center rounded-3xl border border-dashed border-zinc-200 bg-zinc-50/50"
    >
      <div class="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
        <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </div>
      <h3 class="text-base font-bold text-zinc-900 mb-1">{{ t('library.emptyTitle') }}</h3>
      <p class="text-xs text-zinc-500 max-w-sm mb-6">{{ t('library.emptySubtitle') }}</p>
      <button
        type="button"
        class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-all shadow-sm active:scale-95"
        @click="emit('open-scanner')"
      >
        {{ t('library.scanDevice') }}
      </button>
    </div>
  </div>
</template>
