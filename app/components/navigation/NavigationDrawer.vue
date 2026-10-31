<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useFolderStore } from '../../stores/folderStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useFolderNavigation } from '../../composables/useFolderNavigation';
import type { FolderFilter, FolderWithCount } from '../../types';
import FolderDeleteConfirmModal from '../library/FolderDeleteConfirmModal.vue';

interface Props {
  readonly isOpen: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select-folder', folderId: FolderFilter): void;
}>();

const { t } = useI18n();
const folderStore = useFolderStore();
const libraryStore = useLibraryStore();
const { activeFolderId, selectFolder } = useFolderNavigation();

const isFoldersOpen = ref(true);
const isCreating = ref(false);
const newFolderName = ref('');
const editingFolderId = ref<number | null>(null);
const editingFolderName = ref('');
const errorMessage = ref('');

const folderToDelete = ref<FolderWithCount | null>(null);
const isDeleteModalOpen = ref(false);

onMounted(async () => {
  await folderStore.fetchFolders();
});

const totalBooks = computed((): number => {
  return libraryStore.books.length;
});

const uncategorizedCount = computed((): number => {
  const categorizedTotal = folderStore.folders.reduce((acc, f) => acc + f.count, 0);
  if (categorizedTotal === 0) {
    return totalBooks.value;
  }
  return Math.max(0, totalBooks.value - folderStore.folders.filter((f) => f.count > 0).length);
});

const handleSelect = async (filter: FolderFilter): Promise<void> => {
  await selectFolder(filter);
  emit('select-folder', filter);
  emit('close');
};

const handleStartCreate = (): void => {
  isCreating.value = true;
  newFolderName.value = '';
  errorMessage.value = '';
};

const handleCancelCreate = (): void => {
  isCreating.value = false;
  newFolderName.value = '';
  errorMessage.value = '';
};

const handleSaveCreate = async (): Promise<void> => {
  const trimmed = newFolderName.value.trim();
  if (!trimmed) {
    return;
  }
  errorMessage.value = '';
  try {
    const created = await folderStore.createFolder(trimmed);
    isCreating.value = false;
    newFolderName.value = '';
    await handleSelect(created.id);
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Error creating folder';
  }
};

const handleStartRename = (folder: FolderWithCount): void => {
  editingFolderId.value = folder.id;
  editingFolderName.value = folder.name;
  errorMessage.value = '';
};

const handleCancelRename = (): void => {
  editingFolderId.value = null;
  editingFolderName.value = '';
  errorMessage.value = '';
};

const handleSaveRename = async (id: number): Promise<void> => {
  const trimmed = editingFolderName.value.trim();
  if (!trimmed) {
    return;
  }
  errorMessage.value = '';
  try {
    await folderStore.renameFolder(id, trimmed);
    editingFolderId.value = null;
    editingFolderName.value = '';
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Error renaming folder';
  }
};

const handleOpenDelete = (folder: FolderWithCount): void => {
  folderToDelete.value = folder;
  isDeleteModalOpen.value = true;
};

const handleConfirmDelete = async (id: number): Promise<void> => {
  try {
    await folderStore.deleteFolder(id);
    if (activeFolderId.value === id) {
      await handleSelect('all');
    }
  } finally {
    isDeleteModalOpen.value = false;
    folderToDelete.value = null;
  }
};
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.isOpen"
      data-testid="navigation-drawer-backdrop"
      class="backdrop-blur-xs fixed inset-0 z-50 bg-black/60 transition-opacity duration-300"
      @click="emit('close')"
    >
      <div
        data-testid="navigation-drawer"
        class="fixed inset-y-0 left-0 flex w-80 max-w-[85vw] transform select-none flex-col border-r border-[#C8E695]/70 bg-[#F4ECD8] shadow-2xl transition-transform duration-300 ease-out"
        @click.stop
      >
        <div
          class="flex items-center justify-between border-b border-[#C8E695]/60 bg-white/40 p-4"
          :style="{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }"
        >
          <div class="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Bookstery"
              class="h-8 w-8 object-contain"
            />
            <div>
              <h2 class="text-sm font-black leading-none tracking-tight text-[#3E5725]">
                {{ t('app.name') }}
              </h2>
              <p class="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[#3E5725]/70">
                {{ t('folders.libraryCollections') }}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="close-drawer-btn"
            class="rounded-xl p-2 text-[#3E5725]/70 transition-all hover:bg-[#C8E695]/40 hover:text-[#3E5725]"
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
            class="rounded-2xl border border-rose-200 bg-rose-100 p-3 text-xs font-semibold text-rose-700"
          >
            {{ errorMessage }}
          </div>

          <button
            type="button"
            data-testid="folder-item-all"
            class="flex w-full items-center justify-between rounded-2xl border px-3.5 py-3 text-sm font-bold transition-all"
            :class="
              activeFolderId === 'all'
                ? 'border-[#3E5725] bg-[#3E5725] text-white shadow-sm'
                : 'border-[#C8E695]/40 bg-white/70 text-[#3E5725] hover:bg-white'
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
              <span>{{ t('folders.allBooks') }}</span>
            </div>
            <span
              class="rounded-full px-2 py-0.5 text-xs font-bold"
              :class="
                activeFolderId === 'all'
                  ? 'bg-[#C8E695] text-[#3E5725]'
                  : 'bg-[#C8E695]/40 text-[#3E5725]'
              "
            >
              {{ totalBooks }}
            </span>
          </button>

          <div class="border-t border-[#C8E695]/40 pt-2">
            <div class="mb-1 flex items-center justify-between px-2 py-1">
              <button
                type="button"
                data-testid="toggle-folders-section-btn"
                class="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#3E5725]/80 transition-colors hover:text-[#3E5725]"
                @click="isFoldersOpen = !isFoldersOpen"
              >
                <svg
                  class="h-4 w-4 transition-transform duration-200"
                  :class="isFoldersOpen ? 'rotate-90' : 'rotate-0'"
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
                <span>{{ t('folders.collectionsTitle') }}</span>
              </button>

              <button
                type="button"
                data-testid="create-folder-btn"
                class="flex items-center gap-1 rounded-lg p-1 text-xs font-bold text-[#3E5725] transition-all hover:bg-[#C8E695]/50"
                :title="t('folders.createFolder')"
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
              v-show="isFoldersOpen"
              class="mt-2 space-y-1"
            >
              <div
                v-if="isCreating"
                class="shadow-xs space-y-2 rounded-2xl border border-[#C8E695] bg-white p-2.5"
              >
                <input
                  v-model="newFolderName"
                  type="text"
                  data-testid="inline-new-folder-input"
                  :placeholder="t('folders.newFolderPlaceholder')"
                  class="w-full rounded-xl border border-[#C8E695] bg-[#F4ECD8]/50 px-3 py-1.5 text-xs text-[#3E5725] placeholder:text-[#3E5725]/50 focus:outline-none focus:ring-1 focus:ring-[#3E5725]"
                  @keyup.enter="handleSaveCreate"
                  @keyup.esc="handleCancelCreate"
                />
                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    class="px-2.5 py-1 text-xs font-semibold text-[#3E5725]/70 hover:text-[#3E5725]"
                    @click="handleCancelCreate"
                  >
                    {{ t('folders.cancel') }}
                  </button>
                  <button
                    type="button"
                    data-testid="submit-create-folder-btn"
                    :disabled="!newFolderName.trim()"
                    class="rounded-lg bg-[#3E5725] px-3 py-1 text-xs font-bold text-white hover:bg-[#3E5725]/90 disabled:opacity-40"
                    @click="handleSaveCreate"
                  >
                    {{ t('folders.create') }}
                  </button>
                </div>
              </div>

              <div
                v-for="folder in folderStore.folders"
                :key="folder.id"
                :data-testid="`folder-item-${folder.id}`"
                class="group flex items-center justify-between rounded-2xl border px-3 py-2.5 text-sm font-bold transition-all"
                :class="
                  activeFolderId === folder.id
                    ? 'border-[#3E5725] bg-[#3E5725] text-white shadow-sm'
                    : 'border-[#C8E695]/30 bg-white/60 text-[#3E5725] hover:bg-white'
                "
              >
                <div
                  v-if="editingFolderId === folder.id"
                  class="flex w-full items-center gap-1.5"
                >
                  <input
                    v-model="editingFolderName"
                    type="text"
                    :data-testid="`input-rename-folder-${folder.id}`"
                    class="flex-1 rounded-lg border border-[#3E5725] bg-white px-2 py-1 text-xs text-[#3E5725] focus:outline-none"
                    @keyup.enter="handleSaveRename(folder.id)"
                    @keyup.esc="handleCancelRename"
                  />
                  <button
                    type="button"
                    :data-testid="`save-rename-folder-${folder.id}`"
                    class="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100"
                    @click="handleSaveRename(folder.id)"
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
                    @click="handleSelect(folder.id)"
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
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                    <span class="truncate">{{ folder.name }}</span>
                  </button>

                  <div class="ml-2 flex shrink-0 items-center gap-1">
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-bold"
                      :class="
                        activeFolderId === folder.id
                          ? 'bg-[#C8E695] text-[#3E5725]'
                          : 'bg-[#C8E695]/40 text-[#3E5725]'
                      "
                    >
                      {{ folder.count }}
                    </span>

                    <button
                      type="button"
                      :data-testid="`rename-folder-btn-${folder.id}`"
                      class="rounded-md p-1 opacity-60 transition-opacity hover:opacity-100"
                      :class="
                        activeFolderId === folder.id
                          ? 'text-white hover:bg-white/20'
                          : 'text-[#3E5725] hover:bg-[#C8E695]/40'
                      "
                      :title="t('folders.renameFolder')"
                      @click.stop="handleStartRename(folder)"
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
                      :data-testid="`delete-folder-btn-${folder.id}`"
                      class="rounded-md p-1 text-rose-600 opacity-60 transition-opacity hover:bg-rose-100 hover:opacity-100"
                      :title="t('folders.deleteFolder')"
                      @click.stop="handleOpenDelete(folder)"
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
                data-testid="folder-item-uncategorized"
                class="flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-sm font-bold transition-all"
                :class="
                  activeFolderId === 'uncategorized'
                    ? 'border-[#3E5725] bg-[#3E5725] text-white shadow-sm'
                    : 'border-[#C8E695]/30 bg-white/60 text-[#3E5725] hover:bg-white'
                "
                @click="handleSelect('uncategorized')"
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
                  <span class="truncate">{{ t('folders.uncategorized') }}</span>
                </div>
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-bold"
                  :class="
                    activeFolderId === 'uncategorized'
                      ? 'bg-[#C8E695] text-[#3E5725]'
                      : 'bg-[#C8E695]/40 text-[#3E5725]'
                  "
                >
                  {{ uncategorizedCount }}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <FolderDeleteConfirmModal
      :is-open="isDeleteModalOpen"
      :folder="folderToDelete"
      @close="isDeleteModalOpen = false"
      @confirm="handleConfirmDelete"
    />
  </Teleport>
</template>
