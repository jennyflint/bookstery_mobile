import type { BookRecord } from './index';

export interface Collection {
  id: number;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface CollectionWithCount extends Collection {
  count: number;
  book_count: number;
}

export interface BookCollection {
  book_id: string;
  collection_id: number;
}

export type Book = BookRecord;

export type CollectionFilter = number | 'all' | 'uncollected';
