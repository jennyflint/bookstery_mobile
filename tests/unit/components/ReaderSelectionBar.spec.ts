import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ReaderSelectionBar from '~/components/reader/ReaderSelectionBar.vue';
import { useReaderStore } from '~/stores/readerStore';
import { useHighlightStore } from '~/stores/highlightStore';
import { useAiStore } from '~/stores/aiStore';
import { mockShare } from '../../mocks/capacitor-plugins';

const mockTriggerExplain = vi.fn().mockResolvedValue(undefined);
const mockTriggerCharacter = vi.fn().mockResolvedValue(undefined);
const mockTriggerDictionary = vi.fn().mockResolvedValue(undefined);

vi.mock('~/composables/useAiReader', () => ({
  useAiReader: () => ({
    triggerExplain: mockTriggerExplain,
    triggerCharacter: mockTriggerCharacter,
    triggerDictionary: mockTriggerDictionary,
  }),
}));

const mockCopyToClipboard = vi.fn().mockResolvedValue(true);
vi.mock('~/services/translation/TranslationService', () => ({
  TranslationService: {
    getInstance: () => ({
      copyToClipboard: mockCopyToClipboard,
      translateText: vi.fn().mockResolvedValue({ translatedText: 'translated' }),
    }),
  },
}));

describe('ReaderSelectionBar Component', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mountBar() {
    return mount(ReaderSelectionBar, {
      global: {
        plugins: [pinia],
        mocks: {
          $t: (k: string) => k,
        },
        stubs: {
          Transition: false,
        },
      },
    });
  }

  describe('Visibility and Positioning', () => {
    it('should be hidden when there is no text selection and no selected highlight', () => {
      const wrapper = mountBar();
      const bar = wrapper.find('[data-testid="reader-selection-bar"]');
      expect(bar.exists()).toBe(false);
    });

    it('should be visible and fixed at bottom when text is actively selected', async () => {
      const readerStore = useReaderStore();
      readerStore.setSelection({
        text: 'Selected text fragment for reading',
        x: 100,
        y: 200,
        width: 150,
        height: 20,
      });

      const wrapper = mountBar();
      await wrapper.vm.$nextTick();

      const bar = wrapper.find('[data-testid="reader-selection-bar"]');
      expect(bar.exists()).toBe(true);

      const el = bar.element as HTMLElement;
      expect(el.className).toContain('fixed');
      expect(el.className).toContain('bottom-0');
      expect(el.className).toContain('inset-x-0');
      expect(el.className).toContain('z-50');

      // Ensure no floating absolute inline positioning is applied
      expect(el.style.top).toBe('');
      expect(el.style.left).toBe('');
    });

    it('should wrap buttons into multiple rows if needed with flex-wrap and comfortable touch targets', async () => {
      const readerStore = useReaderStore();
      readerStore.setSelection({
        text: 'Sample passage',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      });

      const wrapper = mountBar();
      await wrapper.vm.$nextTick();

      const container = wrapper.find('.flex-wrap');
      expect(container.exists()).toBe(true);
      expect(container.classes()).toContain('flex-wrap');
      expect(container.classes()).toContain('gap-2');

      const actionButtons = wrapper.findAll('button');
      for (const btn of actionButtons) {
        expect(btn.classes().some((cls) => cls.includes('min-h-[40px]') || cls.includes('w-6'))).toBe(true);
      }
    });
  });

  describe('Action Handlers', () => {
    it('should apply highlight and clear selection when a color swatch is clicked', async () => {
      const readerStore = useReaderStore();
      const highlightStore = useHighlightStore();
      const createHighlightSpy = vi.spyOn(highlightStore, 'createHighlight').mockResolvedValue(undefined as any);

      readerStore.setSelection({
        text: 'Text to highlight',
        x: 50,
        y: 80,
        width: 100,
        height: 18,
      });

      const wrapper = mountBar();
      await wrapper.vm.$nextTick();

      const yellowBtn = wrapper.find('[data-testid="hl-color-yellow"]');
      expect(yellowBtn.exists()).toBe(true);

      await yellowBtn.trigger('click');

      expect(createHighlightSpy).toHaveBeenCalledWith('yellow');
      expect(readerStore.selection).toBeNull();
    });

    it('should open note editor and clear selection when Add Note is clicked', async () => {
      const readerStore = useReaderStore();
      const highlightStore = useHighlightStore();
      const openNoteSpy = vi.spyOn(highlightStore, 'openNoteEditorForSelection');

      readerStore.setSelection({
        text: 'Quote for note taking',
        x: 10,
        y: 20,
        width: 80,
        height: 15,
      });

      const wrapper = mountBar();
      await wrapper.vm.$nextTick();

      const noteBtn = wrapper.find('[data-testid="add-note-action"]');
      expect(noteBtn.exists()).toBe(true);

      await noteBtn.trigger('click');

      expect(openNoteSpy).toHaveBeenCalledWith('green');
      expect(readerStore.selection).toBeNull();
    });

    it('should open quote card generator when Quote Card button is clicked', async () => {
      const readerStore = useReaderStore();
      const highlightStore = useHighlightStore();
      const quoteCardSpy = vi.spyOn(highlightStore, 'openQuoteCardForSelection');

      readerStore.setSelection({
        text: 'Inspiring philosophical quote',
        x: 10,
        y: 20,
        width: 80,
        height: 15,
      });

      const wrapper = mountBar();
      await wrapper.vm.$nextTick();

      const quoteBtn = wrapper.find('[data-testid="create-quote-card-action"]');
      expect(quoteBtn.exists()).toBe(true);

      await quoteBtn.trigger('click');

      expect(quoteCardSpy).toHaveBeenCalled();
      expect(readerStore.selection).toBeNull();
    });

    it('should copy text to clipboard and dismiss bar when Copy is clicked', async () => {
      const readerStore = useReaderStore();
      readerStore.setSelection({
        text: 'Text to copy into clipboard',
        x: 10,
        y: 20,
        width: 80,
        height: 15,
      });

      const wrapper = mountBar();
      await wrapper.vm.$nextTick();

      const copyBtn = wrapper.find('[data-testid="copy-text-action"]');
      expect(copyBtn.exists()).toBe(true);

      await copyBtn.trigger('click');

      expect(mockCopyToClipboard).toHaveBeenCalledWith('Text to copy into clipboard');
      expect(readerStore.selection).toBeNull();
    });

    it('should emit "translate" with selected text when Translate is clicked', async () => {
      const readerStore = useReaderStore();
      readerStore.setSelection({
        text: 'Foreign language expression',
        x: 10,
        y: 20,
        width: 80,
        height: 15,
      });

      const wrapper = mountBar();
      await wrapper.vm.$nextTick();

      const translateBtn = wrapper.find('[data-testid="translate-action-btn"]');
      expect(translateBtn.exists()).toBe(true);

      await translateBtn.trigger('click');

      expect(wrapper.emitted('translate')).toBeTruthy();
      expect(wrapper.emitted('translate')?.[0]).toEqual(['Foreign language expression']);
    });

    it('should share text via Share plugin or navigator when Share is clicked', async () => {
      const readerStore = useReaderStore();
      readerStore.setBook({
        id: 'book-1',
        title: 'Moby Dick',
        author: 'Herman Melville',
        format: 'epub',
        file_path: 'moby.epub',
        file_size: 1024,
        total_items: 100,
        cover_path: null,
        locator: '1',
        progress_percentage: 0,
        last_read_at: Date.now(),
        updated_at: Date.now(),
      });
      readerStore.setSelection({
        text: 'Call me Ishmael.',
        x: 10,
        y: 20,
        width: 80,
        height: 15,
      });

      const wrapper = mountBar();
      await wrapper.vm.$nextTick();

      const shareBtn = wrapper.find('[data-testid="share-text-action"]');
      expect(shareBtn.exists()).toBe(true);

      await shareBtn.trigger('click');
      await flushPromises();

      expect(mockShare.share).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Moby Dick',
          text: 'Call me Ishmael.',
        }),
      );
      expect(readerStore.selection).toBeNull();
    });

    it('should trigger AI explanation and clear selection when AI Explain is clicked with configured key', async () => {
      const aiStore = useAiStore();
      aiStore.settings.api_key = 'sk-mock-key';

      const readerStore = useReaderStore();
      readerStore.setSelection({
        text: 'Complex scientific hypothesis',
        x: 10,
        y: 20,
        width: 80,
        height: 15,
      });

      const wrapper = mountBar();
      await wrapper.vm.$nextTick();

      const explainBtn = wrapper.find('[data-testid="ai-explain-action"]');
      expect(explainBtn.exists()).toBe(true);

      await explainBtn.trigger('click');

      expect(mockTriggerExplain).toHaveBeenCalledWith('Complex scientific hypothesis');
      expect(readerStore.selection).toBeNull();
    });

    it('should mark AI buttons as aria-disabled when API key is missing and open onboarding instruction popup on click', async () => {
      const aiStore = useAiStore();
      aiStore.settings.api_key = null;
      const modalSpy = vi.spyOn(aiStore, 'openOnboardingModal');

      const readerStore = useReaderStore();
      readerStore.setSelection({
        text: 'Unknown word to explain',
        x: 10,
        y: 20,
        width: 80,
        height: 15,
      });

      const wrapper = mountBar();
      await wrapper.vm.$nextTick();

      const explainBtn = wrapper.find('[data-testid="ai-explain-action"]');
      const characterBtn = wrapper.find('[data-testid="ai-character-action"]');
      const dictBtn = wrapper.find('[data-testid="ai-dictionary-action"]');
      const chatBtn = wrapper.find('[data-testid="ask-ai-chat-action"]');

      expect(explainBtn.attributes('aria-disabled')).toBe('true');
      expect(characterBtn.attributes('aria-disabled')).toBe('true');
      expect(dictBtn.attributes('aria-disabled')).toBe('true');
      expect(chatBtn.attributes('aria-disabled')).toBe('true');

      expect(explainBtn.classes()).toContain('cursor-not-allowed');

      await explainBtn.trigger('click');
      expect(modalSpy).toHaveBeenCalled();
      expect(mockTriggerExplain).not.toHaveBeenCalled();
    });

    it('should show delete button and delete highlight when existing highlight is selected', async () => {
      const highlightStore = useHighlightStore();
      const deleteSpy = vi.spyOn(highlightStore, 'deleteHighlight').mockResolvedValue(undefined);

      highlightStore.selectedHighlight = {
        id: 'hl-99',
        book_id: 'book-1',
        selected_text: 'Highlighted excerpt',
        color: 'yellow',
        locator: 'epubcfi(/6/2)',
        format: 'epub',
        note: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const wrapper = mountBar();
      await wrapper.vm.$nextTick();

      const deleteBtn = wrapper.find('[data-testid="delete-highlight-btn"]');
      expect(deleteBtn.exists()).toBe(true);

      await deleteBtn.trigger('click');

      expect(deleteSpy).toHaveBeenCalledWith('hl-99');
      expect(highlightStore.selectedHighlight).toBeNull();
    });

    it('should clear selection and hide bottom bar when dismiss button is clicked', async () => {
      const readerStore = useReaderStore();
      readerStore.setSelection({
        text: 'Temporary selection to dismiss',
        x: 10,
        y: 20,
        width: 80,
        height: 15,
      });

      const wrapper = mountBar();
      await wrapper.vm.$nextTick();

      const dismissBtn = wrapper.find('[data-testid="dismiss-selection-bar-btn"]');
      expect(dismissBtn.exists()).toBe(true);

      await dismissBtn.trigger('click');
      await wrapper.vm.$nextTick();

      expect(readerStore.selection).toBeNull();
      expect(wrapper.find('[data-testid="reader-selection-bar"]').exists()).toBe(false);
    });

    it('should automatically dismiss and hide bottom bar when a new book is opened', async () => {
      const readerStore = useReaderStore();
      readerStore.setBook({
        id: 'book-old',
        title: 'Old Book',
        author: 'Author',
        format: 'epub',
        file_path: 'old.epub',
        file_size: 100,
        total_items: 10,
        cover_path: null,
        locator: '1',
        progress_percentage: 0,
        last_read_at: Date.now(),
        updated_at: Date.now(),
      });
      readerStore.setSelection({
        text: 'Selection from old book',
        x: 10,
        y: 20,
        width: 80,
        height: 15,
      });

      const wrapper = mountBar();
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="reader-selection-bar"]').exists()).toBe(true);

      // Open new book
      readerStore.setBook({
        id: 'book-new',
        title: 'New Book',
        author: 'Author',
        format: 'epub',
        file_path: 'new.epub',
        file_size: 100,
        total_items: 10,
        cover_path: null,
        locator: '1',
        progress_percentage: 0,
        last_read_at: Date.now(),
        updated_at: Date.now(),
      });
      await wrapper.vm.$nextTick();

      expect(readerStore.selectedText).toBe('');
      expect(readerStore.selection).toBeNull();
      expect(wrapper.find('[data-testid="reader-selection-bar"]').exists()).toBe(false);
    });
  });
});
