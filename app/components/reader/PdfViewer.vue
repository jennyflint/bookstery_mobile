<script setup lang="ts">
import { computed } from 'vue';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { useReaderStore } from '../../stores/readerStore';
import PdfReflowView from './PdfReflowView.vue';

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
</script>

<template>
  <div data-testid="pdf-viewer" class="relative w-full h-full overflow-hidden select-text">
    <!-- Reflow Mode -->
    <PdfReflowView
      v-if="isReflow"
      :pdf-document="pdfDocument"
      :active-engine="activeEngine"
      :page-number="pageNumber ?? readerStore.currentPage"
      @next="emit('next')"
      @prev="emit('prev')"
      @center-tap="emit('center-tap')"
    />

    <!-- Standard Canvas / Slot Mode -->
    <slot v-else />
  </div>
</template>
