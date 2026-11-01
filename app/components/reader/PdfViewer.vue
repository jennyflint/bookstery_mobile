<script setup lang="ts">
import { computed } from 'vue';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { useReaderStore } from '../../stores/readerStore';
import PdfReflowView from './PdfReflowView.vue';
import { shouldIgnoreReaderTap } from '../../services/selection/SelectionGuard';

const props = defineProps<{
  pdfDocument?: PDFDocumentProxy | null;
  activeEngine?: {
    getPdfDocument?: () => PDFDocumentProxy | null;
    getPageProxy?: (page: number) => Promise<PDFPageProxy | null>;
  } | null;
  pageNumber?: number;
}>();

const emit = defineEmits<{
  (e: 'next'): void;
  (e: 'prev'): void;
  (e: 'center-tap'): void;
}>();

const readerStore = useReaderStore();

const isReflow = computed<boolean>(() => {
  return readerStore.isReflowMode;
});

/*
 * Selection guards: never toggle the UI or turn the page while text is selected
 * or within the short lock window that follows a selection gesture.
 */
const forwardCenterTap = (): void => {
  if (shouldIgnoreReaderTap()) return;
  emit('center-tap');
};

const forwardNext = (): void => {
  if (shouldIgnoreReaderTap()) return;
  emit('next');
};

const forwardPrev = (): void => {
  if (shouldIgnoreReaderTap()) return;
  emit('prev');
};
</script>

<template>
  <div
    data-testid="pdf-viewer"
    class="relative w-full max-w-full min-w-0 h-full overflow-auto select-text flex flex-col items-center justify-center"
    style="contain: layout paint; backface-visibility: hidden; -webkit-backface-visibility: hidden; will-change: transform;"
  >
    <!-- Reflow Mode -->
    <PdfReflowView
      v-if="isReflow"
      :pdf-document="pdfDocument"
      :active-engine="activeEngine"
      :page-number="pageNumber ?? readerStore.currentPage"
      @next="forwardNext"
      @prev="forwardPrev"
      @center-tap="forwardCenterTap"
    />

    <!-- Standard Canvas / Slot Mode -->
    <slot v-else />
  </div>
</template>
