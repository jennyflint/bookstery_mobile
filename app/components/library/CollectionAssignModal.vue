<script setup lang="ts">
import { ref, watch } from 'vue';
import { useCollectionStore } from '../../stores/collectionStore';
import type { BookRecord } from '../../types';

interface Props {
  readonly isOpen: boolean;
  readonly book: BookRecord | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved'): void;
}>();

const { t } = useI18n();
const collectionStore = useCollectionStore();

const selectedCollectionIds = ref<number[]>([]);
const newCollectionName = ref('');
const isSubmitting = ref(false);
const errorMessage = ref('');

const loadBookCollections = async (): Promise<void> => {
  if (!props.book) {
    selectedCollectionIds.value = [];
    return;
  }
  await collectionStore.fetchCollections();
  const ids = await collectionStore.getBookCollectionIds(props.book.id);
  selectedCollectionIds.value = [...ids];
};

watch(
  () => [props.isOpen, props.book?.id],
  async ([isOpen]) => {
    if (isOpen) {
      errorMessage.value = '';
      newCollectionName.value = '';
      await loadBookCollections();
    }
  },
  { immediate: true },
);

const toggleCollection = (collectionId: number): void => {
  if (selectedCollectionIds.value.includes(collectionId)) {
    selectedCollectionIds.value = selectedCollectionIds.value.filter((id) => id !== collectionId);
  } else {
    selectedCollectionIds.value.push(collectionId);
  }
};

const handleCreateCollection = async (): Promise<void> => {
  const trimmed = newCollectionName.value.trim();
  if (!trimmed) {
    return;
  }
  errorMessage.value = '';
  isSubmitting.value = true;
  try {
    const created = await collectionStore.createCollection(trimmed);
    selectedCollectionIds.value.push(created.id);
    newCollectionName.value = '';
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to create collection';
  } finally {
    isSubmitting.value = false;
  }
};

const handleSave = async (): Promise<void> => {
  if (!props.book) {
    return;
  }
  isSubmitting.value = true;
  try {
    await collectionStore.updateBookCollections(props.book.id, selectedCollectionIds.value);
    emit('saved');
    emit('close');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to assign collections';
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.isOpen"
      data-testid="collection-assign-modal"
      class="backdrop-blur-xs fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="emit('close')"
    >
      <div
        class="animate-in fade-in zoom-in-95 flex max-h-[90vh] w-full max-w-md transform flex-col overflow-hidden rounded-3xl border border-[#C8E695]/60 bg-[#F4ECD8] text-[#3E5725] shadow-2xl transition-all duration-200"
      >
        <div class="flex items-center justify-between border-b border-[#C8E695]/50 p-5">
          <div>
            <h3 class="text-lg font-bold text-[#3E5725]">
              {{ t('collections.manageCollections') }}
            </h3>
            <p
              v-if="props.book"
              class="max-w-[280px] truncate text-xs text-[#3E5725]/75"
            >
              {{ props.book.title }}
            </p>
          </div>
          <button
            type="button"
            data-testid="close-collection-assign-btn"
            class="rounded-xl p-2 text-[#3E5725]/70 transition-all hover:bg-[#C8E695]/30 hover:text-[#3E5725]"
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

        <div class="flex-1 space-y-4 overflow-y-auto p-5">
          <div
            v-if="errorMessage"
            class="rounded-xl border border-rose-200 bg-rose-100/90 p-3 text-xs font-semibold text-rose-700"
          >
            {{ errorMessage }}
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold uppercase tracking-wider text-[#3E5725]/80">
              {{ t('collections.selectCollections') }}
            </label>

            <div
              v-if="collectionStore.collections.length === 0"
              class="rounded-2xl border border-dashed border-[#C8E695] bg-white/60 p-6 text-center text-xs font-medium text-[#3E5725]/70"
            >
              {{ t('collections.noCollectionsYet') }}
            </div>

            <div
              v-else
              class="max-h-56 space-y-1.5 overflow-y-auto pr-1"
            >
              <label
                v-for="collection in collectionStore.collections"
                :key="collection.id"
                class="flex cursor-pointer items-center justify-between rounded-2xl border border-[#C8E695]/40 bg-white/80 p-3 transition-all hover:bg-white active:scale-[0.99]"
              >
                <div class="flex items-center gap-3">
                  <input
                    type="checkbox"
                    :value="collection.id"
                    :checked="selectedCollectionIds.includes(collection.id)"
                    class="h-4 w-4 rounded text-[#3E5725] accent-[#3E5725] focus:ring-[#C8E695]"
                    @change="toggleCollection(collection.id)"
                  />
                  <span class="text-sm font-semibold text-[#3E5725]">
                    {{ collection.name }}
                  </span>
                </div>
                <span
                  class="rounded-full bg-[#C8E695]/40 px-2 py-0.5 text-xs font-bold text-[#3E5725]"
                >
                  {{ collection.count }}
                </span>
              </label>
            </div>
          </div>

          <div class="border-t border-[#C8E695]/40 pt-2">
            <label class="mb-1.5 block text-xs font-bold text-[#3E5725]/80">
              {{ t('collections.createNew') }}
            </label>
            <div class="flex gap-2">
              <input
                v-model="newCollectionName"
                type="text"
                data-testid="new-collection-input"
                :placeholder="t('collections.newCollectionPlaceholder')"
                class="flex-1 rounded-xl border border-[#C8E695] bg-white/90 px-3.5 py-2 text-sm text-[#3E5725] placeholder:text-[#3E5725]/50 focus:outline-none focus:ring-2 focus:ring-[#3E5725]"
                @keyup.enter="handleCreateCollection"
              />
              <button
                type="button"
                data-testid="create-collection-submit-btn"
                :disabled="!newCollectionName.trim() || isSubmitting"
                class="shrink-0 rounded-xl bg-[#3E5725] px-4 py-2 text-xs font-bold text-white transition-all hover:bg-[#3E5725]/90 active:scale-95 disabled:opacity-40"
                @click="handleCreateCollection"
              >
                {{ t('collections.createBtn') }}
              </button>
            </div>
          </div>
        </div>

        <div
          class="flex items-center justify-end gap-3 border-t border-[#C8E695]/50 bg-white/40 p-4"
        >
          <button
            type="button"
            class="rounded-xl px-4 py-2.5 text-xs font-bold text-[#3E5725] transition-all hover:bg-white/70 active:scale-95"
            @click="emit('close')"
          >
            {{ t('collections.cancel') }}
          </button>
          <button
            type="button"
            data-testid="save-collection-assign-btn"
            :disabled="isSubmitting"
            class="rounded-xl bg-[#3E5725] px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-[#3E5725]/90 active:scale-95 disabled:opacity-50"
            @click="handleSave"
          >
            {{ t('collections.save') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
