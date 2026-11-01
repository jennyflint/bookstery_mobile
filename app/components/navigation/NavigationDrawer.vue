<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useCollectionStore } from '../../stores/collectionStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useCollectionNavigation } from '../../composables/useCollectionNavigation';
import type { CollectionFilter, CollectionWithCount } from '../../types';
import CollectionDeleteConfirmModal from '../library/CollectionDeleteConfirmModal.vue';

interface Props {
  readonly isOpen: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select-collection', collectionId: CollectionFilter): void;
}>();

const { t } = useI18n();
const collectionStore = useCollectionStore();
const libraryStore = useLibraryStore();
const { activeCollectionId, selectCollection } = useCollectionNavigation();

const isCollectionsOpen = ref(true);
const isCreating = ref(false);
const newCollectionName = ref('');
const editingCollectionId = ref<number | null>(null);
const editingCollectionName = ref('');
const errorMessage = ref('');

const collectionToDelete = ref<CollectionWithCount | null>(null);
const isDeleteModalOpen = ref(false);

onMounted(async () => {
  await collectionStore.fetchCollections();
});

const totalBooks = computed((): number => {
  return libraryStore.books.length;
});

const uncollectedCount = computed((): number => {
  const collectedTotal = collectionStore.collections.reduce((acc, c) => acc + c.count, 0);
  if (collectedTotal === 0) {
    return totalBooks.value;
  }
  return Math.max(
    0,
    totalBooks.value - collectionStore.collections.filter((c) => c.count > 0).length,
  );
});

const handleSelect = async (filter: CollectionFilter): Promise<void> => {
  await selectCollection(filter);
  emit('select-collection', filter);
  emit('close');
};

const handleStartCreate = (): void => {
  isCreating.value = true;
  newCollectionName.value = '';
  errorMessage.value = '';
};

const handleCancelCreate = (): void => {
  isCreating.value = false;
  newCollectionName.value = '';
  errorMessage.value = '';
};

const handleSaveCreate = async (): Promise<void> => {
  const trimmed = newCollectionName.value.trim();
  if (!trimmed) {
    return;
  }
  errorMessage.value = '';
  try {
    const created = await collectionStore.createCollection(trimmed);
    isCreating.value = false;
    newCollectionName.value = '';
    await handleSelect(created.id);
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Error creating collection';
  }
};

const handleStartRename = (collection: CollectionWithCount): void => {
  editingCollectionId.value = collection.id;
  editingCollectionName.value = collection.name;
  errorMessage.value = '';
};

const handleCancelRename = (): void => {
  editingCollectionId.value = null;
  editingCollectionName.value = '';
  errorMessage.value = '';
};

const handleSaveRename = async (id: number): Promise<void> => {
  const trimmed = editingCollectionName.value.trim();
  if (!trimmed) {
    return;
  }
  errorMessage.value = '';
  try {
    await collectionStore.renameCollection(id, trimmed);
    editingCollectionId.value = null;
    editingCollectionName.value = '';
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Error renaming collection';
  }
};

const handleOpenDelete = (collection: CollectionWithCount): void => {
  collectionToDelete.value = collection;
  isDeleteModalOpen.value = true;
};

const handleConfirmDelete = async (id: number): Promise<void> => {
  try {
    await collectionStore.deleteCollection(id);
    if (activeCollectionId.value === id) {
      await handleSelect('all');
    }
  } finally {
    isDeleteModalOpen.value = false;
    collectionToDelete.value = null;
  }
};
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.isOpen"
      data-testid="navigation-drawer-backdrop"
      class="fixed inset-0 z-50 bg-black/50 transition-opacity duration-300"
      @click="emit('close')"
    >
      <div
        data-testid="navigation-drawer"
        class="fixed inset-y-0 left-0 flex w-80 max-w-[85vw] select-none flex-col border-r border-gray-200 bg-white shadow-2xl transition-transform duration-300 ease-out"
        @click.stop
      >
        <div
          class="flex items-center justify-between border-b border-gray-200 bg-white p-4"
          :style="{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }"
        >
          <div class="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Bookstery"
              class="h-8 w-8 object-contain"
            />
            <div>
              <h2 class="text-sm font-black leading-none tracking-tight text-gray-900">
                {{ t('app.name') }}
              </h2>
              <p class="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                {{ t('collections.libraryCollections') }}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="close-drawer-btn"
            class="rounded-xl p-2 text-gray-500 transition-all hover:bg-gray-100 hover:text-gray-900"
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

        <div class="flex-1 space-y-4 overflow-y-auto p-3">
          <div
            v-if="errorMessage"
            class="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700"
          >
            {{ errorMessage }}
          </div>

          <button
            type="button"
            data-testid="collection-item-all"
            class="flex w-full items-center justify-between rounded-2xl border px-3.5 py-3 text-sm font-bold transition-all"
            :class="
              activeCollectionId === 'all'
                ? 'border-[#3E5725] bg-[#3E5725] text-white shadow-sm'
                : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50'
            "
            @click="handleSelect('all')"
          >
            <div class="flex items-center gap-3">
              <svg
                class="h-5 w-5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              <span>{{ t('collections.allBooks') }}</span>
            </div>
            <span
              class="rounded-full px-2 py-0.5 text-xs font-bold"
              :class="
                activeCollectionId === 'all'
                  ? 'bg-[#C8E695] text-[#3E5725]'
                  : 'bg-gray-100 text-gray-700'
              "
            >
              {{ totalBooks }}
            </span>
          </button>

          <NuxtLink
            to="/dictionary"
            data-testid="drawer-dictionary-link"
            class="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-3.5 py-3 text-sm font-bold text-gray-900 transition-all hover:bg-gray-50 active:scale-95"
            @click="emit('close')"
          >
            <div class="flex items-center gap-3">
              <svg class="h-5 w-5 shrink-0 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>{{ t('nav.dictionary') }}</span>
            </div>
            <span class="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-800">
              {{ t('ai.dictionaryTitle') }}
            </span>
          </NuxtLink>

          <div class="border-t border-gray-200 pt-2">
            <div class="mb-1 flex items-center justify-between px-2 py-1">
              <button
                type="button"
                data-testid="toggle-collections-section-btn"
                class="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-600 transition-colors hover:text-gray-900"
                @click="isCollectionsOpen = !isCollectionsOpen"
              >
                <svg
                  class="h-4 w-4 transition-transform duration-200"
                  :class="isCollectionsOpen ? 'rotate-90' : 'rotate-0'"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
                <span>{{ t('collections.collectionsTitle') }}</span>
              </button>

              <button
                type="button"
                data-testid="create-collection-btn"
                class="flex items-center gap-1 rounded-lg p-1 text-xs font-bold text-gray-700 transition-all hover:bg-gray-100"
                :title="t('collections.createCollection')"
                @click="handleStartCreate"
              >
                <svg
                  class="h-4 w-4"
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
              </button>
            </div>

            <div
              v-show="isCollectionsOpen"
              class="mt-2 space-y-1"
            >
              <div
                v-if="isCreating"
                class="space-y-2 rounded-2xl border border-gray-200 bg-gray-50 p-2.5 shadow-sm"
              >
                <input
                  v-model="newCollectionName"
                  type="text"
                  data-testid="inline-new-collection-input"
                  :placeholder="t('collections.newCollectionPlaceholder')"
                  class="w-full rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                  @keyup.enter="handleSaveCreate"
                  @keyup.esc="handleCancelCreate"
                />
                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    class="px-2.5 py-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
                    @click="handleCancelCreate"
                  >
                    {{ t('collections.cancel') }}
                  </button>
                  <button
                    type="button"
                    data-testid="submit-create-collection-btn"
                    :disabled="!newCollectionName.trim()"
                    class="rounded-lg bg-[#3E5725] px-3 py-1 text-xs font-bold text-white hover:bg-[#3E5725]/90 disabled:opacity-40"
                    @click="handleSaveCreate"
                  >
                    {{ t('collections.create') }}
                  </button>
                </div>
              </div>

              <div
                v-for="collection in collectionStore.collections"
                :key="collection.id"
                :data-testid="`collection-item-${collection.id}`"
                class="group flex items-center justify-between rounded-2xl border px-3 py-2.5 text-sm font-bold transition-all"
                :class="
                  activeCollectionId === collection.id
                    ? 'border-[#3E5725] bg-[#3E5725] text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50'
                "
              >
                <div
                  v-if="editingCollectionId === collection.id"
                  class="flex w-full items-center gap-1.5"
                >
                  <input
                    v-model="editingCollectionName"
                    type="text"
                    :data-testid="`input-rename-collection-${collection.id}`"
                    class="flex-1 rounded-lg border border-gray-400 bg-white px-2 py-1 text-xs text-gray-900 focus:outline-none"
                    @keyup.enter="handleSaveRename(collection.id)"
                    @keyup.esc="handleCancelRename"
                  />
                  <button
                    type="button"
                    :data-testid="`save-rename-collection-${collection.id}`"
                    class="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100"
                    @click="handleSaveRename(collection.id)"
                  >
                    <svg
                      class="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100"
                    @click="handleCancelRename"
                  >
                    <svg
                      class="h-4 w-4"
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

                <template v-else>
                  <button
                    type="button"
                    class="flex flex-1 items-center gap-2.5 truncate text-left"
                    @click="handleSelect(collection.id)"
                  >
                    <svg
                      class="h-4 w-4 shrink-0"
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
                    <span class="truncate">{{ collection.name }}</span>
                  </button>

                  <div class="ml-2 flex shrink-0 items-center gap-1">
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-bold"
                      :class="
                        activeCollectionId === collection.id
                          ? 'bg-[#C8E695] text-[#3E5725]'
                          : 'bg-gray-100 text-gray-700'
                      "
                    >
                      {{ collection.count }}
                    </span>

                    <button
                      type="button"
                      :data-testid="`rename-collection-btn-${collection.id}`"
                      class="rounded-md p-1 opacity-60 transition-opacity hover:opacity-100"
                      :class="
                        activeCollectionId === collection.id
                          ? 'text-white hover:bg-white/20'
                          : 'text-gray-600 hover:bg-gray-100'
                      "
                      :title="t('collections.renameCollection')"
                      @click.stop="handleStartRename(collection)"
                    >
                      <svg
                        class="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>

                    <button
                      type="button"
                      :data-testid="`delete-collection-btn-${collection.id}`"
                      class="rounded-md p-1 text-rose-600 opacity-60 transition-opacity hover:bg-rose-50 hover:opacity-100"
                      :title="t('collections.deleteCollection')"
                      @click.stop="handleOpenDelete(collection)"
                    >
                      <svg
                        class="h-3.5 w-3.5"
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
                    </button>
                  </div>
                </template>
              </div>

              <button
                type="button"
                data-testid="collection-item-uncollected"
                class="flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-sm font-bold transition-all"
                :class="
                  activeCollectionId === 'uncollected'
                    ? 'border-[#3E5725] bg-[#3E5725] text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50'
                "
                @click="handleSelect('uncollected')"
              >
                <div class="flex items-center gap-2.5 truncate">
                  <svg
                    class="h-4 w-4 shrink-0 text-amber-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                    />
                  </svg>
                  <span class="truncate">{{ t('collections.uncollected') }}</span>
                </div>
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-bold"
                  :class="
                    activeCollectionId === 'uncollected'
                      ? 'bg-[#C8E695] text-[#3E5725]'
                      : 'bg-gray-100 text-gray-700'
                  "
                >
                  {{ uncollectedCount }}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <CollectionDeleteConfirmModal
      :is-open="isDeleteModalOpen"
      :collection="collectionToDelete"
      @close="isDeleteModalOpen = false"
      @confirm="handleConfirmDelete"
    />
  </Teleport>
</template>
