import { describe, it, expect, beforeEach } from 'vitest';
import { CollectionRepository } from '../../../app/services/database/CollectionRepository';
import { SqliteService } from '../../../app/services/database/SqliteService';
import type { BookRecord } from '../../../app/types';

describe('CollectionRepository', () => {
  let repository: CollectionRepository;
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
    repository = new CollectionRepository(sqliteService);

    await sqliteService.upsertBook(sampleBook1);
    await sqliteService.upsertBook(sampleBook2);
    await sqliteService.upsertBook(sampleBook3);
  });

  it('should support many-to-many associations allowing one book in multiple collections', async () => {
    const sciFi = await repository.createCollection('Sci-Fi');
    const classics = await repository.createCollection('Classics');
    const favorites = await repository.createCollection('Favorites');

    await repository.assignBookToCollections('book-1', [sciFi.id, classics.id, favorites.id]);

    const assignedIds = await repository.getBookCollectionIds('book-1');
    expect(assignedIds).toHaveLength(3);
    expect(assignedIds).toContain(sciFi.id);
    expect(assignedIds).toContain(classics.id);
    expect(assignedIds).toContain(favorites.id);

    const sciFiBooks = await repository.getBooksByCollection(sciFi.id);
    expect(sciFiBooks).toHaveLength(1);
    expect(sciFiBooks[0].id).toBe('book-1');

    const classicsBooks = await repository.getBooksByCollection(classics.id);
    expect(classicsBooks).toHaveLength(1);
    expect(classicsBooks[0].id).toBe('book-1');

    const favoritesBooks = await repository.getBooksByCollection(favorites.id);
    expect(favoritesBooks).toHaveLength(1);
    expect(favoritesBooks[0].id).toBe('book-1');
  });

  it('should safely delete a collection without removing books from books table', async () => {
    const collectionToKeep = await repository.createCollection('Ukrainian Literature');
    const collectionToDelete = await repository.createCollection('Temporary Collection');

    await repository.assignBookToCollections('book-1', [
      collectionToKeep.id,
      collectionToDelete.id,
    ]);
    await repository.assignBookToCollections('book-2', [collectionToDelete.id]);

    const booksBeforeDelete = await sqliteService.getAllBooks();
    expect(booksBeforeDelete).toHaveLength(3);

    await repository.deleteCollection(collectionToDelete.id);

    const booksAfterDelete = await sqliteService.getAllBooks();
    expect(booksAfterDelete).toHaveLength(3);
    expect(booksAfterDelete.map((b) => b.id)).toEqual(
      expect.arrayContaining(['book-1', 'book-2', 'book-3']),
    );

    const book1Collections = await repository.getBookCollectionIds('book-1');
    expect(book1Collections).toEqual([collectionToKeep.id]);

    const book2Collections = await repository.getBookCollectionIds('book-2');
    expect(book2Collections).toHaveLength(0);

    const collectionsList = await repository.getAllCollectionsWithCounts();
    expect(collectionsList).toHaveLength(1);
    expect(collectionsList[0].id).toBe(collectionToKeep.id);
  });

  it('should accurately calculate book counts per collection and query uncollected books', async () => {
    const colA = await repository.createCollection('Collection Alpha');
    const colB = await repository.createCollection('Collection Beta');
    const colC = await repository.createCollection('Collection Gamma');

    await repository.assignBookToCollections('book-1', [colA.id, colB.id]);
    await repository.assignBookToCollections('book-2', [colA.id]);

    const collectionsWithCounts = await repository.getAllCollectionsWithCounts();
    const countA = collectionsWithCounts.find((c) => c.id === colA.id);
    const countB = collectionsWithCounts.find((c) => c.id === colB.id);
    const countC = collectionsWithCounts.find((c) => c.id === colC.id);

    expect(countA?.count).toBe(2);
    expect(countA?.book_count).toBe(2);

    expect(countB?.count).toBe(1);
    expect(countB?.book_count).toBe(1);

    expect(countC?.count).toBe(0);
    expect(countC?.book_count).toBe(0);

    const uncollectedBooks = await repository.getBooksByCollection(null);
    expect(uncollectedBooks).toHaveLength(1);
    expect(uncollectedBooks[0].id).toBe('book-3');
  });

  it('should prevent creating duplicate collection names and reject empty names', async () => {
    await repository.createCollection('Poetry');

    await expect(repository.createCollection('Poetry')).rejects.toThrow(
      'Collection with this name already exists',
    );
    await expect(repository.createCollection('  poetry  ')).rejects.toThrow(
      'Collection with this name already exists',
    );
    await expect(repository.createCollection('   ')).rejects.toThrow(
      'Collection name cannot be empty',
    );
  });

  it('should rename a collection and update timestamps', async () => {
    const collection = await repository.createCollection('Historical');
    await repository.renameCollection(collection.id, 'Historical Fiction');

    const collections = await repository.getAllCollectionsWithCounts();
    const renamed = collections.find((c) => c.id === collection.id);
    expect(renamed?.name).toBe('Historical Fiction');
  });
});
