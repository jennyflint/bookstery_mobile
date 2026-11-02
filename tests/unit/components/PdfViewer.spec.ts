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

  it('should render zoom-sizer and zoom-content layers and expand layout when zoomScale is passed', () => {
    const wrapper = mount(PdfViewer, {
      global: {
        plugins: [pinia],
        mocks: {
          $t: (k: string) => k,
        },
      },
      props: {
        zoomScale: 2.0,
        baseWidth: 400,
        baseHeight: 600,
      },
      slots: {
        default: '<canvas width="400" height="600" />',
      },
    });

    const sizer = wrapper.find('[data-testid="zoom-sizer"]');
    expect(sizer.exists()).toBe(true);
    expect((sizer.element as HTMLElement).style.width).toBe('800px');
    expect((sizer.element as HTMLElement).style.height).toBe('1200px');

    const content = wrapper.find('[data-testid="zoom-content"]');
    expect(content.exists()).toBe(true);
    expect((content.element as HTMLElement).style.transform).toBe('scale(2)');
    expect(['0 0', '0px 0px']).toContain((content.element as HTMLElement).style.transformOrigin);
  });
});
