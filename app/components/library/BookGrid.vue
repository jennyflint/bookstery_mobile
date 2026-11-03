<script setup lang="ts">
import { ref, computed } from 'vue';
import { useLibraryStore } from '../../stores/libraryStore';
import { useCollectionStore } from '../../stores/collectionStore';
import { useCollectionNavigation } from '../../composables/useCollectionNavigation';
import type { BookFormat, BookRecord } from '../../types';
import { useBookSort } from '../../composables/useBookSort';
import { useAndroidBackButton, BACK_PRIORITY } from '../../composables/useAndroidBackButton';
import BookCard from './BookCard.vue';
import BookActionMenu from './BookActionMenu.vue';
import CollectionAssignModal from './CollectionAssignModal.vue';
import BookSortControl from './BookSortControl.vue';

const emit = defineEmits<{
  (e: 'select-book', book: BookRecord): void;
  (e: 'open-scanner'): void;
}>();

const { t, locale } = useI18n();
const libraryStore = useLibraryStore();
const collectionStore = useCollectionStore();
const { activeCollectionId, activeCollectionName, selectCollection } = useCollectionNavigation();
const bookSort = useBookSort('bookstery_book_sort');

const selectedMenuBook = ref<BookRecord | null>(null);
const isActionMenuOpen = ref(false);
const selectedAssignBook = ref<BookRecord | null>(null);
const isAssignModalOpen = ref(false);
const { registerBackHandler } = useAndroidBackButton();

registerBackHandler(() => {
  if (isActionMenuOpen.value) {
    handleCloseMenu();
    return true;
  }
  if (isAssignModalOpen.value) {
    handleCloseAssignModal();
    return true;
  }
  return false;
}, BACK_PRIORITY.ROOT_MODAL);

const setFormat = (format: 'all' | BookFormat): void => {
  libraryStore.setFormatFilter(format);
};

const handleDelete = async (id: string): Promise<void> => {
  await libraryStore.removeBook(id);
  await collectionStore.fetchCollections();
};

const handleOpenMenu = (book: BookRecord): void => {
  selectedMenuBook.value = book;
  isActionMenuOpen.value = true;
};

const handleCloseMenu = (): void => {
  isActionMenuOpen.value = false;
  selectedMenuBook.value = null;
};

const handleManageCollections = (book: BookRecord): void => {
  selectedAssignBook.value = book;
  isAssignModalOpen.value = true;
};

const handleCloseAssignModal = (): void => {
  isAssignModalOpen.value = false;
  selectedAssignBook.value = null;
};

const handleCollectionsSaved = async (): Promise<void> => {
  await collectionStore.fetchCollections();
  if (activeCollectionId.value !== 'all') {
    await collectionStore.loadCollectionBooks(activeCollectionId.value);
  }
};

const handleToggleFinished = async (book: BookRecord): Promise<void> => {
  const isFinished = book.progress_percentage >= 100;
  const newProgress = isFinished ? 0 : 100;
  await libraryStore.updateProgress(book.id, book.locator, newProgress);
  if (activeCollectionId.value !== 'all') {
    await collectionStore.loadCollectionBooks(activeCollectionId.value);
  }
};

const handleTogglePin = async (book: BookRecord): Promise<void> => {
  await libraryStore.toggleBookPin(book.id);
  if (activeCollectionId.value !== 'all') {
    await collectionStore.loadCollectionBooks(activeCollectionId.value);
  }
};

const handleRemoveFromCollection = async (payload: {
  book: BookRecord;
  collectionId: number;
}): Promise<void> => {
  await collectionStore.removeBookFromCollection(payload.book.id, payload.collectionId);
  await collectionStore.fetchCollections();
  if (activeCollectionId.value === payload.collectionId) {
    await collectionStore.loadCollectionBooks(payload.collectionId);
  }
};

const displayBooks = computed((): BookRecord[] => {
  const sourceBooks =
    activeCollectionId.value === 'all' ? libraryStore.books : collectionStore.currentBooks;

  const filtered = sourceBooks.filter((book) => {
    const matchesQuery =
      !libraryStore.searchQuery ||
      book.title.toLowerCase().includes(libraryStore.searchQuery.toLowerCase()) ||
      (book.author && book.author.toLowerCase().includes(libraryStore.searchQuery.toLowerCase()));

    const matchesFormat =
      libraryStore.formatFilter === 'all' || book.format === libraryStore.formatFilter;

    return matchesQuery && matchesFormat;
  });

  return bookSort.applySort(filtered, locale.value, { keepPinnedOnTop: true });
});

const pinnedBooks = computed((): BookRecord[] => {
  return displayBooks.value.filter((b) => b.is_pinned === 1);
});

const unpinnedBooks = computed((): BookRecord[] => {
  return displayBooks.value.filter((b) => b.is_pinned !== 1);
});
</script>

<template>
  <div
    data-testid="book-grid"
    class="space-y-6"
  >
    <div
      v-if="activeCollectionId !== 'all'"
      data-testid="active-collection-banner"
      class="shadow-xs flex items-center justify-between rounded-2xl border border-[#C8E695]/80 bg-[#F4ECD8] p-3.5 text-[#3E5725]"
    >
      <div class="flex items-center gap-2.5">
        <svg
          class="h-5 w-5 text-[#3E5725]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
        <span class="text-sm font-bold">{{ activeCollectionName }}</span>
        <span class="rounded-full bg-[#C8E695] px-2 py-0.5 text-xs font-black">
          {{ displayBooks.length }}
        </span>
      </div>

      <button
        type="button"
        data-testid="clear-collection-filter-btn"
        class="rounded-xl border border-[#C8E695]/60 bg-white/80 px-3 py-1.5 text-xs font-bold text-[#3E5725] transition-all hover:bg-white active:scale-95"
        @click="selectCollection('all')"
      >
        {{ t('collections.allBooks') }}
      </button>
    </div>

    <div class="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
      <div class="relative flex-1">
        <input
          v-model="libraryStore.searchQuery"
          type="text"
          :placeholder="t('library.searchPlaceholder')"
          class="w-full rounded-2xl border-none bg-zinc-100 py-3 pl-10 pr-4 text-sm text-zinc-900 shadow-inner transition-all placeholder:text-zinc-400 focus:bg-white focus:ring-2 focus:ring-indigo-600"
        />
        <svg
          class="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      <button
        type="button"
        class="flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95"
        @click="emit('open-scanner')"
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
            d="M12 4v16m8-8H4"
          />
        </svg>
        <span>{{ t('library.scanDevice') }}</span>
      </button>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="scrollbar-none flex items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          class="whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold transition-all"
          :class="
            libraryStore.formatFilter === 'all'
              ? 'bg-zinc-900 text-white shadow-sm'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          "
          @click="setFormat('all')"
        >
          {{ t('library.filterAll') }}
        </button>
        <button
          type="button"
          class="whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold transition-all"
          :class="
            libraryStore.formatFilter === 'pdf'
              ? 'bg-zinc-900 text-white shadow-sm'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          "
          @click="setFormat('pdf')"
        >
          {{ t('library.filterPdf') }}
        </button>
        <button
          type="button"
          class="whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold transition-all"
          :class="
            libraryStore.formatFilter === 'epub'
              ? 'bg-zinc-900 text-white shadow-sm'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          "
          @click="setFormat('epub')"
        >
          {{ t('library.filterEpub') }}
        </button>
        <button
          type="button"
          class="whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold transition-all"
          :class="
            libraryStore.formatFilter === 'fb2'
              ? 'bg-zinc-900 text-white shadow-sm'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          "
          @click="setFormat('fb2')"
        >
          {{ t('library.filterFb2') }}
        </button>
      </div>

      <BookSortControl
        :model-value-field="bookSort.sortField.value"
        :model-value-order="bookSort.sortOrder.value"
        @update:model-value-field="bookSort.setSortField"
        @update:model-value-order="(order) => (bookSort.sortOrder.value = order)"
      />
    </div>

    <div
      v-if="displayBooks.length > 0"
      class="space-y-6"
    >
      <div
        v-if="pinnedBooks.length > 0"
        data-testid="pinned-books-section"
        class="space-y-3"
      >
        <div
          class="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-[#3E5725]"
        >
          <svg
            class="h-4 w-4 text-[#E8BE54]"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
          </svg>
          <span>{{ t('library.pinnedSection') }}</span>
          <span
            class="rounded-full bg-[#E8BE54]/30 px-2 py-0.5 text-[10px] font-black text-[#3E5725]"
          >
            {{ pinnedBooks.length }}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          <BookCard
            v-for="book in pinnedBooks"
            :key="book.id"
            :book="book"
            @select="emit('select-book', $event)"
            @delete="handleDelete"
            @open-menu="handleOpenMenu"
          />
        </div>
      </div>

      <div
        v-if="pinnedBooks.length > 0 && unpinnedBooks.length > 0"
        data-testid="books-section-divider"
        class="relative my-4"
      >
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-zinc-200"></div>
        </div>
        <div class="relative flex justify-start">
          <span class="bg-white/80 pr-3 text-xs font-bold uppercase tracking-wider text-zinc-400">
            {{ t('library.allBooksSection') }}
          </span>
        </div>
      </div>

      <div
        v-if="unpinnedBooks.length > 0"
        class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      >
        <BookCard
          v-for="book in unpinnedBooks"
          :key="book.id"
          :book="book"
          @select="emit('select-book', $event)"
          @delete="handleDelete"
          @open-menu="handleOpenMenu"
        />
      </div>
    </div>

    <div
      v-else
      class="flex flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-16 text-center"
    >
      <div
        class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-600"
      >
        <svg
          class="h-8 w-8"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      </div>
      <h3 class="mb-1 text-base font-bold text-zinc-900">{{ t('library.emptyTitle') }}</h3>
      <p class="mb-6 max-w-sm text-xs text-zinc-500">{{ t('library.emptySubtitle') }}</p>
      <button
        type="button"
        class="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-95"
        @click="emit('open-scanner')"
      >
        {{ t('library.scanDevice') }}
      </button>
    </div>

    <BookActionMenu
      :is-open="isActionMenuOpen"
      :book="selectedMenuBook"
      :current-collection-id="activeCollectionId"
      @close="handleCloseMenu"
      @manage-collections="handleManageCollections"
      @toggle-finished="handleToggleFinished"
      @toggle-pin="handleTogglePin"
      @remove-from-collection="handleRemoveFromCollection"
      @delete-book="handleDelete($event.id)"
    />

    <CollectionAssignModal
      :is-open="isAssignModalOpen"
      :book="selectedAssignBook"
      @close="handleCloseAssignModal"
      @saved="handleCollectionsSaved"
    />
  </div>
</template>
