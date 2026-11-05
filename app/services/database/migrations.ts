export const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  format TEXT NOT NULL CHECK (format IN ('pdf', 'epub', 'fb2', 'mobi', 'djvu')),
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

CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS book_collection (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, collection_id)
);

CREATE INDEX IF NOT EXISTS idx_book_collection_book ON book_collection(book_id);
CREATE INDEX IF NOT EXISTS idx_book_collection_collection ON book_collection(collection_id);

CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('pdf', 'epub', 'fb2', 'mobi', 'djvu')),
  locator TEXT NOT NULL,
  selected_text TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color IN ('yellow', 'green', 'pink', 'blue', 'purple')),
  note TEXT DEFAULT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_highlights_book ON highlights(book_id, created_at DESC);
`;

export const SCHEMA_HIGHLIGHTS = `
CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('pdf', 'epub', 'fb2', 'mobi', 'djvu')),
  locator TEXT NOT NULL,
  selected_text TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color IN ('yellow', 'green', 'pink', 'blue', 'purple')),
  note TEXT DEFAULT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_highlights_book ON highlights(book_id, created_at DESC);
`;

export const MIGRATION_ADD_PINNED_COLUMNS = [
  'ALTER TABLE books ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1));',
  'ALTER TABLE books ADD COLUMN pinned_at INTEGER DEFAULT NULL;',
  'CREATE INDEX IF NOT EXISTS idx_books_pinned ON books(is_pinned DESC, pinned_at DESC);',
];

export const SCHEMA_SCAN_DIRECTORIES = `
CREATE TABLE IF NOT EXISTS scan_directories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uri TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_scanned_at INTEGER DEFAULT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scan_directories_active ON scan_directories(is_active);

CREATE TABLE IF NOT EXISTS scanner_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  auto_scan_on_startup INTEGER NOT NULL DEFAULT 1 CHECK (auto_scan_on_startup IN (0, 1)),
  scan_subdirectories INTEGER NOT NULL DEFAULT 1 CHECK (scan_subdirectories IN (0, 1)),
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO scanner_settings (id, auto_scan_on_startup, scan_subdirectories, updated_at)
VALUES (1, 1, 1, 0);
`;

export const SCHEMA_AI = `
CREATE TABLE IF NOT EXISTS llm_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN ('openai', 'google', 'anthropic', 'custom')),
  api_key TEXT DEFAULT NULL,
  base_url TEXT DEFAULT NULL,
  model_id TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  temperature REAL NOT NULL DEFAULT 0.5,
  max_tokens INTEGER NOT NULL DEFAULT 1000,
  is_enabled INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0, 1)),
  target_language TEXT DEFAULT 'uk',
  custom_system_prompt TEXT DEFAULT NULL,
  custom_prompts_json TEXT DEFAULT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO llm_settings (id, provider, api_key, base_url, model_id, temperature, max_tokens, is_enabled, target_language, updated_at)
VALUES (1, 'openai', NULL, NULL, 'gpt-4o-mini', 0.5, 1000, 0, 'uk', 0);

CREATE TABLE IF NOT EXISTS ai_cache (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  prompt_type TEXT NOT NULL CHECK (prompt_type IN ('explain', 'character', 'tldr', 'dictionary', 'ping', 'chat')),
  response_text TEXT NOT NULL,
  model_used TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_book ON ai_cache(book_id, prompt_type);
`;

export const SCHEMA_AI_CHAT = `
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  context_snippet TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_book ON ai_chat_messages(book_id, created_at ASC);
`;

export const SCHEMA_VOCABULARY = `
CREATE TABLE IF NOT EXISTS vocabulary_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id TEXT REFERENCES books(id) ON DELETE SET NULL,
  book_title TEXT,
  word TEXT NOT NULL,
  lemma TEXT,
  part_of_speech TEXT,
  phonetic TEXT,
  translation TEXT NOT NULL,
  contextual_definition TEXT NOT NULL,
  general_definition TEXT,
  synonyms_json TEXT,
  example_sentence TEXT,
  context_sentence TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vocab_created ON vocabulary_words(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vocab_book ON vocabulary_words(book_id);
`;

export async function migrateFormatCheckConstraints(db: {
  query: (statement: string, values?: any[]) => Promise<{ values?: any[] }>;
  execute: (statements: string) => Promise<any>;
}): Promise<void> {
  try {
    const booksMaster = await db.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'books';");
    const booksSql = (booksMaster.values?.[0] as { sql?: string } | undefined)?.sql || '';
    if (booksSql && !booksSql.includes("'djvu'")) {
      await db.execute('PRAGMA foreign_keys = OFF;');
      await db.execute(`
        CREATE TABLE books_format_mig (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          author TEXT,
          format TEXT NOT NULL CHECK (format IN ('pdf', 'epub', 'fb2', 'mobi', 'djvu')),
          file_path TEXT NOT NULL,
          cover_path TEXT,
          locator TEXT NOT NULL,
          progress_percentage REAL NOT NULL DEFAULT 0.0,
          total_items INTEGER NOT NULL DEFAULT 0,
          last_read_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
          pinned_at INTEGER DEFAULT NULL,
          file_size INTEGER DEFAULT NULL,
          file_hash TEXT DEFAULT NULL
        );
      `);

      const info = await db.query('PRAGMA table_info(books);');
      const cols = ((info.values as Array<{ name: string }>) || []).map((c) => c.name);
      const hasSize = cols.includes('file_size');
      const hasHash = cols.includes('file_hash');
      const hasPinned = cols.includes('is_pinned');
      const hasPinnedAt = cols.includes('pinned_at');

      const selectCols = [
        'id',
        'title',
        'author',
        'format',
        'file_path',
        'cover_path',
        'locator',
        'progress_percentage',
        'total_items',
        'last_read_at',
        'updated_at',
        hasPinned ? 'is_pinned' : '0 AS is_pinned',
        hasPinnedAt ? 'pinned_at' : 'NULL AS pinned_at',
        hasSize ? 'file_size' : 'NULL AS file_size',
        hasHash ? 'file_hash' : 'NULL AS file_hash',
      ].join(', ');

      await db.execute(`
        INSERT INTO books_format_mig (id, title, author, format, file_path, cover_path, locator, progress_percentage, total_items, last_read_at, updated_at, is_pinned, pinned_at, file_size, file_hash)
        SELECT ${selectCols} FROM books;
      `);
      await db.execute('DROP TABLE books;');
      await db.execute('ALTER TABLE books_format_mig RENAME TO books;');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_books_updated_at ON books(updated_at);');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_books_pinned ON books(is_pinned DESC, pinned_at DESC);');
      await db.execute('PRAGMA foreign_keys = ON;');
    }
  } catch (err) {
    console.error('Failed to migrate books format constraint:', err);
  }

  try {
    const hlMaster = await db.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'highlights';");
    const hlSql = (hlMaster.values?.[0] as { sql?: string } | undefined)?.sql || '';
    if (hlSql && !hlSql.includes("'djvu'")) {
      await db.execute('PRAGMA foreign_keys = OFF;');
      await db.execute(`
        CREATE TABLE highlights_format_mig (
          id TEXT PRIMARY KEY,
          book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
          format TEXT NOT NULL CHECK (format IN ('pdf', 'epub', 'fb2', 'mobi', 'djvu')),
          locator TEXT NOT NULL,
          selected_text TEXT NOT NULL,
          color TEXT NOT NULL CHECK (color IN ('yellow', 'green', 'pink', 'blue', 'purple')),
          note TEXT DEFAULT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      await db.execute(`
        INSERT INTO highlights_format_mig (id, book_id, format, locator, selected_text, color, note, created_at, updated_at)
        SELECT id, book_id, format, locator, selected_text, color, note, created_at, updated_at FROM highlights;
      `);
      await db.execute('DROP TABLE highlights;');
      await db.execute('ALTER TABLE highlights_format_mig RENAME TO highlights;');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_highlights_book ON highlights(book_id, created_at DESC);');
      await db.execute('PRAGMA foreign_keys = ON;');
    }
  } catch (err) {
    console.error('Failed to migrate highlights format constraint:', err);
  }
}



