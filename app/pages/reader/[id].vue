<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { useLibraryStore } from '../../stores/libraryStore';
import { useReaderStore } from '../../stores/readerStore';
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

const route = useRoute();
const router = useRouter();
const libraryStore = useLibraryStore();
const readerStore = useReaderStore();
const { openBook, nextPage, prevPage, setPaginationMode, applyTheme, closeBook } = useReader();
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
    />

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
  </div>
</template>
