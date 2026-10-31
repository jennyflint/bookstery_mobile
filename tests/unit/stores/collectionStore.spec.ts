import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCollectionStore } from '../../../app/stores/collectionStore';
import { SqliteService } from '../../../app/services/database/SqliteService';
import type { BookRecord } from '../../../app/types';

describe('useCollectionStore', () => {
  beforeEach(async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    const sqlite = SqliteService.getInstance();
    await sqlite.init();

    const book: BookRecord = {
      id: 'store-book-1',
      title: 'Store Test Book',
      author: 'Author',
      format: 'epub',
      file_path: 'path',
      cover_path: null,
      locator: '1',
      progress_percentage: 0,
      total_items: 100,
      last_read_at: 100,
      updated_at: 100,
    };
    await sqlite.upsertBook(book);
  });

  it('should initialize with empty collections and all filter', () => {
    const store = useCollectionStore();
    expect(store.collections).toEqual([]);
    expect(store.selectedCollectionId).toBe('all');
    expect(store.isLoading).toBe(false);
  });

  it('should create and fetch collections', async () => {
    const store = useCollectionStore();
    await store.createCollection('Non-Fiction');

    expect(store.collections).toHaveLength(1);
    expect(store.collections[0].name).toBe('Non-Fiction');
    expect(store.totalCollectionsCount).toBe(1);
  });

  it('should rename existing collection', async () => {
    const store = useCollectionStore();
    const created = await store.createCollection('Old Name');

    await store.renameCollection(created.id, 'New Name');
    expect(store.collections[0].name).toBe('New Name');
  });

  it('should delete collection and reset selectedCollectionId if active', async () => {
    const store = useCollectionStore();
    const created = await store.createCollection('To Delete');
    store.setSelectedCollection(created.id);
    expect(store.selectedCollectionId).toBe(created.id);

    await store.deleteCollection(created.id);
    expect(store.collections).toHaveLength(0);
    expect(store.selectedCollectionId).toBe('all');
  });

  it('should assign and remove books from collections', async () => {
    const store = useCollectionStore();
    const collection = await store.createCollection('Tagged');

    await store.updateBookCollections('store-book-1', [collection.id]);
    const bookCollections = await store.getBookCollectionIds('store-book-1');
    expect(bookCollections).toContain(collection.id);

    await store.removeBookFromCollection('store-book-1', collection.id);
    const updatedCollections = await store.getBookCollectionIds('store-book-1');
    expect(updatedCollections).not.toContain(collection.id);
  });
});
