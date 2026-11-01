export type BookSortField =
  | 'lastReadAt'
  | 'createdAt'
  | 'title'
  | 'author'
  | 'format'
  | 'progress'
  | 'fileSize';

export type SortOrder = 'asc' | 'desc';

export interface BookSortOption {
  field: BookSortField;
  labelKey: string;
}
