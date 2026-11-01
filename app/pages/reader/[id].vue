<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { useLibraryStore } from '../../stores/libraryStore';
import { useReaderStore } from '../../stores/readerStore';
import { useHighlightStore } from '../../stores/highlightStore';
import { useReader } from '../../composables/useReader';
import { useBookSync } from '../../composables/useBookSync';
import { useAppLifecycle } from '../../composables/useAppLifecycle';
import { useTextSelection } from '../../composables/useTextSelection';
import { TranslationService } from '../../services/translation/TranslationService';
import type { TranslationResult } from '../../types';
import ReaderViewport from '../../components/reader/ReaderViewport.vue';
import ReaderOverlayControls from '../../components/reader/ReaderOverlayControls.vue';
import ThemeSettingsSheet from '../../components/reader/ThemeSettingsSheet.vue';
import ReaderSelectionBar from '../../components/reader/ReaderSelectionBar.vue';
import TranslationBottomSheet from '../../components/translation/TranslationBottomSheet.vue';
import HighlightNoteModal from '../../components/reader/HighlightNoteModal.vue';
import BookNotesDrawer from '../../components/reader/BookNotesDrawer.vue';
import QuoteCardModal from '../../components/export/QuoteCardModal.vue';
import NotesExportModal from '../../components/export/NotesExportModal.vue';
import AiAssistantSheet from '../../components/ai/AiAssistantSheet.vue';
import AiSettingsModal from '../../components/ai/AiSettingsModal.vue';
import TtsPlayerBar from '../../components/reader/TtsPlayerBar.vue';
import { useAiStore } from '../../stores/aiStore';
import { useTtsStore } from '../../stores/ttsStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useAiReader } from '../../composables/useAiReader';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const libraryStore = useLibraryStore();
const readerStore = useReaderStore();
const settingsStore = useSettingsStore();
const highlightStore = useHighlightStore();
const aiStore = useAiStore();
const ttsStore = useTtsStore();
const { triggerChapterTldr } = useAiReader();
const {
  openBook,
  nextPage,
  prevPage,
  goToLocator,
  goToPage,
  setPaginationMode,
  applyTheme,
  applyFontSize,
  closeBook,
  activeEngine,
} = useReader();
const { queueProgress } = useBookSync();
const { enableKeepAwake, disableKeepAwake } = useAppLifecycle();
const { clearSelection, bindIframeSelection } = useTextSelection();
const translationService = TranslationService.getInstance();

watch(
  () => readerStore.currentThemeColors,
  (colors) => {
    applyTheme(colors);
  },
  { deep: true },
);

watch(
  () => readerStore.settings.fontSize,
  (newSize) => {
    void applyFontSize(newSize);
  },
);

watch(
  () => highlightStore.highlights,
  (newHighlights) => {
    activeEngine.value?.setHighlights?.(newHighlights, (hl) => {
      highlightStore.selectedHighlight = hl;
    });
  },
  { deep: true },
);

const viewportRef = ref<InstanceType<typeof ReaderViewport> | null>(null);
const isSettingsOpen = ref(false);
const isTranslationOpen = ref(false);
const activeTranslationResult = ref<TranslationResult | null>(null);
const isNavigating = ref(false);
let backButtonListener: PluginListenerHandle | null = null;

const bookId = route.params.id as string;

onMounted(async () => {
  try {
    backButtonListener = await App.addListener('backButton', () => {
      handleBackButtonPress();
    });
  } catch (err) {
    console.warn('[Reader] Capacitor App backButton listener registration failed:', err);
  }

  await settingsStore.enterReader();
  await libraryStore.loadBooks();
  const book = libraryStore.books.find((b) => b.id === bookId);

  if (!book) {
    router.replace('/');
    return;
  }

  highlightStore.setBookContext(book.id, book.title, book.author, book.format);
  await highlightStore.loadHighlights(book.id);
  aiStore.checkInactivityCatchUp(book.last_read_at);

  await nextTick();

  if (viewportRef.value?.containerRef) {
    let rawData: Uint8Array | ArrayBuffer | string = '';
    try {
      const fileRes = await Filesystem.readFile({
        path: book.file_path,
        directory: Directory.Data,
      });

      if (typeof fileRes.data === 'string') {
        const base64Clean = fileRes.data.includes(',') ? fileRes.data.split(',')[1] : fileRes.data;
        const binary = atob(base64Clean);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        rawData = bytes;
      } else if (typeof Blob !== 'undefined' && fileRes.data instanceof Blob) {
        const arrayBuf = await fileRes.data.arrayBuffer();
        rawData = new Uint8Array(arrayBuf);
      } else {
        rawData = fileRes.data;
      }
    } catch (readErr) {
      console.warn('[Reader] Failed to read book from filesystem, using fallback sample:', readErr);
      if (book.format === 'fb2') {
        rawData = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description><title-info><book-title>${book.title}</book-title></title-info></description>
  <body>
    <section>
      <title><p>${book.title}</p></title>
      <p>Welcome to reading ${book.title}. This is a generated sample text view for demonstration.</p>
    </section>
  </body>
</FictionBook>`;
      } else if (book.format === 'pdf') {
        const minimalPdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R/Resources<<>>>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
178
%%EOF`;
        rawData = new TextEncoder().encode(minimalPdf);
      } else {
        rawData = new Uint8Array([0, 1, 2, 3]);
      }
    }

    try {
      await openBook(viewportRef.value.containerRef, book, rawData);
      activeEngine.value?.setHighlights?.(highlightStore.highlights, (hl) => {
        highlightStore.selectedHighlight = hl;
      });

      if (activeEngine.value) {
        const engineAny = activeEngine.value as any;
        engineAny.onCenterTap = () => {
          handleCenterTap();
        };
        if (typeof engineAny.onIframeReady !== 'undefined') {
          engineAny.onIframeReady = (iframe: HTMLIFrameElement) => {
            bindIframeSelection(iframe);
          };
        }
        if (typeof engineAny.onSelectionChange !== 'undefined') {
          engineAny.onSelectionChange = (detail: { text: string; locator?: string }) => {
            readerStore.setSelection({
              text: detail.text,
              x: 0,
              y: 0,
              width: 0,
              height: 0,
            });
            if (detail.locator) {
              highlightStore.setActiveSelection({
                text: detail.text,
                locator: detail.locator,
                format: (book.format || 'epub') as any,
                x: 0,
                y: 0,
              });
            }
          };
        }
      }
    } catch (openErr) {
      console.error('[Reader] Failed to open book:', openErr);
    }
  }
});

onUnmounted(async () => {
  if (backButtonListener) {
    try {
      await backButtonListener.remove();
    } catch {}
    backButtonListener = null;
  }
  const isTtsPlaying = ttsStore.isPlaying;
  if (!isTtsPlaying) {
    try {
      await ttsStore.stop();
    } catch {}
  }
  activeEngine.value?.clearTtsHighlight?.();
  await settingsStore.leaveReader(isTtsPlaying);
  readerStore.clearReflowCache();
  closeBook();
});

const handleCloseReader = async (): Promise<void> => {
  if (isNavigating.value) return;
  isNavigating.value = true;

  try {
    const isTtsPlaying = ttsStore.isPlaying;
    if (!isTtsPlaying) {
      try {
        await ttsStore.stop();
      } catch {}
    }
    activeEngine.value?.clearTtsHighlight?.();
    await settingsStore.leaveReader(isTtsPlaying);

    // 1. Save reading progress to store, SQLite, and sync queue before navigating
    if (activeEngine.value && readerStore.currentBook) {
      try {
        const location = activeEngine.value.getCurrentLocation();
        if (location) {
          readerStore.updateLocation(location);
          await libraryStore.updateProgress(
            readerStore.currentBook.id,
            location.locator,
            location.progressPercentage,
          );
          await queueProgress(
            readerStore.currentBook.id,
            location.locator,
            location.progressPercentage,
          );
        }
      } catch (saveErr) {
        console.warn('[Reader] Failed to persist progress before exit:', saveErr);
      }
    }

    // 2. Resource cleanup
    readerStore.clearReflowCache();
    closeBook();

    // 3. Route navigation fallback
    if (typeof window !== 'undefined' && window.history.state?.back) {
      router.back();
    } else {
      await router.push('/');
    }
  } catch (err) {
    console.error('[Reader] Navigation failed during reader close:', err);
    try {
      await router.push('/');
    } catch {}
  }
};

const handleBackButtonPress = async (): Promise<void> => {
  // Priority 1: Reset zoom & pan if page is zoomed
  if (viewportRef.value) {
    const isZoomed = viewportRef.value.scale > 1.01;
    const isPanned =
      Math.abs(viewportRef.value.translateX) > 1 || Math.abs(viewportRef.value.translateY) > 1;
    if (isZoomed || isPanned) {
      viewportRef.value.resetZoom();
      return;
    }
  }

  // Priority 2: Dismiss active overlays, modals, and sheets
  if (isSettingsOpen.value) {
    isSettingsOpen.value = false;
    return;
  }
  if (isTranslationOpen.value) {
    handleCloseTranslation();
    return;
  }
  if (highlightStore.isNoteModalOpen) {
    highlightStore.closeNoteModal();
    return;
  }
  if (highlightStore.isQuoteCardModalOpen) {
    highlightStore.closeQuoteCardModal();
    return;
  }
  if (highlightStore.isExportModalOpen) {
    highlightStore.closeExportModal();
    return;
  }
  if (highlightStore.isNotesDrawerOpen) {
    highlightStore.closeNotesDrawer();
    return;
  }
  if (highlightStore.selectedHighlight) {
    highlightStore.selectedHighlight = null;
    return;
  }
  if (aiStore.isSheetOpen) {
    aiStore.closeSheet();
    return;
  }
  if (aiStore.isSettingsModalOpen) {
    aiStore.closeSettingsModal();
    return;
  }
  if (aiStore.isOnboardingModalOpen) {
    aiStore.closeOnboardingModal();
    return;
  }
  if (aiStore.showInactivityBanner) {
    aiStore.dismissInactivityBanner();
    return;
  }
  if (readerStore.selection) {
    clearSelection();
    return;
  }

  // Priority 3: Reader Exit
  await handleCloseReader();
};

const handleCenterTap = () => {
  if (readerStore.selection || highlightStore.activeSelection || highlightStore.selectedHighlight) {
    clearSelection();
    highlightStore.setActiveSelection(null);
    highlightStore.selectedHighlight = null;
    return;
  }
  readerStore.toggleImmersiveMode();
};

const handleOpenSettings = () => {
  isSettingsOpen.value = true;
};

const handleCloseSettings = () => {
  isSettingsOpen.value = false;
};

const handleTranslate = async (text: string) => {
  try {
    const res = await translationService.translateText(text, 'uk');
    activeTranslationResult.value = res;
    isTranslationOpen.value = true;
    clearSelection();
  } catch {}
};

const handleCloseTranslation = () => {
  isTranslationOpen.value = false;
  activeTranslationResult.value = null;
};

const startTtsForCurrentPage = async (startIndex: number = 0): Promise<void> => {
  if (!activeEngine.value) return;

  const rawText = await activeEngine.value.getCurrentPageText?.();
  if (!rawText || !rawText.trim()) {
    await ttsStore.stop();
    return;
  }

  await ttsStore.startPageTts(rawText, startIndex, {
    onSentenceChange: (sentence) => {
      activeEngine.value?.highlightTtsSentence?.(sentence.text, sentence.index);
    },
    onPageFinished: async () => {
      const loc = activeEngine.value?.getCurrentLocation();
      const currentPage = loc?.currentPage || 1;
      const totalPages = loc?.totalPages || 1;

      if (currentPage < totalPages) {
        await nextPage();
        await nextTick();
        setTimeout(async () => {
          if (ttsStore.isPlaying) {
            await startTtsForCurrentPage(0);
          }
        }, 150);
      } else {
        await ttsStore.stop();
        activeEngine.value?.clearTtsHighlight?.();
      }
    },
  });
};

const handleToggleTts = async (): Promise<void> => {
  if (ttsStore.isActive) {
    if (ttsStore.isPlaying) {
      await ttsStore.pause();
    } else {
      await ttsStore.resume();
    }
  } else {
    await startTtsForCurrentPage(0);
  }
};

const handleNextPage = async (): Promise<void> => {
  const wasPlaying = ttsStore.isPlaying;
  activeEngine.value?.clearTtsHighlight?.();
  await nextPage();
  if (wasPlaying) {
    await nextTick();
    setTimeout(() => {
      startTtsForCurrentPage(0);
    }, 150);
  }
};

const handlePrevPage = async (): Promise<void> => {
  const wasPlaying = ttsStore.isPlaying;
  activeEngine.value?.clearTtsHighlight?.();
  await prevPage();
  if (wasPlaying) {
    await nextTick();
    setTimeout(() => {
      startTtsForCurrentPage(0);
    }, 150);
  }
};

const handleNavigatePage = async (page: number): Promise<void> => {
  const wasPlaying = ttsStore.isPlaying;
  activeEngine.value?.clearTtsHighlight?.();
  await goToPage(page);
  if (wasPlaying) {
    await nextTick();
    setTimeout(() => {
      startTtsForCurrentPage(0);
    }, 150);
  }
};

defineExpose({
  viewportRef,
  isNavigating,
  handleCloseReader,
  handleBackButtonPress,
});
</script>

<template>
  <div class="fixed inset-0 h-full w-full select-text overflow-hidden bg-black">
    <ReaderViewport
      ref="viewportRef"
      :active-engine="activeEngine"
      @center-tap="handleCenterTap"
      @next="handleNextPage"
      @prev="handlePrevPage"
    />

    <ReaderOverlayControls
      @back="handleCloseReader"
      @next="handleNextPage"
      @prev="handlePrevPage"
      @navigate="handleNavigatePage"
      @open-settings="handleOpenSettings"
      @open-notes="highlightStore.openNotesDrawer"
      @chapter-tldr="triggerChapterTldr"
      @toggle-tts="handleToggleTts"
    />

    <TtsPlayerBar />

    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="-translate-y-4 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="aiStore.showInactivityBanner"
        class="fixed left-4 right-4 top-16 z-40 mx-auto max-w-lg rounded-2xl border border-gray-200 bg-white p-3.5 shadow-xl dark:border-[#C8E695]/30 dark:bg-zinc-900"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-xl bg-[#C8E695] text-[#3E5725]"
            >
              <svg
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div>
              <p class="text-xs font-bold text-gray-900 dark:text-[#C8E695]">
                {{ t('ai.inactivityCatchupTitle') }}
              </p>
              <p class="text-[11px] text-gray-600 dark:text-zinc-400">
                {{ t('ai.inactivityCatchupMessage') }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="rounded-xl bg-[#3E5725] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#3E5725]/90 active:scale-95 dark:bg-[#C8E695] dark:text-[#3E5725]"
              @click="
                triggerChapterTldr();
                aiStore.dismissInactivityBanner();
              "
            >
              {{ t('ai.viewCatchup') }}
            </button>
            <button
              type="button"
              class="rounded-lg p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              @click="aiStore.dismissInactivityBanner"
            >
              <svg
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <ThemeSettingsSheet
      :is-open="isSettingsOpen"
      @close="handleCloseSettings"
      @change-pagination="setPaginationMode"
    />

    <ReaderSelectionBar @translate="handleTranslate" />

    <TranslationBottomSheet
      :is-open="isTranslationOpen"
      :result="activeTranslationResult"
      :book-id="bookId"
      @close="handleCloseTranslation"
    />

    <HighlightNoteModal />

    <BookNotesDrawer @navigate="goToLocator" />

    <QuoteCardModal />

    <NotesExportModal />

    <AiAssistantSheet />

    <AiSettingsModal
      :is-open="aiStore.isSettingsModalOpen"
      @close="aiStore.closeSettingsModal"
    />
  </div>
</template>
