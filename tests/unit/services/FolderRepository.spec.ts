import { describe, it, expect, beforeEach } from 'vitest';
import { FolderRepository } from '../../../app/services/database/FolderRepository';
import { SqliteService } from '../../../app/services/database/SqliteService';
import type { BookRecord } from '../../../app/types';

describe('FolderRepository', () => {
  let repository: FolderRepository;
  let sqliteService: SqliteService;

  const sampleBook1: BookRecord = {
    id: 'book-1',
    title: 'Kobzar',
    author: 'Taras Shevchenko',
    format: 'epub',
    file_path: 'books/kobzar.epub',
    cover_path: null,
    locator: '1',
    progress_percentage: 20,
    total_items: 100,
    last_read_at: 1000,
    updated_at: 1000,
  };

  const sampleBook2: BookRecord = {
    id: 'book-2',
    title: 'Eneida',
    author: 'Ivan Kotliarevsky',
    format: 'pdf',
    file_path: 'books/eneida.pdf',
    cover_path: null,
    locator: '1',
    progress_percentage: 50,
    total_items: 200,
    last_read_at: 2000,
    updated_at: 2000,
  };

  const sampleBook3: BookRecord = {
    id: 'book-3',
    title: 'Shadows of Forgotten Ancestors',
    author: 'Mykhailo Kotsiubynsky',
    format: 'fb2',
    file_path: 'books/shadows.fb2',
    cover_path: null,
    locator: '1',
    progress_percentage: 0,
    total_items: 150,
    last_read_at: 3000,
    updated_at: 3000,
  };

  beforeEach(async () => {
    localStorage.clear();
    sqliteService = SqliteService.getInstance();
    await sqliteService.init();
    repository = new FolderRepository(sqliteService);

    await sqliteService.upsertBook(sampleBook1);
    await sqliteService.upsertBook(sampleBook2);
    await sqliteService.upsertBook(sampleBook3);
  });

  it('should support many-to-many association allowing one book in 3 folders', async () => {
    const folderSciFi = await repository.createFolder('Sci-Fi');
    const folderClassics = await repository.createFolder('Classics');
    const folderFavorites = await repository.createFolder('Favorites');

    await repository.assignBookToFolders('book-1', [
      folderSciFi.id,
      folderClassics.id,
      folderFavorites.id,
    ]);

    const assignedFolderIds = await repository.getBookFolderIds('book-1');
    expect(assignedFolderIds).toHaveLength(3);
    expect(assignedFolderIds).toContain(folderSciFi.id);
    expect(assignedFolderIds).toContain(folderClassics.id);
    expect(assignedFolderIds).toContain(folderFavorites.id);

    const sciFiBooks = await repository.getBooksByFolder(folderSciFi.id);
    expect(sciFiBooks).toHaveLength(1);
    expect(sciFiBooks[0].id).toBe('book-1');

    const classicsBooks = await repository.getBooksByFolder(folderClassics.id);
    expect(classicsBooks).toHaveLength(1);
    expect(classicsBooks[0].id).toBe('book-1');

    const favoritesBooks = await repository.getBooksByFolder(folderFavorites.id);
    expect(favoritesBooks).toHaveLength(1);
    expect(favoritesBooks[0].id).toBe('book-1');
  });

  it('should safely delete a folder while keeping books completely intact in books table', async () => {
    const folderToKeep = await repository.createFolder('Ukrainian Literature');
    const folderToDelete = await repository.createFolder('Temporary Folder');

    await repository.assignBookToFolders('book-1', [folderToKeep.id, folderToDelete.id]);
    await repository.assignBookToFolders('book-2', [folderToDelete.id]);

    const booksBeforeDelete = await sqliteService.getAllBooks();
    expect(booksBeforeDelete).toHaveLength(3);

    await repository.deleteFolder(folderToDelete.id);

    const booksAfterDelete = await sqliteService.getAllBooks();
    expect(booksAfterDelete).toHaveLength(3);
    expect(booksAfterDelete.map((b) => b.id)).toEqual(
      expect.arrayContaining(['book-1', 'book-2', 'book-3']),
    );

    const book1Folders = await repository.getBookFolderIds('book-1');
    expect(book1Folders).toEqual([folderToKeep.id]);

    const book2Folders = await repository.getBookFolderIds('book-2');
    expect(book2Folders).toHaveLength(0);

    const foldersList = await repository.getAllFoldersWithCounts();
    expect(foldersList).toHaveLength(1);
    expect(foldersList[0].id).toBe(folderToKeep.id);
  });

  it('should accurately calculate book counts per folder and query uncategorized books', async () => {
    const folderA = await repository.createFolder('Folder Alpha');
    const folderB = await repository.createFolder('Folder Beta');
    const folderC = await repository.createFolder('Folder Gamma');

    await repository.assignBookToFolders('book-1', [folderA.id, folderB.id]);
    await repository.assignBookToFolders('book-2', [folderA.id]);

    const foldersWithCounts = await repository.getAllFoldersWithCounts();
    const countA = foldersWithCounts.find((f) => f.id === folderA.id);
    const countB = foldersWithCounts.find((f) => f.id === folderB.id);
    const countC = foldersWithCounts.find((f) => f.id === folderC.id);

    expect(countA?.count).toBe(2);
    expect(countA?.book_count).toBe(2);

    expect(countB?.count).toBe(1);
    expect(countB?.book_count).toBe(1);

    expect(countC?.count).toBe(0);
    expect(countC?.book_count).toBe(0);

    const uncategorizedBooks = await repository.getBooksByFolder(null);
    expect(uncategorizedBooks).toHaveLength(1);
    expect(uncategorizedBooks[0].id).toBe('book-3');
  });

  it('should prevent creating duplicate folder names and reject empty names', async () => {
    await repository.createFolder('Poetry');

    await expect(repository.createFolder('Poetry')).rejects.toThrow(
      'Folder with this name already exists',
    );
    await expect(repository.createFolder('  poetry  ')).rejects.toThrow(
      'Folder with this name already exists',
    );
    await expect(repository.createFolder('   ')).rejects.toThrow('Folder name cannot be empty');
  });

  it('should rename a folder and update updated_at timestamp', async () => {
    const folder = await repository.createFolder('Historical');
    await repository.renameFolder(folder.id, 'Historical Fiction');

    const folders = await repository.getAllFoldersWithCounts();
    const renamed = folders.find((f) => f.id === folder.id);
    expect(renamed?.name).toBe('Historical Fiction');
  });
});
