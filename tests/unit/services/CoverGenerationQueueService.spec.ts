import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Filesystem } from '@capacitor/filesystem';
import { CoverGenerationQueueService } from '../../../app/services/covers/CoverGenerationQueueService';
import { CoverExtractorService } from '../../../app/services/covers/CoverExtractorService';
import { SqliteService } from '../../../app/services/database/SqliteService';

describe('CoverGenerationQueueService', () => {
  let queueService: CoverGenerationQueueService;
  let mockExtractor: CoverExtractorService;
  let mockSqlite: SqliteService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockExtractor = new CoverExtractorService();
    mockSqlite = new SqliteService();

    vi.spyOn(mockSqlite, 'updateCoverPath').mockResolvedValue(undefined);

    queueService = new CoverGenerationQueueService(mockExtractor, mockSqlite, 'tests/fixtures/covers');
  });

  it('should process covers sequentially with concurrency strictly equal to one', async () => {
    let activeExtractions = 0;
    let maxConcurrentExtractions = 0;

    vi.spyOn(mockExtractor, 'extractCover').mockImplementation(async () => {
      activeExtractions++;
      if (activeExtractions > maxConcurrentExtractions) {
        maxConcurrentExtractions = activeExtractions;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 20));

      activeExtractions--;
      return new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
    });

    const promise1 = queueService.enqueue('book-1', 'pdf', new Uint8Array([1]));
    const promise2 = queueService.enqueue('book-2', 'epub', new Uint8Array([2]));
    const promise3 = queueService.enqueue('book-3', 'fb2', new Uint8Array([3]));

    const [res1, res2, res3] = await Promise.all([promise1, promise2, promise3]);

    expect(maxConcurrentExtractions).toBe(1);
    expect(res1).toBe('tests/fixtures/covers/book-1.webp');
    expect(res2).toBe('tests/fixtures/covers/book-2.webp');
    expect(res3).toBe('tests/fixtures/covers/book-3.webp');
    expect(queueService.pendingCount).toBe(0);
    expect(queueService.isProcessingCovers).toBe(false);
  });

  it('should write cover file and update SQLite database path', async () => {
    const dummyWebpBytes = new Uint8Array([82, 73, 70, 70, 10, 20, 30]);
    vi.spyOn(mockExtractor, 'extractCover').mockResolvedValue(dummyWebpBytes);

    const result = await queueService.enqueue('alpha-123', 'epub', new Uint8Array([9]));

    expect(result).toBe('tests/fixtures/covers/alpha-123.webp');
    expect(Filesystem.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'tests/fixtures/covers/alpha-123.webp',
        directory: 'DATA',
        recursive: true,
      }),
    );
    expect(mockSqlite.updateCoverPath).toHaveBeenCalledWith('alpha-123', 'tests/fixtures/covers/alpha-123.webp');
  });

  it('should fallback to null and not throw when book lacks embedded cover', async () => {
    vi.spyOn(mockExtractor, 'extractCover').mockResolvedValue(null);

    const result = await queueService.enqueue('no-cover-book', 'epub', new Uint8Array([0]));

    expect(result).toBeNull();
    expect(mockSqlite.updateCoverPath).toHaveBeenCalledWith('no-cover-book', null);
  });

  it('should catch errors gracefully, fallback to null, and continue processing next books', async () => {
    vi.spyOn(mockExtractor, 'extractCover')
      .mockRejectedValueOnce(new Error('Corrupt document stream'))
      .mockResolvedValueOnce(new Uint8Array([82, 73, 70, 70]));

    const failingPromise = queueService.enqueue('corrupt-book', 'pdf', new Uint8Array([1]));
    const succeedingPromise = queueService.enqueue('valid-book', 'fb2', new Uint8Array([2]));

    const failResult = await failingPromise;
    const successResult = await succeedingPromise;

    expect(failResult).toBeNull();
    expect(successResult).toBe('tests/fixtures/covers/valid-book.webp');
    expect(mockSqlite.updateCoverPath).toHaveBeenCalledWith('corrupt-book', null);
    expect(mockSqlite.updateCoverPath).toHaveBeenCalledWith('valid-book', 'tests/fixtures/covers/valid-book.webp');
  });

  it('should clear all pending tasks from the queue', async () => {
    vi.spyOn(mockExtractor, 'extractCover').mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(new Uint8Array([1])), 50)),
    );

    const p1 = queueService.enqueue('task-1', 'pdf', new Uint8Array([1]));
    const p2 = queueService.enqueue('task-2', 'epub', new Uint8Array([2]));
    const p3 = queueService.enqueue('task-3', 'fb2', new Uint8Array([3]));

    expect(queueService.pendingCount).toBeGreaterThanOrEqual(1);
    queueService.clear();

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r2).toBeNull();
    expect(r3).toBeNull();
    expect(queueService.pendingCount).toBe(0);
  });
});
