<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useReaderStore } from '../../stores/readerStore';
import { usePinchZoom } from '../../composables/usePinchZoom';
import { useTextSelection } from '../../composables/useTextSelection';
import { shouldIgnoreReaderTap } from '../../services/selection/SelectionGuard';
import PdfViewer from './PdfViewer.vue';
import type { ZoomableContainerElement } from '../../types';

const props = defineProps<{
  onZoomRender?: (scale: number) => Promise<void> | void;
  activeEngine?: any;
}>();

const emit = defineEmits<{
  (e: 'center-tap'): void;
  (e: 'next'): void;
  (e: 'prev'): void;
}>();

const readerStore = useReaderStore();
const { handleReaderTap } = useTextSelection();
const viewportWrapperRef = ref<HTMLElement | null>(null);
const gestureTargetRef = ref<HTMLElement | null>(null);
const containerRef = ref<ZoomableContainerElement | null>(null);

const {
  scale,
  cssScale,
  translateX,
  translateY,
  isAnimating,
  resetZoom,
  didInteractRecently,
  bindTouchSource,
} = usePinchZoom(viewportWrapperRef, gestureTargetRef, {
  minScale: 1.0,
  maxScale: 4.0,
  doubleTapScale: 2.5,
  doubleTapDelayMs: 300,
  debounceMs: 200,
  getContentSize: () => {
    if (readerStore.currentBook?.format === 'pdf' && readerStore.isReflowMode) return null;
    return containerRef.value?.__readerGetContentSize?.() ?? null;
  },
  // Visual viewport zoom is decoupled from engine re-rendering across all formats.
  // Zoom gestures scale content purely via GPU-accelerated CSS transform without re-rendering.
  isRenderZoomSupported: () => false,
  onZoomRender: undefined,
  onSwipeNext: () => {
    // A horizontal drag while extending a text selection must not turn the page.
    if (shouldIgnoreReaderTap()) return;
    emit('next');
  },
  onSwipePrev: () => {
    if (shouldIgnoreReaderTap()) return;
    emit('prev');
  },
});

onMounted(() => {
  if (containerRef.value) {
    containerRef.value.__onEngineResetZoom = () => {
      resetZoom(true);
    };
    containerRef.value.__readerBindTouchSource = bindTouchSource;
    containerRef.value.__readerCanRenderZoom = () => false;
  }
});

watch(
  () => [readerStore.locator, readerStore.currentPage],
  () => {
    resetZoom(true);
  },
);

const themeColors = computed(() => readerStore.currentThemeColors);

const viewportStyle = computed(() => ({
  backgroundColor: themeColors.value.bg,
  color: themeColors.value.text,
  fontSize: `${readerStore.settings.fontSize}px`,
  lineHeight: `${readerStore.settings.lineHeight}`,
  fontFamily:
    readerStore.settings.fontFamily === 'serif'
      ? 'ui-serif, Georgia, Cambria, serif'
      : 'ui-sans-serif, system-ui, sans-serif',
  touchAction: 'none',
}));

const containerPaddingStyle = {
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
};

const containerTransformStyle = computed(() => ({
  transform: `translate3d(${translateX.value}px, ${translateY.value}px, 0) scale(${cssScale.value})`,
  transformOrigin: 'center center',
  transition: isAnimating.value ? 'transform 250ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
  willChange: 'transform',
}));

const handleContainerClick = (event: MouseEvent) => {
  if (didInteractRecently() || scale.value > 1.0) {
    return;
  }

  const target = event.target as HTMLElement | null;
  if (target?.closest('button') || target?.closest('a')) {
    return;
  }

  const width = window.innerWidth;
  const clickX = event.clientX;
  const isCenter = clickX > width * 0.2 && clickX < width * 0.8;

  // Selection-aware guard: ignores the synthetic click fired after a selection gesture,
  // and turns a plain tap into a (verified) dismissal while the selection bar is shown.
  handleReaderTap(() => {
    if (isCenter) {
      emit('center-tap');
    }
  });
};

defineExpose({
  containerRef,
  resetZoom,
  scale,
  cssScale,
  translateX,
  translateY,
});
</script>

<template>
  <div
    ref="viewportWrapperRef"
    data-testid="reader-viewport"
    :data-rendering="readerStore.isRendering ? 'true' : 'false'"
    :data-scale="scale"
    class="relative w-full h-full overflow-hidden select-text transition-colors duration-200 touch-none"
    :style="viewportStyle"
    @click="handleContainerClick"
  >
    <!-- Everything inside the gesture target (engine content and PDF reflow layer) zooms together. -->
    <div
      ref="gestureTargetRef"
      data-testid="reader-gesture-target"
      class="relative w-full h-full"
      :style="containerTransformStyle"
    >
      <div
        ref="containerRef"
        data-testid="reader-engine-container"
        class="w-full h-full flex flex-col items-center justify-center overflow-auto"
        :style="containerPaddingStyle"
      />

      <!-- Reflow Mode Layer for PDF -->
      <div
        v-if="readerStore.currentBook?.format === 'pdf' && readerStore.isReflowMode"
        data-testid="reflow-viewport-layer"
        class="absolute inset-0 z-20 w-full h-full"
      >
        <PdfViewer
          :active-engine="props.activeEngine"
          :page-number="readerStore.currentPage"
          @next="emit('next')"
          @prev="emit('prev')"
          @center-tap="emit('center-tap')"
        />
      </div>
    </div>

    <div
      v-if="readerStore.isRendering"
      class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/10 backdrop-blur-[1px]"
    >
      <div class="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
    </div>
  </div>
</template>
