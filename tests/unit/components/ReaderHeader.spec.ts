import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ReaderHeader from '~/components/reader/ReaderHeader.vue';
import { useReaderStore } from '~/stores/readerStore';
import { useTtsStore } from '~/stores/ttsStore';

describe('ReaderHeader Component', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
  });

  function createWrapper() {
    return mount(ReaderHeader, {
      global: {
        plugins: [pinia],
        mocks: {
          $t: (k: string) => k,
        },
        stubs: {
          SyncStatusBadge: true,
        },
      },
    });
  }

  it('should render back button and emit back on click', async () => {
    const wrapper = createWrapper();
    const backBtn = wrapper.find('[data-testid="reader-back-btn"]');
    expect(backBtn.exists()).toBe(true);

    await backBtn.trigger('click');
    expect(wrapper.emitted('back')).toBeTruthy();
  });

  it('should not show reflow toggle for non-pdf books (e.g. epub)', () => {
    const readerStore = useReaderStore();
    readerStore.setBook({
      id: 'book-epub',
      title: 'Epub Book',
      author: null,
      format: 'epub',
      file_path: 'book.epub',
      cover_path: null,
      locator: '1',
      progress_percentage: 0,
      total_items: 10,
      last_read_at: 0,
      updated_at: 0,
    });

    const wrapper = createWrapper();
    expect(wrapper.find('[data-testid="reflow-mode-toggle-btn"]').exists()).toBe(false);
  });

  it('should show reflow toggle button for PDF books and toggle isReflowMode', async () => {
    const readerStore = useReaderStore();
    readerStore.setBook({
      id: 'book-pdf',
      title: 'PDF Document',
      author: null,
      format: 'pdf',
      file_path: 'doc.pdf',
      cover_path: null,
      locator: '1',
      progress_percentage: 0,
      total_items: 10,
      last_read_at: 0,
      updated_at: 0,
    });

    const wrapper = createWrapper();
    const toggleBtn = wrapper.find('[data-testid="reflow-mode-toggle-btn"]');
    expect(toggleBtn.exists()).toBe(true);

    expect(readerStore.isReflowMode).toBe(false);
    await toggleBtn.trigger('click');
    expect(readerStore.isReflowMode).toBe(true);

    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="reflow-typography-btn"]').exists()).toBe(true);
  });

  it('should open typography popover and allow adjusting typography settings', async () => {
    const readerStore = useReaderStore();
    readerStore.setBook({
      id: 'book-pdf',
      title: 'PDF Document',
      author: null,
      format: 'pdf',
      file_path: 'doc.pdf',
      cover_path: null,
      locator: '1',
      progress_percentage: 0,
      total_items: 10,
      last_read_at: 0,
      updated_at: 0,
    });
    readerStore.setReflowMode(true);

    const wrapper = createWrapper();
    const typoBtn = wrapper.find('[data-testid="reflow-typography-btn"]');
    expect(typoBtn.exists()).toBe(true);

    await typoBtn.trigger('click');
    await wrapper.vm.$nextTick();

    const popover = wrapper.find('[data-testid="reflow-typography-popover"]');
    expect(popover.exists()).toBe(true);
    expect(popover.classes()).toContain('bg-white');
    expect(popover.classes()).toContain('text-gray-900');
    expect(popover.classes()).toContain('border-gray-200');
    expect(popover.classes()).toContain('shadow-xl');

    // Font size inc / dec
    const incBtn = wrapper.find('[data-testid="reflow-font-size-inc"]');
    const decBtn = wrapper.find('[data-testid="reflow-font-size-dec"]');
    const initialFontSize = readerStore.reflowFontSize;

    await incBtn.trigger('click');
    expect(readerStore.reflowFontSize).toBe(initialFontSize + 1);

    await decBtn.trigger('click');
    expect(readerStore.reflowFontSize).toBe(initialFontSize);

    // Line height inc / dec
    const lhInc = wrapper.find('[data-testid="reflow-line-height-inc"]');
    await lhInc.trigger('click');
    expect(readerStore.reflowLineHeight).toBe(1.75);

    // Font family change
    await wrapper.find('[data-testid="reflow-font-sans"]').trigger('click');
    expect(readerStore.reflowFontFamily).toBe('sans');

    await wrapper.find('[data-testid="reflow-font-mono"]').trigger('click');
    expect(readerStore.reflowFontFamily).toBe('mono');

    // Theme change
    await wrapper.find('[data-testid="reflow-theme-sepia"]').trigger('click');
    expect(readerStore.reflowTheme).toBe('sepia');

    await wrapper.find('[data-testid="reflow-theme-dark"]').trigger('click');
    expect(readerStore.reflowTheme).toBe('dark');

    // Close popover
    await wrapper.find('[data-testid="reflow-typography-close"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="reflow-typography-popover"]').exists()).toBe(false);
  });
});
