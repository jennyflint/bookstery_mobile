<script setup lang="ts">
import type { Collection, CollectionWithCount } from '../../types';

interface Props {
  readonly isOpen: boolean;
  readonly collection: Collection | CollectionWithCount | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', collectionId: number): void;
}>();

const { t } = useI18n();

const handleConfirm = (): void => {
  if (props.collection) {
    emit('confirm', props.collection.id);
  }
};
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.isOpen"
      data-testid="collection-delete-confirm-modal"
      class="backdrop-blur-xs fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="emit('close')"
    >
      <div
        class="animate-in fade-in zoom-in-95 w-full max-w-sm transform rounded-3xl border border-[#C8E695]/60 bg-[#F4ECD8] p-6 text-[#3E5725] shadow-2xl transition-all duration-200"
      >
        <div class="mb-4 flex items-center gap-3">
          <div
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600"
          >
            <svg
              class="h-6 w-6"
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
          </div>
          <div>
            <h3 class="text-lg font-bold text-[#3E5725]">
              {{ t('collections.deleteTitle') }}
            </h3>
            <p
              v-if="props.collection"
              class="max-w-[200px] truncate text-xs font-semibold text-[#3E5725]/75"
            >
              "{{ props.collection.name }}"
            </p>
          </div>
        </div>

        <p
          class="mb-6 rounded-2xl border border-[#C8E695]/40 bg-white/70 p-3.5 text-sm font-medium leading-relaxed text-[#3E5725]/90"
        >
          {{ t('collections.deleteReassurance') }}
        </p>

        <div class="flex items-center justify-end gap-3">
          <button
            type="button"
            data-testid="cancel-delete-collection-btn"
            class="rounded-xl border border-[#C8E695]/40 bg-white/80 px-4 py-2.5 text-xs font-bold text-[#3E5725] transition-all hover:bg-white active:scale-95"
            @click="emit('close')"
          >
            {{ t('collections.deleteCancel') }}
          </button>
          <button
            type="button"
            data-testid="confirm-delete-collection-btn"
            class="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-rose-700 active:scale-95"
            @click="handleConfirm"
          >
            {{ t('collections.deleteConfirm') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
