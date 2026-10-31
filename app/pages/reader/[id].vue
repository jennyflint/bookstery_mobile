<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { useLibraryStore } from '../../stores/libraryStore';
import { useReaderStore } from '../../stores/readerStore';
import { useHighlightStore } from '../../stores/highlightStore';
import { useReader } from '../../composables/useReader';
import { useAppLifecycle } from '../../composables/useAppLifecycle';
import { useTextSelection } from '../../composables/useTextSelection';
import { TranslationService } from '../../services/translation/TranslationService';
import type { TranslationResult } from '../../types';
import ReaderViewport from '../../components/reader/ReaderViewport.vue';
import ReaderOverlayControls from '../../components/reader/ReaderOverlayControls.vue';
import ThemeSettingsSheet from '../../components/reader/ThemeSettingsSheet.vue';
import TextSelectionTooltip from '../../components/reader/TextSelectionTooltip.vue';
import TranslationBottomSheet from '../../components/translation/TranslationBottomSheet.vue';
import HighlightNoteModal from '../../components/reader/HighlightNoteModal.vue';
import BookNotesDrawer from '../../components/reader/BookNotesDrawer.vue';
import QuoteCardModal from '../../components/export/QuoteCardModal.vue';
import NotesExportModal from '../../components/export/NotesExportModal.vue';
import AiAssistantSheet from '../../components/ai/AiAssistantSheet.vue';
import AiSettingsModal from '../../components/ai/AiSettingsModal.vue';
import { useAiStore } from '../../stores/aiStore';
import { useAiReader } from '../../composables/useAiReader';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const libraryStore = useLibraryStore();
const readerStore = useReaderStore();
const highlightStore = useHighlightStore();
const aiStore = useAiStore();
const { triggerChapterTldr } = useAiReader();
const { openBook, nextPage, prevPage, goToLocator, setPaginationMode, applyTheme, closeBook, activeEngine } = useReader();
const { enableKeepAwake, disableKeepAwake } = useAppLifecycle();
const { clearSelection } = useTextSelection();
const translationService = TranslationService.getInstance();

watch(
  () => readerStore.currentThemeColors,
  (colors) => {
    applyTheme(colors);
  },
  { deep: true },
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

const bookId = route.params.id as string;

onMounted(async () => {
  await enableKeepAwake();
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
        const base64Clean = fileRes.data.includes(',')
          ? fileRes.data.split(',')[1]
          : fileRes.data;
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
      activeEngine.value?.setHighlights?.(
        highlightStore.highlights,
        (hl) => {
          highlightStore.selectedHighlight = hl;
        },
      );
    } catch (openErr) {
      console.error('[Reader] Failed to open book:', openErr);
    }
  }
});

onUnmounted(async () => {
  await disableKeepAwake();
  closeBook();
});

const handleBack = () => {
  router.push('/');
};

const handleCenterTap = () => {
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
  } catch {
  }
};

const handleCloseTranslation = () => {
  isTranslationOpen.value = false;
  activeTranslationResult.value = null;
};
</script>

<template>
  <div class="fixed inset-0 w-full h-full overflow-hidden bg-black select-text">
    <ReaderViewport
      ref="viewportRef"
      @center-tap="handleCenterTap"
    />

    <ReaderOverlayControls
      @back="handleBack"
      @next="nextPage"
      @prev="prevPage"
      @open-settings="handleOpenSettings"
      @open-notes="highlightStore.openNotesDrawer"
      @chapter-tldr="triggerChapterTldr"
    />

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
        class="fixed top-16 left-4 right-4 z-40 mx-auto max-w-lg rounded-2xl border border-[#3E5725]/30 bg-[#F4ECD8] p-3.5 shadow-xl backdrop-blur-md dark:border-[#C8E695]/30 dark:bg-zinc-900"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-[#C8E695] text-[#3E5725]">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <p class="text-xs font-bold text-[#3E5725] dark:text-[#C8E695]">
                {{ t('ai.inactivityCatchupTitle') }}
              </p>
              <p class="text-[11px] text-zinc-600 dark:text-zinc-400">
                {{ t('ai.inactivityCatchupMessage') }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="rounded-xl bg-[#3E5725] px-3 py-1.5 text-xs font-bold text-[#F4ECD8] shadow-sm transition hover:bg-[#3E5725]/90 active:scale-95 dark:bg-[#C8E695] dark:text-[#3E5725]"
              @click="triggerChapterTldr(); aiStore.dismissInactivityBanner()"
            >
              {{ t('ai.viewCatchup') }}
            </button>
            <button
              type="button"
              class="rounded-lg p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              @click="aiStore.dismissInactivityBanner"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
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

    <TextSelectionTooltip
      @translate="handleTranslate"
    />

    <TranslationBottomSheet
      :is-open="isTranslationOpen"
      :result="activeTranslationResult"
      :book-id="bookId"
      @close="handleCloseTranslation"
    />

    <HighlightNoteModal />

    <BookNotesDrawer
      @navigate="goToLocator"
    />

    <QuoteCardModal />

    <NotesExportModal />

    <AiAssistantSheet />

    <AiSettingsModal
      :is-open="aiStore.isSettingsModalOpen"
      @close="aiStore.closeSettingsModal"
    />
  </div>
</template>
