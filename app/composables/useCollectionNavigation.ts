import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCollectionStore } from '../stores/collectionStore';
import type { CollectionFilter } from '../types';

export function useCollectionNavigation() {
  const route = useRoute();
  const router = useRouter();
  const collectionStore = useCollectionStore();

  const parseCollectionQuery = (queryValue: unknown): CollectionFilter => {
    if (!queryValue || queryValue === 'all') {
      return 'all';
    }
    if (queryValue === 'uncollected') {
      return 'uncollected';
    }
    const num = Number(queryValue);
    if (!Number.isNaN(num) && num > 0) {
      return num;
    }
    return 'all';
  };

  const syncCollectionFromRoute = (): void => {
    const parsed = parseCollectionQuery(route.query.collection);
    if (collectionStore.selectedCollectionId !== parsed) {
      collectionStore.setSelectedCollection(parsed);
    }
  };

  watch(
    () => route.query.collection,
    () => {
      syncCollectionFromRoute();
    },
    { immediate: true },
  );

  const activeCollectionId = computed((): CollectionFilter => {
    return collectionStore.selectedCollectionId;
  });

  const activeCollection = computed(() => {
    if (typeof activeCollectionId.value !== 'number') {
      return null;
    }
    return collectionStore.collections.find((c) => c.id === activeCollectionId.value) || null;
  });

  const activeCollectionName = computed((): string => {
    if (activeCollectionId.value === 'all') {
      return 'All Books';
    }
    if (activeCollectionId.value === 'uncollected') {
      return 'Uncollected';
    }
    return activeCollection.value ? activeCollection.value.name : 'All Books';
  });

  const selectCollection = async (collectionId: CollectionFilter): Promise<void> => {
    collectionStore.setSelectedCollection(collectionId);

    const query = { ...route.query };
    if (collectionId === 'all') {
      delete query.collection;
    } else {
      query.collection = String(collectionId);
    }

    const targetPath = route.path.startsWith('/reader') ? '/' : route.path;
    await router.push({ path: targetPath, query });
  };

  return {
    activeCollectionId,
    activeCollection,
    activeCollectionName,
    selectCollection,
    syncCollectionFromRoute,
  };
}
