<script setup lang="ts">
import { computed } from 'vue';
import type { BookRecord, FolderFilter } from '../../types';

interface Props {
  readonly isOpen: boolean;
  readonly book: BookRecord | null;
  readonly currentFolderId?: FolderFilter;
}

const props = withDefaults(defineProps<Props>(), {
  currentFolderId: 'all',
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'manage-folders', book: BookRecord): void;
  (e: 'toggle-finished', book: BookRecord): void;
  (e: 'remove-from-folder', payload: { book: BookRecord; folderId: number }): void;
  (e: 'delete-book', book: BookRecord): void;
}>();

const { t } = useI18n();

const isFinished = computed((): boolean => {
  return (props.book?.progress_percentage ?? 0) >= 100;
});

const isInsideSpecificFolder = computed((): boolean => {
  return typeof props.currentFolderId === 'number';
});

const handleManageFolders = (): void => {
  if (props.book) {
    emit('manage-folders', props.book);
    emit('close');
  }
};

const handleToggleFinished = (): void => {
  if (props.book) {
    emit('toggle-finished', props.book);
    emit('close');
  }
};

const handleRemoveFromFolder = (): void => {
  if (props.book && typeof props.currentFolderId === 'number') {
    emit('remove-from-folder', {
      book: props.book,
      folderId: props.currentFolderId,
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
        class="animate-in slide-in-from-bottom duration-250 w-full transform overflow-hidden rounded-t-3xl border border-[#C8E695]/60 bg-[#F4ECD8] text-[#3E5725] shadow-2xl transition-transform sm:max-w-md sm:rounded-3xl"
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
            data-testid="action-manage-folders"
            class="flex w-full items-center gap-3 rounded-2xl border border-[#C8E695]/30 bg-white/70 px-4 py-3 text-sm font-semibold text-[#3E5725] transition-all hover:bg-white active:scale-[0.99]"
            @click="handleManageFolders"
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
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            <span>{{ t('folders.manageFoldersAction') }}</span>
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
            <span>{{ isFinished ? t('folders.markAsUnread') : t('folders.markAsFinished') }}</span>
          </button>

          <button
            v-if="isInsideSpecificFolder"
            type="button"
            data-testid="action-remove-from-folder"
            class="flex w-full items-center gap-3 rounded-2xl border border-amber-200/50 bg-amber-50/80 px-4 py-3 text-sm font-semibold text-amber-900 transition-all hover:bg-amber-50 active:scale-[0.99]"
            @click="handleRemoveFromFolder"
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
            <span>{{ t('folders.removeFromCurrentFolder') }}</span>
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
