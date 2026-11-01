import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import PdfReflowView from '~/components/reader/PdfReflowView.vue';
import { useReaderStore } from '~/stores/readerStore';
import * as parser from '~/utils/pdfReflowParser';

vi.mock('~/utils/pdfReflowParser', () => ({
  extractReflowBlocks: vi.fn(),
}));

function createTouchEvent(
  type: string,
  touches: Array<{ clientX: number; clientY: number }>,
  changedTouches: Array<{ clientX: number; clientY: number }> = touches,
): TouchEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as unknown as TouchEvent;
  Object.defineProperty(event, 'touches', {
    value: touches,
    writable: false,
  });
  Object.defineProperty(event, 'changedTouches', {
    value: changedTouches,
    writable: false,
  });
  return event;
}

describe('PdfReflowView Component', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.clearAllMocks();
  });

  const mockPdfPage = {
    getViewport: vi.fn().mockReturnValue({ width: 600, height: 800 }),
    render: vi.fn().mockReturnValue({
      promise: Promise.resolve(),
      cancel: vi.fn(),
    }),
  };

  const mockPdfDoc = {
    getPage: vi.fn().mockResolvedValue(mockPdfPage),
  };

  it('should render reflow blocks and apply typography styling', async () => {
    const readerStore = useReaderStore();
    readerStore.currentPage = 1;
    readerStore.totalPages = 5;
    readerStore.setReflowTheme('sepia');
    readerStore.setReflowFontSize(20);
    readerStore.setReflowLineHeight(1.8);
    readerStore.setReflowFontFamily('serif');

    (parser.extractReflowBlocks as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: '1', type: 'h2', text: 'Chapter Heading', pageNumber: 1 },
      { id: '2', type: 'h3', text: 'Section Subtitle', pageNumber: 1 },
      { id: '3', type: 'p', text: 'Reflowed paragraph content.', pageNumber: 1 },
    ]);

    const wrapper = mount(PdfReflowView, {
      props: {
        pdfDocument: mockPdfDoc as any,
        pageNumber: 1,
      },
      global: {
        plugins: [pinia],
        mocks: {
          $t: (k: string) => k,
        },
      },
    });

    await wrapper.vm.$nextTick();
    await new Promise((r) => setTimeout(r, 20));
    await wrapper.vm.$nextTick();

    const container = wrapper.find('[data-testid="pdf-reflow-view"]');
    expect(container.exists()).toBe(true);
    expect(container.classes()).toContain('bg-[#f8f1e3]');
    expect(container.classes()).toContain('text-[#433422]');

    expect(wrapper.find('[data-testid="reflow-h2"]').text()).toBe('Chapter Heading');
    expect(wrapper.find('[data-testid="reflow-h3"]').text()).toBe('Section Subtitle');
    expect(wrapper.find('[data-testid="reflow-p"]').text()).toBe('Reflowed paragraph content.');
  });

  it('should handle bottom page navigation button clicks', async () => {
    const readerStore = useReaderStore();
    readerStore.currentPage = 2;
    readerStore.totalPages = 5;

    (parser.extractReflowBlocks as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: '1', type: 'p', text: 'Some text', pageNumber: 2 },
    ]);

    const wrapper = mount(PdfReflowView, {
      props: {
        pdfDocument: mockPdfDoc as any,
        pageNumber: 2,
      },
      global: {
        plugins: [pinia],
        mocks: {
          $t: (k: string) => k,
        },
      },
    });

    await wrapper.vm.$nextTick();
    await new Promise((r) => setTimeout(r, 10));

    const prevBtn = wrapper.find('[data-testid="reflow-prev-page-btn"]');
    const nextBtn = wrapper.find('[data-testid="reflow-next-page-btn"]');

    expect(prevBtn.attributes('disabled')).toBeUndefined();
    expect(nextBtn.attributes('disabled')).toBeUndefined();

    await prevBtn.trigger('click');
    expect(wrapper.emitted('prev')).toBeTruthy();

    await nextBtn.trigger('click');
    expect(wrapper.emitted('next')).toBeTruthy();
  });

  it('should render fallback banner and canvas when page has no text (scanned image page)', async () => {
    (parser.extractReflowBlocks as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const wrapper = mount(PdfReflowView, {
      props: {
        pdfDocument: mockPdfDoc as any,
        pageNumber: 3,
      },
      global: {
        plugins: [pinia],
        mocks: {
          $t: (k: string) => k,
        },
      },
    });

    await wrapper.vm.$nextTick();
    await new Promise((r) => setTimeout(r, 20));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="scanned-page-fallback-banner"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="reflow-fallback-canvas"]').exists()).toBe(true);
  });

  it('should emit center-tap when clicking in center region of the screen', async () => {
    (parser.extractReflowBlocks as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: '1', type: 'p', text: 'Text', pageNumber: 1 },
    ]);

    const wrapper = mount(PdfReflowView, {
      props: {
        pdfDocument: mockPdfDoc as any,
        pageNumber: 1,
      },
      global: {
        plugins: [pinia],
        mocks: {
          $t: (k: string) => k,
        },
      },
    });

    await wrapper.vm.$nextTick();

    const container = wrapper.find('[data-testid="pdf-reflow-view"]');

    // Click in center region (e.g. clientX = 500 when window.innerWidth = 1000)
    Object.defineProperty(window, 'innerWidth', { value: 1000, writable: true, configurable: true });

    await container.trigger('click', { clientX: 500 });
    expect(wrapper.emitted('center-tap')).toBeTruthy();
  });

  it('should support horizontal swipe gesture to navigate pages when no text is selected', async () => {
    (parser.extractReflowBlocks as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: '1', type: 'p', text: 'Text', pageNumber: 1 },
    ]);

    const wrapper = mount(PdfReflowView, {
      props: {
        pdfDocument: mockPdfDoc as any,
        pageNumber: 1,
      },
      global: {
        plugins: [pinia],
        mocks: {
          $t: (k: string) => k,
        },
      },
    });

    await wrapper.vm.$nextTick();

    const el = wrapper.find('[data-testid="pdf-reflow-view"]').element as HTMLElement;

    // Swipe left (dx = -100): next page
    el.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 250, clientY: 200 }]));
    el.dispatchEvent(createTouchEvent('touchend', [], [{ clientX: 150, clientY: 205 }]));

    expect(wrapper.emitted('next')).toBeTruthy();

    // Swipe right (dx = +100): prev page
    el.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 100, clientY: 200 }]));
    el.dispatchEvent(createTouchEvent('touchend', [], [{ clientX: 220, clientY: 195 }]));

    expect(wrapper.emitted('prev')).toBeTruthy();
  });
});
