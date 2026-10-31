import type { BookRecord } from './index';

export interface Folder {
  id: number;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface FolderWithCount extends Folder {
  count: number;
  book_count: number;
}

export interface BookFolder {
  book_id: string;
  folder_id: number;
}

export type Book = BookRecord;

export type FolderFilter = number | 'all' | 'uncategorized';
