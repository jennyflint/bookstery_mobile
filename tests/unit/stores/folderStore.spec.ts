import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useFolderStore } from '../../../app/stores/folderStore';
import { SqliteService } from '../../../app/services/database/SqliteService';
import type { BookRecord } from '../../../app/types';

describe('useFolderStore', () => {
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

  it('should initialize with empty folders and all filter', () => {
    const store = useFolderStore();
    expect(store.folders).toEqual([]);
    expect(store.selectedFolderId).toBe('all');
    expect(store.isLoading).toBe(false);
  });

  it('should create and fetch folders', async () => {
    const store = useFolderStore();
    await store.createFolder('Non-Fiction');

    expect(store.folders).toHaveLength(1);
    expect(store.folders[0].name).toBe('Non-Fiction');
    expect(store.totalFoldersCount).toBe(1);
  });

  it('should rename existing folder', async () => {
    const store = useFolderStore();
    const created = await store.createFolder('Old Name');

    await store.renameFolder(created.id, 'New Name');
    expect(store.folders[0].name).toBe('New Name');
  });

  it('should delete folder and reset selectedFolderId if active', async () => {
    const store = useFolderStore();
    const created = await store.createFolder('To Delete');
    store.setSelectedFolder(created.id);
    expect(store.selectedFolderId).toBe(created.id);

    await store.deleteFolder(created.id);
    expect(store.folders).toHaveLength(0);
    expect(store.selectedFolderId).toBe('all');
  });

  it('should assign and remove books from folders', async () => {
    const store = useFolderStore();
    const folder = await store.createFolder('Tagged');

    await store.updateBookFolders('store-book-1', [folder.id]);
    const bookFolders = await store.getBookFolderIds('store-book-1');
    expect(bookFolders).toContain(folder.id);

    await store.removeBookFromFolder('store-book-1', folder.id);
    const updatedFolders = await store.getBookFolderIds('store-book-1');
    expect(updatedFolders).not.toContain(folder.id);
  });
});
