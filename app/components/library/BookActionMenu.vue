<script setup lang="ts">
import { computed } from 'vue';
import type { BookRecord, CollectionFilter } from '../../types';

interface Props {
  readonly isOpen: boolean;
  readonly book: BookRecord | null;
  readonly currentCollectionId?: CollectionFilter;
}

const props = withDefaults(defineProps<Props>(), {
  currentCollectionId: 'all',
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'manage-collections', book: BookRecord): void;
  (e: 'toggle-finished', book: BookRecord): void;
  (e: 'toggle-pin', book: BookRecord): void;
  (e: 'remove-from-collection', payload: { book: BookRecord; collectionId: number }): void;
  (e: 'delete-book', book: BookRecord): void;
}>();

const { t } = useI18n();

const isPinned = computed((): boolean => {
  return props.book?.is_pinned === 1;
});

const isFinished = computed((): boolean => {
  return (props.book?.progress_percentage ?? 0) >= 100;
});

const isInsideSpecificCollection = computed((): boolean => {
  return typeof props.currentCollectionId === 'number';
});

const handleTogglePin = (): void => {
  if (props.book) {
    emit('toggle-pin', props.book);
    emit('close');
  }
};

const handleManageCollections = (): void => {
  if (props.book) {
    emit('manage-collections', props.book);
    emit('close');
  }
};

const handleToggleFinished = (): void => {
  if (props.book) {
    emit('toggle-finished', props.book);
    emit('close');
  }
};

const handleRemoveFromCollection = (): void => {
  if (props.book && typeof props.currentCollectionId === 'number') {
    emit('remove-from-collection', {
      book: props.book,
      collectionId: props.currentCollectionId,
    });
    emit('close');
  }
};

const handleDeleteBook = (): void => {
  if (props.book) {
    emit('delete-book', props.book);
    emit('close');
  }
};
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.isOpen && props.book"
      class="backdrop-blur-xs fixed inset-0 z-50 flex flex-col justify-end bg-black/60 p-0 transition-opacity sm:items-center sm:justify-center sm:p-4"
      @click.self="emit('close')"
    >
      <div
        data-testid="book-action-menu"
        class="animate-in slide-in-from-bottom w-full transform overflow-hidden rounded-t-3xl border border-[#C8E695]/60 bg-[#F4ECD8] text-[#3E5725] shadow-2xl transition-transform duration-200 sm:max-w-md sm:rounded-3xl"
        :style="{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }"
      >
        <div class="flex items-center justify-between border-b border-[#C8E695]/40 p-4">
          <div class="flex items-center gap-3 truncate">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#3E5725] text-xs font-bold uppercase text-[#C8E695]"
            >
              {{ props.book.format }}
            </div>
            <div class="truncate">
              <h3 class="truncate text-sm font-bold text-[#3E5725]">
                {{ props.book.title }}
              </h3>
              <p
                v-if="props.book.author"
                class="truncate text-xs text-[#3E5725]/70"
              >
                {{ props.book.author }}
              </p>
            </div>
          </div>

          <button
            type="button"
            class="shrink-0 rounded-xl p-2 text-[#3E5725]/60 transition-all hover:bg-[#C8E695]/30 hover:text-[#3E5725]"
            @click="emit('close')"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div class="space-y-1 p-3">
          <button
            type="button"
            :data-testid="isPinned ? 'unpin-book-action' : 'pin-book-action'"
            class="flex w-full items-center gap-3 rounded-2xl border border-[#C8E695]/30 bg-white/70 px-4 py-3 text-sm font-semibold text-[#3E5725] transition-all hover:bg-white active:scale-[0.99]"
            @click="handleTogglePin"
          >
            <svg
              v-if="!isPinned"
              class="h-5 w-5 text-[#3E5725]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v2a2 2 0 01-2 2H7a2 2 0 01-2-2V5zm7 4v12m-4-6l4 6 4-6"
              />
            </svg>
            <svg
              v-else
              class="h-5 w-5 text-amber-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 3l18 18M9 9v3m3-3v3m4 0v-1m-7 4l3 5 3-5M7 5h2m6 0h2"
              />
            </svg>
            <span>{{ isPinned ? t('library.unpinBook') : t('library.pinToTop') }}</span>
          </button>

          <button
            type="button"
            data-testid="manage-collections-action"
            class="flex w-full items-center gap-3 rounded-2xl border border-[#C8E695]/30 bg-white/70 px-4 py-3 text-sm font-semibold text-[#3E5725] transition-all hover:bg-white active:scale-[0.99]"
            @click="handleManageCollections"
          >
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
            <span>{{ t('collections.manageCollectionsAction') }}</span>
          </button>

          <button
            type="button"
            data-testid="action-toggle-finished"
            class="flex w-full items-center gap-3 rounded-2xl border border-[#C8E695]/30 bg-white/70 px-4 py-3 text-sm font-semibold text-[#3E5725] transition-all hover:bg-white active:scale-[0.99]"
            @click="handleToggleFinished"
          >
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
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{{
              isFinished ? t('collections.markAsUnread') : t('collections.markAsFinished')
            }}</span>
          </button>

          <button
            v-if="isInsideSpecificCollection"
            type="button"
            data-testid="remove-from-collection-action"
            class="flex w-full items-center gap-3 rounded-2xl border border-amber-200/50 bg-amber-50/80 px-4 py-3 text-sm font-semibold text-amber-900 transition-all hover:bg-amber-50 active:scale-[0.99]"
            @click="handleRemoveFromCollection"
          >
            <svg
              class="h-5 w-5 text-amber-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{{ t('collections.removeFromCurrentCollection') }}</span>
          </button>

          <button
            type="button"
            data-testid="action-delete-book"
            class="flex w-full items-center gap-3 rounded-2xl border border-rose-200/60 bg-rose-50/80 px-4 py-3 text-sm font-semibold text-rose-700 transition-all hover:bg-rose-100 active:scale-[0.99]"
            @click="handleDeleteBook"
          >
            <svg
              class="h-5 w-5 text-rose-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            <span>{{ t('library.deleteBook') }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
