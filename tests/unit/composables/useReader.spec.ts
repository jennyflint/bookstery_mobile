import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useReader } from '~/composables/useReader';
import { useReaderStore } from '~/stores/readerStore';
import type { BookRecord } from '~/types';

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn().mockReturnValue({
    promise: Promise.resolve({
      numPages: 5,
      getPage: vi.fn().mockResolvedValue({
        getViewport: vi.fn().mockReturnValue({ width: 600, height: 800 }),
        render: vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
        getTextContent: vi.fn().mockResolvedValue({ items: [] }),
        cleanup: vi.fn(),
      }),
      destroy: vi.fn().mockResolvedValue(undefined),
    }),
  }),
}));

describe('useReader Composable', () => {
  let container: HTMLElement;

  const mockPdfBook: BookRecord = {
    id: 'test-pdf-1',
    title: 'Sample PDF',
    author: 'Author Name',
    format: 'pdf',
    file_path: 'books/sample.pdf',
    cover_path: null,
    locator: '1',
    progress_percentage: 0,
    total_items: 5,
    last_read_at: Date.now(),
    updated_at: Date.now(),
  };

  const mockFb2Book: BookRecord = {
    id: 'test-fb2-1',
    title: 'Sample FB2',
    author: 'Author Name',
    format: 'fb2',
    file_path: 'books/sample.fb2',
    cover_path: null,
    locator: 'fb2-p-0',
    progress_percentage: 0,
    total_items: 10,
    last_read_at: Date.now(),
    updated_at: Date.now(),
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('should instantiate PdfEngine for pdf book and navigate pages', async () => {
    const { openBook, nextPage, prevPage, activeEngine } = useReader();
    const readerStore = useReaderStore();

    await openBook(container, mockPdfBook, new Uint8Array([1, 2, 3]));

    expect(activeEngine.value).not.toBeNull();
    expect(readerStore.currentBook?.id).toBe('test-pdf-1');
    expect(readerStore.locator).toBe('1');

    await nextPage();
    expect(readerStore.locator).toBe('2');

    await prevPage();
    expect(readerStore.locator).toBe('1');
  });

  it('should instantiate Fb2Engine for fb2 book', async () => {
    const { openBook, activeEngine } = useReader();
    const readerStore = useReaderStore();

    const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description><title-info><book-title>Test</book-title></title-info></description>
  <body><section><p>Test paragraph</p></section></body>
</FictionBook>`;

    await openBook(container, mockFb2Book, sampleXml);

    expect(activeEngine.value).not.toBeNull();
    expect(readerStore.currentBook?.format).toBe('fb2');
  });

  it('should throw an error for unsupported book format', async () => {
    const { openBook } = useReader();
    const invalidBook = { ...mockPdfBook, format: 'mobi' as unknown as 'pdf' };

    await expect(openBook(container, invalidBook, new Uint8Array([]))).rejects.toThrow(
      'Unsupported book format: mobi',
    );
  });
});
