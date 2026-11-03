import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ReaderView from '~/components/reader/ReaderView.vue';
import { useSettingsStore } from '~/stores/useSettingsStore';
import { useTtsStore } from '~/stores/ttsStore';

describe('ReaderView.vue', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls settingsStore.enterReader on mount and leaveReader on unmount', async () => {
    const settingsStore = useSettingsStore();
    const ttsStore = useTtsStore();

    const enterSpy = vi.spyOn(settingsStore, 'enterReader').mockResolvedValue(undefined);
    const leaveSpy = vi.spyOn(settingsStore, 'leaveReader').mockResolvedValue(undefined);

    const wrapper = mount(ReaderView, {
      global: {
        plugins: [pinia],
        stubs: {
          ReaderViewport: true,
        },
      },
    });

    expect(enterSpy).toHaveBeenCalledTimes(1);

    wrapper.unmount();

    expect(leaveSpy).toHaveBeenCalledWith(false);
  });

  it('emits next and prev events when handleNextPage and handlePrevPage are invoked', async () => {
    const wrapper = mount(ReaderView, {
      global: {
        plugins: [pinia],
        stubs: {
          ReaderViewport: true,
        },
      },
    });

    const vm = wrapper.vm as any;
    await vm.handleNextPage();
    expect(wrapper.emitted('next')).toHaveLength(1);

    await vm.handlePrevPage();
    expect(wrapper.emitted('prev')).toHaveLength(1);
  });

  it('scrolls reflow element instead of immediately emitting next when not at bottom', async () => {
    const readerStore = (await import('~/stores/readerStore')).useReaderStore();
    readerStore.isReflowMode = true;
    readerStore.currentBook = {
      id: 'book-1',
      title: 'PDF Book',
      author: null,
      format: 'pdf',
      file_path: 'book.pdf',
      cover_path: null,
      locator: '1',
      progress_percentage: 0,
      total_items: 10,
      last_read_at: Date.now(),
      updated_at: Date.now(),
    };

    // Create a dummy DOM element mimicking reflow view
    const reflowEl = document.createElement('div');
    reflowEl.setAttribute('data-testid', 'pdf-reflow-view');
    Object.defineProperty(reflowEl, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(reflowEl, 'clientHeight', { value: 800, writable: true });
    Object.defineProperty(reflowEl, 'scrollHeight', { value: 2000, writable: true });
    const scrollBySpy = vi.fn();
    reflowEl.scrollBy = scrollBySpy;
    document.body.appendChild(reflowEl);

    const wrapper = mount(ReaderView, {
      global: {
        plugins: [pinia],
        stubs: {
          ReaderViewport: true,
        },
      },
    });

    const vm = wrapper.vm as any;
    await vm.handleNextPage();

    expect(scrollBySpy).toHaveBeenCalled();
    expect(wrapper.emitted('next')).toBeUndefined();

    // Now set scrollTop to bottom
    reflowEl.scrollTop = 1200; // scrollTop + clientHeight = 2000 >= scrollHeight - 15
    await vm.handleNextPage();
    expect(wrapper.emitted('next')).toHaveLength(1);

    document.body.removeChild(reflowEl);
  });

  it('calls clearTextSelection on beforeUnmount/unmount and on page turn', async () => {
    const readerStore = (await import('~/stores/readerStore')).useReaderStore();
    const clearSpy = vi.spyOn(readerStore, 'clearTextSelection');

    const wrapper = mount(ReaderView, {
      global: {
        plugins: [pinia],
        stubs: {
          ReaderViewport: true,
        },
      },
    });

    // Verify clearTextSelection is exposed
    const vm = wrapper.vm as any;
    expect(typeof vm.clearTextSelection).toBe('function');

    // Page turn trigger
    clearSpy.mockClear();
    readerStore.currentPage = 2;
    await wrapper.vm.$nextTick();
    expect(clearSpy).toHaveBeenCalled();

    // Unmount trigger
    clearSpy.mockClear();
    wrapper.unmount();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('passes saved paginationMode to activeEngine and updates on change', async () => {
    const readerStore = (await import('~/stores/readerStore')).useReaderStore();
    readerStore.settings.paginationMode = 'scroll';

    const mockEngine = {
      setPaginationMode: vi.fn(),
    };

    const wrapper = mount(ReaderView, {
      props: {
        activeEngine: mockEngine,
      },
      global: {
        plugins: [pinia],
        stubs: {
          ReaderViewport: true,
        },
      },
    });

    await wrapper.vm.$nextTick();
    expect(mockEngine.setPaginationMode).toHaveBeenCalledWith('scroll');

    // Change setting
    readerStore.settings.paginationMode = 'paginated';
    await wrapper.vm.$nextTick();
    expect(mockEngine.setPaginationMode).toHaveBeenCalledWith('paginated');
  });

  it('scrolls epub container when in scroll mode and not at bottom', async () => {
    const readerStore = (await import('~/stores/readerStore')).useReaderStore();
    readerStore.settings.paginationMode = 'scroll';

    const epubContainer = document.createElement('div');
    epubContainer.className = 'epub-container';
    Object.defineProperty(epubContainer, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(epubContainer, 'clientHeight', { value: 800, writable: true });
    Object.defineProperty(epubContainer, 'scrollHeight', { value: 2000, writable: true });
    const scrollBySpy = vi.fn();
    epubContainer.scrollBy = scrollBySpy;
    document.body.appendChild(epubContainer);

    const wrapper = mount(ReaderView, {
      global: {
        plugins: [pinia],
        stubs: {
          ReaderViewport: true,
        },
      },
    });

    const vm = wrapper.vm as any;
    await vm.handleNextPage();

    expect(scrollBySpy).toHaveBeenCalled();
    expect(wrapper.emitted('next')).toBeUndefined();

    document.body.removeChild(epubContainer);
  });
});
