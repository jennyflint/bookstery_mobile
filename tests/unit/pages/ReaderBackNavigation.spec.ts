import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { shallowRef } from 'vue';
import ReaderPage from '~/pages/reader/[id].vue';
import ReaderOverlayControls from '~/components/reader/ReaderOverlayControls.vue';
import { useLibraryStore } from '~/stores/libraryStore';
import { useReaderStore } from '~/stores/readerStore';
import { useHighlightStore } from '~/stores/highlightStore';
import { useAiStore } from '~/stores/aiStore';
import { mockApp } from '../../mocks/capacitor-plugins';

const mockPush = vi.fn();
const mockBack = vi.fn();
const mockReplace = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: { id: 'book-123' },
  }),
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
  }),
}));

const mockUpdateProgress = vi.fn().mockResolvedValue(undefined);
const mockQueueProgress = vi.fn().mockResolvedValue(undefined);

vi.mock('~/composables/useBookSync', () => ({
  useBookSync: () => ({
    queueProgress: mockQueueProgress,
  }),
}));

const mockCloseBook = vi.fn();
const mockOpenBook = vi.fn().mockResolvedValue(undefined);
const mockActiveEngine = {
  getCurrentLocation: vi.fn().mockReturnValue({
    locator: 'loc-42',
    progressPercentage: 42,
    currentPage: 42,
    totalPages: 100,
  }),
  destroy: vi.fn(),
};

vi.mock('~/composables/useReader', () => ({
  useReader: () => ({
    openBook: mockOpenBook,
    nextPage: vi.fn(),
    prevPage: vi.fn(),
    goToLocator: vi.fn(),
    goToPage: vi.fn(),
    setPaginationMode: vi.fn(),
    applyTheme: vi.fn(),
    closeBook: mockCloseBook,
    activeEngine: shallowRef(mockActiveEngine),
  }),
}));

describe('Reader Back Button and Navigation', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.clearAllMocks();

    mockActiveEngine.getCurrentLocation.mockReturnValue({
      locator: 'loc-42',
      progressPercentage: 42,
      currentPage: 42,
      totalPages: 100,
    });
    mockOpenBook.mockResolvedValue(undefined);
    mockCloseBook.mockReturnValue(undefined);
    mockUpdateProgress.mockResolvedValue(undefined);
    mockQueueProgress.mockResolvedValue(undefined);

    const libraryStore = useLibraryStore();
    libraryStore.books = [
      {
        id: 'book-123',
        title: 'Sample Book',
        author: 'Sample Author',
        format: 'epub',
        file_path: 'sample.epub',
        cover_path: null,
        file_size: 1024,
        total_items: 100,
        updated_at: Date.now(),
        last_read_at: Date.now(),
        progress_percentage: 10,
        locator: 'loc-1',
      },
    ];

    window.history.replaceState({ back: null }, '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ReaderOverlayControls Back Button', () => {
    it('should render back button with data-testid="reader-back-btn" and emit "back" on click', async () => {
      const readerStore = useReaderStore();
      readerStore.setImmersiveMode(false);

      const wrapper = mount(ReaderOverlayControls, {
        global: {
          plugins: [pinia],
          mocks: {
            $t: (k: string) => k,
          },
        },
      });

      const backBtn = wrapper.find('[data-testid="reader-back-btn"]');
      expect(backBtn.exists()).toBe(true);

      await backBtn.trigger('click');
      expect(wrapper.emitted('back')).toBeTruthy();
      expect(wrapper.emitted('back')?.length).toBe(1);
    });
  });

  describe('Reader Page Back Navigation Logic', () => {
    function mountReaderPage() {
      return mount(ReaderPage, {
        global: {
          plugins: [pinia],
          mocks: {
            $t: (k: string) => k,
          },
          stubs: {
            ReaderViewport: {
              template: '<div data-testid="stub-viewport"></div>',
              setup() {
                return {
                  scale: 1.0,
                  translateX: 0,
                  translateY: 0,
                  resetZoom: vi.fn(),
                  containerRef: document.createElement('div'),
                };
              },
            },
            ReaderOverlayControls: {
              template: '<div data-testid="stub-controls"><button data-testid="reader-back-btn" @click="$emit(\'back\')">Back</button></div>',
              emits: ['back', 'next', 'prev', 'navigate', 'open-settings', 'open-notes', 'chapter-tldr'],
            },
            ThemeSettingsSheet: true,
            TextSelectionTooltip: true,
            TranslationBottomSheet: true,
            HighlightNoteModal: true,
            BookNotesDrawer: true,
            QuoteCardModal: true,
            NotesExportModal: true,
            AiAssistantSheet: true,
            AiSettingsModal: true,
            Transition: false,
          },
        },
      });
    }

    it('should save progress to libraryStore and queueProgress, close book, and navigate on handleCloseReader', async () => {
      const libraryStore = useLibraryStore();
      const readerStore = useReaderStore();
      libraryStore.updateProgress = mockUpdateProgress;

      readerStore.setBook({
        id: 'book-123',
        title: 'Sample Book',
        author: 'Sample Author',
        format: 'epub',
        file_path: 'sample.epub',
        cover_path: null,
        file_size: 1024,
        total_items: 100,
        updated_at: Date.now(),
        last_read_at: Date.now(),
        progress_percentage: 10,
        locator: 'loc-1',
      });

      const wrapper = mountReaderPage();
      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as any;
      await vm.handleCloseReader();

      expect(mockUpdateProgress).toHaveBeenCalledWith('book-123', 'loc-42', 42);
      expect(mockQueueProgress).toHaveBeenCalledWith('book-123', 'loc-42', 42);
      expect(mockCloseBook).toHaveBeenCalled();
    });

    it('should navigate to "/" when window.history.state.back does not exist', async () => {
      window.history.replaceState({ back: null }, '');

      const wrapper = mountReaderPage();
      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as any;
      await vm.handleCloseReader();

      expect(mockPush).toHaveBeenCalledWith('/');
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('should navigate via router.back() when window.history.state.back exists', async () => {
      window.history.replaceState({ back: '/library' }, '');

      const wrapper = mountReaderPage();
      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as any;
      await vm.handleCloseReader();

      expect(mockBack).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should prevent duplicate navigation when double-tapped via isNavigating flag', async () => {
      const wrapper = mountReaderPage();
      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as any;
      const firstCall = vm.handleCloseReader();
      const secondCall = vm.handleCloseReader();

      await Promise.all([firstCall, secondCall]);

      expect(mockCloseBook).toHaveBeenCalledTimes(1);
    });

    describe('Hardware Back Button 3-Tier Hierarchy', () => {
      it('Priority 1: should reset zoom when page is zoomed or panned without exiting', async () => {
        const wrapper = mountReaderPage();
        await wrapper.vm.$nextTick();

        const vm = wrapper.vm as any;
        const resetZoomSpy = vi.fn();
        vm.viewportRef = {
          scale: 2.5,
          translateX: 15,
          translateY: 0,
          resetZoom: resetZoomSpy,
        };

        await vm.handleBackButtonPress();

        expect(resetZoomSpy).toHaveBeenCalledTimes(1);
        expect(mockPush).not.toHaveBeenCalled();
        expect(mockBack).not.toHaveBeenCalled();
      });

      it('Priority 2: should close active settings sheet without exiting', async () => {
        const wrapper = mountReaderPage();
        await wrapper.vm.$nextTick();

        const vm = wrapper.vm as any;
        vm.viewportRef = { scale: 1.0, translateX: 0, translateY: 0, resetZoom: vi.fn() };

        vm.isSettingsOpen = true;
        await vm.handleBackButtonPress();

        expect(vm.isSettingsOpen).toBe(false);
        expect(mockPush).not.toHaveBeenCalled();
        expect(mockBack).not.toHaveBeenCalled();
      });

      it('Priority 2: should close active translation modal without exiting', async () => {
        const wrapper = mountReaderPage();
        await wrapper.vm.$nextTick();

        const vm = wrapper.vm as any;
        vm.viewportRef = { scale: 1.0, translateX: 0, translateY: 0, resetZoom: vi.fn() };

        vm.isTranslationOpen = true;
        await vm.handleBackButtonPress();

        expect(vm.isTranslationOpen).toBe(false);
        expect(mockPush).not.toHaveBeenCalled();
      });

      it('Priority 2: should close highlight note modal without exiting', async () => {
        const wrapper = mountReaderPage();
        await wrapper.vm.$nextTick();

        const vm = wrapper.vm as any;
        vm.viewportRef = { scale: 1.0, translateX: 0, translateY: 0, resetZoom: vi.fn() };

        const highlightStore = useHighlightStore();
        highlightStore.isNoteModalOpen = true;

        await vm.handleBackButtonPress();

        expect(highlightStore.isNoteModalOpen).toBe(false);
        expect(mockPush).not.toHaveBeenCalled();
      });

      it('Priority 2: should close notes drawer without exiting', async () => {
        const wrapper = mountReaderPage();
        await wrapper.vm.$nextTick();

        const vm = wrapper.vm as any;
        vm.viewportRef = { scale: 1.0, translateX: 0, translateY: 0, resetZoom: vi.fn() };

        const highlightStore = useHighlightStore();
        highlightStore.isNotesDrawerOpen = true;

        await vm.handleBackButtonPress();

        expect(highlightStore.isNotesDrawerOpen).toBe(false);
        expect(mockPush).not.toHaveBeenCalled();
      });

      it('Priority 2: should close AI sheet without exiting', async () => {
        const wrapper = mountReaderPage();
        await wrapper.vm.$nextTick();

        const vm = wrapper.vm as any;
        vm.viewportRef = { scale: 1.0, translateX: 0, translateY: 0, resetZoom: vi.fn() };

        const aiStore = useAiStore();
        aiStore.isSheetOpen = true;

        await vm.handleBackButtonPress();

        expect(aiStore.isSheetOpen).toBe(false);
        expect(mockPush).not.toHaveBeenCalled();
      });

      it('Priority 2: should clear text selection without exiting', async () => {
        const wrapper = mountReaderPage();
        await wrapper.vm.$nextTick();

        const vm = wrapper.vm as any;
        vm.viewportRef = { scale: 1.0, translateX: 0, translateY: 0, resetZoom: vi.fn() };

        const readerStore = useReaderStore();
        readerStore.setSelection({
          text: 'selected word',
          x: 100,
          y: 200,
          width: 50,
          height: 20,
        });

        await vm.handleBackButtonPress();

        expect(readerStore.selection).toBeNull();
        expect(mockPush).not.toHaveBeenCalled();
      });

      it('Priority 3: should exit reader when at default zoom with no active overlays', async () => {
        window.history.replaceState({ back: null }, '');

        const wrapper = mountReaderPage();
        await wrapper.vm.$nextTick();

        const vm = wrapper.vm as any;
        vm.viewportRef = { scale: 1.0, translateX: 0, translateY: 0, resetZoom: vi.fn() };

        await vm.handleBackButtonPress();

        expect(mockCloseBook).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith('/');
      });

      it('should register backButton listener on mount and remove it on unmount', async () => {
        const mockListenerRemove = vi.fn().mockResolvedValue(undefined);
        mockApp.addListener.mockResolvedValueOnce({
          remove: mockListenerRemove,
        });

        const wrapper = mountReaderPage();
        await wrapper.vm.$nextTick();

        expect(mockApp.addListener).toHaveBeenCalledWith('backButton', expect.any(Function));

        wrapper.unmount();
        await wrapper.vm.$nextTick();

        expect(mockListenerRemove).toHaveBeenCalledTimes(1);
      });
    });
  });
});
