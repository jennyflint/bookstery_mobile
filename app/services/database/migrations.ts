export const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  format TEXT NOT NULL CHECK (format IN ('pdf', 'epub', 'fb2')),
  file_path TEXT NOT NULL,
  cover_path TEXT,
  locator TEXT NOT NULL,
  progress_percentage REAL NOT NULL DEFAULT 0.0,
  total_items INTEGER NOT NULL DEFAULT 0,
  last_read_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  pinned_at INTEGER DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id TEXT NOT NULL,
  locator TEXT NOT NULL,
  progress_percentage REAL NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'synced', 'failed'))
);

CREATE TABLE IF NOT EXISTS dictionary_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id TEXT,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_session (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  email TEXT,
  display_name TEXT,
  last_sync_at INTEGER,
  drive_folder_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_books_updated_at ON books(updated_at);
CREATE INDEX IF NOT EXISTS idx_books_pinned ON books(is_pinned DESC, pinned_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_dictionary_created ON dictionary_history(created_at);

CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS book_folder (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, folder_id)
);

CREATE INDEX IF NOT EXISTS idx_book_folder_book ON book_folder(book_id);
CREATE INDEX IF NOT EXISTS idx_book_folder_folder ON book_folder(folder_id);
`;

export const MIGRATION_ADD_PINNED_COLUMNS = [
  'ALTER TABLE books ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1));',
  'ALTER TABLE books ADD COLUMN pinned_at INTEGER DEFAULT NULL;',
  'CREATE INDEX IF NOT EXISTS idx_books_pinned ON books(is_pinned DESC, pinned_at DESC);',
];
