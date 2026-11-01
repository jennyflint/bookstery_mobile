import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import PdfViewer from '~/components/reader/PdfViewer.vue';
import { useReaderStore } from '~/stores/readerStore';

vi.mock('~/utils/pdfReflowParser', () => ({
  extractReflowBlocks: vi.fn().mockResolvedValue([
    { id: '1', type: 'p', text: 'Sample text', pageNumber: 1 },
  ]),
}));

describe('PdfViewer Component', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  it('should render slot content when isReflowMode is false', () => {
    const readerStore = useReaderStore();
    readerStore.isReflowMode = false;

    const wrapper = mount(PdfViewer, {
      global: {
        plugins: [pinia],
        mocks: {
          $t: (k: string) => k,
        },
      },
      slots: {
        default: '<div data-testid="default-canvas-slot">Canvas Content</div>',
      },
    });

    expect(wrapper.find('[data-testid="default-canvas-slot"]').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'PdfReflowView' }).exists()).toBe(false);
  });

  it('should switch to PdfReflowView when isReflowMode is true', async () => {
    const readerStore = useReaderStore();
    readerStore.isReflowMode = true;

    const wrapper = mount(PdfViewer, {
      global: {
        plugins: [pinia],
        mocks: {
          $t: (k: string) => k,
        },
      },
      slots: {
        default: '<div data-testid="default-canvas-slot">Canvas Content</div>',
      },
    });

    expect(wrapper.find('[data-testid="default-canvas-slot"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pdf-reflow-view"]').exists()).toBe(true);
  });

  it('should apply CSS containment and GPU stability styles on the root container', () => {
    const wrapper = mount(PdfViewer, {
      global: {
        plugins: [pinia],
        mocks: {
          $t: (k: string) => k,
        },
      },
      slots: {
        default: '<div data-testid="default-canvas-slot">Canvas Content</div>',
      },
    });

    const rootEl = wrapper.find('[data-testid="pdf-viewer"]').element as HTMLElement;
    expect(rootEl.style.contain).toContain('layout');
    expect(rootEl.style.backfaceVisibility).toBe('hidden');
    expect(rootEl.style.willChange).toBe('transform');
  });
});
