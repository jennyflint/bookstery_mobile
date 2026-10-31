import { SqliteService } from './SqliteService';
import type { AiCacheRecord, LlmSettingsRecord } from '../../types';

const STORAGE_KEYS = {
  LLM_SETTINGS: 'bookstery_web_llm_settings',
  AI_CACHE: 'bookstery_web_ai_cache',
};

const DEFAULT_SETTINGS: LlmSettingsRecord = {
  id: 1,
  provider: 'openai',
  api_key: null,
  base_url: null,
  model_id: 'gpt-4o-mini',
  temperature: 0.5,
  max_tokens: 1000,
  is_enabled: 0,
  updated_at: 0,
};

function readStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') {
    return defaultValue;
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function writeStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export class AiSettingsRepository {
  private static instance: AiSettingsRepository | null = null;
  private readonly sqliteService: SqliteService;

  constructor(sqliteService: SqliteService = SqliteService.getInstance()) {
    this.sqliteService = sqliteService;
  }

  static getInstance(): AiSettingsRepository {
    if (!AiSettingsRepository.instance) {
      AiSettingsRepository.instance = new AiSettingsRepository();
    }
    return AiSettingsRepository.instance;
  }

  async getSettings(): Promise<LlmSettingsRecord> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        const query = `
          SELECT id, provider, api_key, base_url, model_id, temperature, max_tokens, is_enabled, updated_at
          FROM llm_settings
          WHERE id = 1;
        `;
        const rows = await this.sqliteService.querySql<LlmSettingsRecord>(query);
        if (rows.length > 0) {
          return rows[0];
        }
      } catch {}
    }

    return readStorage<LlmSettingsRecord>(STORAGE_KEYS.LLM_SETTINGS, { ...DEFAULT_SETTINGS });
  }

  async saveSettings(
    partial: Partial<Omit<LlmSettingsRecord, 'id'>>,
  ): Promise<LlmSettingsRecord> {
    const current = await this.getSettings();
    const now = Date.now();

    const updated: LlmSettingsRecord = {
      id: 1,
      provider: partial.provider ?? current.provider,
      api_key: partial.api_key !== undefined ? partial.api_key : current.api_key,
      base_url: partial.base_url !== undefined ? partial.base_url : current.base_url,
      model_id: partial.model_id ?? current.model_id,
      temperature: partial.temperature ?? current.temperature,
      max_tokens: partial.max_tokens ?? current.max_tokens,
      is_enabled: partial.is_enabled ?? current.is_enabled,
      updated_at: now,
    };

    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        const query = `
          INSERT INTO llm_settings (id, provider, api_key, base_url, model_id, temperature, max_tokens, is_enabled, updated_at)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            provider = excluded.provider,
            api_key = excluded.api_key,
            base_url = excluded.base_url,
            model_id = excluded.model_id,
            temperature = excluded.temperature,
            max_tokens = excluded.max_tokens,
            is_enabled = excluded.is_enabled,
            updated_at = excluded.updated_at;
        `;
        await this.sqliteService.runSql(query, [
          updated.provider,
          updated.api_key,
          updated.base_url,
          updated.model_id,
          updated.temperature,
          updated.max_tokens,
          updated.is_enabled,
          now,
        ]);
        return updated;
      } catch {}
    }

    writeStorage(STORAGE_KEYS.LLM_SETTINGS, updated);
    return updated;
  }

  async getCachedResponse(cacheKey: string): Promise<string | null> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        const query = `
          SELECT response_text
          FROM ai_cache
          WHERE id = ?
          LIMIT 1;
        `;
        const rows = await this.sqliteService.querySql<{ response_text: string }>(query, [
          cacheKey,
        ]);
        if (rows.length > 0) {
          return rows[0].response_text;
        }
      } catch {}
    }

    const cache = readStorage<Record<string, AiCacheRecord>>(STORAGE_KEYS.AI_CACHE, {});
    const record = cache[cacheKey];
    return record ? record.response_text : null;
  }

  async saveCachedResponse(record: AiCacheRecord): Promise<void> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        const query = `
          INSERT INTO ai_cache (id, book_id, prompt_type, response_text, model_used, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            response_text = excluded.response_text,
            model_used = excluded.model_used,
            created_at = excluded.created_at;
        `;
        await this.sqliteService.runSql(query, [
          record.id,
          record.book_id,
          record.prompt_type,
          record.response_text,
          record.model_used,
          record.created_at,
        ]);
        return;
      } catch {}
    }

    const cache = readStorage<Record<string, AiCacheRecord>>(STORAGE_KEYS.AI_CACHE, {});
    cache[record.id] = record;
    writeStorage(STORAGE_KEYS.AI_CACHE, cache);
  }

  async clearCache(bookId?: string): Promise<void> {
    await this.sqliteService.init();

    if (this.sqliteService.isNativePlatform()) {
      try {
        if (bookId) {
          await this.sqliteService.runSql('DELETE FROM ai_cache WHERE book_id = ?;', [bookId]);
        } else {
          await this.sqliteService.runSql('DELETE FROM ai_cache;');
        }
        return;
      } catch {}
    }

    if (bookId) {
      const cache = readStorage<Record<string, AiCacheRecord>>(STORAGE_KEYS.AI_CACHE, {});
      for (const key of Object.keys(cache)) {
        if (cache[key].book_id === bookId) {
          delete cache[key];
        }
      }
      writeStorage(STORAGE_KEYS.AI_CACHE, cache);
    } else {
      writeStorage(STORAGE_KEYS.AI_CACHE, {});
    }
  }
}
