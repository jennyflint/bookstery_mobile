<script setup lang="ts">
import { computed, onBeforeUnmount, onDeactivated, watch } from 'vue';
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
  zoomScale?: number;
  baseWidth?: number;
  baseHeight?: number;
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

const scale = computed<number>(() => {
  return props.zoomScale ?? 1.0;
});

const sizerStyle = computed(() => {
  if (scale.value > 1.0 && props.baseWidth && props.baseHeight) {
    return {
      width: `${Math.round(props.baseWidth * scale.value)}px`,
      height: `${Math.round(props.baseHeight * scale.value)}px`,
      margin: '0 auto',
      position: 'relative' as const,
    };
  }
  return {
    width: '100%',
    height: '100%',
    margin: '0 auto',
    position: 'relative' as const,
  };
});

const contentStyle = computed(() => {
  if (scale.value > 1.0) {
    return {
      transformOrigin: '0 0',
      transform: `scale(${scale.value})`,
      width: props.baseWidth ? `${props.baseWidth}px` : '100%',
      height: props.baseHeight ? `${props.baseHeight}px` : '100%',
      willChange: 'transform',
    };
  }
  return {
    transformOrigin: '0 0',
    transform: 'scale(1)',
    width: '100%',
    height: '100%',
  };
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

const clearTextSelection = (): void => {
  readerStore.clearTextSelection();
};

onBeforeUnmount(() => {
  clearTextSelection();
});

onDeactivated(() => {
  clearTextSelection();
});

watch(
  () => props.pageNumber,
  (newPage, oldPage) => {
    if (newPage !== oldPage) {
      clearTextSelection();
    }
  },
);

defineExpose({
  clearTextSelection,
});
</script>

<template>
  <div
    data-testid="pdf-viewer"
    class="zoom-scroll-container relative w-full max-w-full min-w-0 h-full overflow-auto select-text flex flex-col items-center justify-center"
    style="contain: layout paint; backface-visibility: hidden; -webkit-backface-visibility: hidden; will-change: transform; touch-action: pan-x pan-y; -webkit-overflow-scrolling: touch;"
  >
    <!-- Reflow Mode -->
    <PdfReflowView
      v-if="isReflow"
      :pdf-document="pdfDocument"
      :active-engine="activeEngine"
      :page-number="pageNumber ?? readerStore.currentPage"
      :zoom-scale="scale"
      @next="forwardNext"
      @prev="forwardPrev"
      @center-tap="forwardCenterTap"
    />

    <!-- Standard Canvas / Slot Mode -->
    <div
      v-else
      data-testid="zoom-sizer"
      class="zoom-sizer flex items-center justify-center"
      :style="sizerStyle"
    >
      <div
        data-testid="zoom-content"
        class="zoom-content flex items-center justify-center"
        :style="contentStyle"
      >
        <slot />
      </div>
    </div>
  </div>
</template>
