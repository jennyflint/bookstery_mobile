import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFolderStore } from '../stores/folderStore';
import type { FolderFilter } from '../types';

export function useFolderNavigation() {
  const route = useRoute();
  const router = useRouter();
  const folderStore = useFolderStore();

  const parseFolderQuery = (queryValue: unknown): FolderFilter => {
    if (!queryValue || queryValue === 'all') {
      return 'all';
    }
    if (queryValue === 'uncategorized') {
      return 'uncategorized';
    }
    const num = Number(queryValue);
    if (!Number.isNaN(num) && num > 0) {
      return num;
    }
    return 'all';
  };

  const syncFolderFromRoute = (): void => {
    const parsed = parseFolderQuery(route.query.folder);
    if (folderStore.selectedFolderId !== parsed) {
      folderStore.setSelectedFolder(parsed);
    }
  };

  watch(
    () => route.query.folder,
    () => {
      syncFolderFromRoute();
    },
    { immediate: true },
  );

  const activeFolderId = computed((): FolderFilter => {
    return folderStore.selectedFolderId;
  });

  const activeFolder = computed(() => {
    if (typeof activeFolderId.value !== 'number') {
      return null;
    }
    return folderStore.folders.find((f) => f.id === activeFolderId.value) || null;
  });

  const activeFolderName = computed((): string => {
    if (activeFolderId.value === 'all') {
      return 'All Books';
    }
    if (activeFolderId.value === 'uncategorized') {
      return 'Uncategorized';
    }
    return activeFolder.value ? activeFolder.value.name : 'All Books';
  });

  const selectFolder = async (folderId: FolderFilter): Promise<void> => {
    folderStore.setSelectedFolder(folderId);

    const query = { ...route.query };
    if (folderId === 'all') {
      delete query.folder;
    } else {
      query.folder = String(folderId);
    }

    const targetPath = route.path.startsWith('/reader') ? '/' : route.path;
    await router.push({ path: targetPath, query });
  };

  return {
    activeFolderId,
    activeFolder,
    activeFolderName,
    selectFolder,
    syncFolderFromRoute,
  };
}
