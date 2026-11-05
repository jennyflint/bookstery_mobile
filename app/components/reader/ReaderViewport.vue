<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useReaderStore } from '../../stores/readerStore';
import { usePinchZoom } from '../../composables/usePinchZoom';
import { useTextSelection } from '../../composables/useTextSelection';
import { shouldIgnoreReaderTap } from '../../services/selection/SelectionGuard';
import PdfViewer from './PdfViewer.vue';
import type { ZoomableContainerElement, ReaderEngineInterface } from '../../types';

const props = defineProps<{
  onZoomRender?: (scale: number) => Promise<void> | void;
  activeEngine?: ReaderEngineInterface | null;
}>();

const emit = defineEmits<{
  (e: 'center-tap'): void;
  (e: 'next'): void;
  (e: 'prev'): void;
}>();

const readerStore = useReaderStore();
const { handleReaderTap } = useTextSelection();
const viewportWrapperRef = ref<HTMLElement | null>(null);
const scrollContainerRef = ref<HTMLElement | null>(null);
const zoomSizerRef = ref<HTMLElement | null>(null);
const gestureTargetRef = ref<HTMLElement | null>(null);
const containerRef = ref<ZoomableContainerElement | null>(null);

const {
  scale,
  cssScale,
  translateX,
  translateY,
  isAnimating,
  resetZoom,
  setZoom,
  zoomIn,
  zoomOut,
  didInteractRecently,
  bindTouchSource,
} = usePinchZoom(viewportWrapperRef, gestureTargetRef, {
  minScale: 0.5,
  maxScale: 4.0,
  doubleTapScale: 2.5,
  doubleTapDelayMs: 300,
  debounceMs: 200,
  getContentSize: () => {
    if (readerStore.currentBook?.format === 'pdf' && readerStore.isReflowMode) {
      const reflowEl = document.querySelector(
        '[data-testid="pdf-reflow-view"]',
      ) as HTMLElement | null;
      if (reflowEl) {
        return {
          width: Math.max(reflowEl.scrollWidth, reflowEl.clientWidth),
          height: Math.max(reflowEl.scrollHeight, reflowEl.clientHeight),
        };
      }
      return null;
    }
    const engineSize = containerRef.value?.__readerGetContentSize?.();
    if (engineSize) return engineSize;
    const child = containerRef.value?.firstElementChild as HTMLElement | null;
    if (child && child.offsetWidth > 0 && child.offsetHeight > 0) {
      return { width: child.offsetWidth, height: child.offsetHeight };
    }
    return null;
  },
  getScrollContainer: () => {
    if (readerStore.currentBook?.format === 'pdf' && readerStore.isReflowMode) {
      const reflowEl = document.querySelector(
        '[data-testid="pdf-reflow-view"]',
      ) as HTMLElement | null;
      if (reflowEl && reflowEl.scrollHeight > reflowEl.clientHeight) return reflowEl;
    }
    const engineContainer = containerRef.value;
    if (!engineContainer) return null;
    const engineScrollEl = engineContainer.__readerGetScrollContainer?.();
    if (engineScrollEl) return engineScrollEl;

    const inner = engineContainer.querySelector<HTMLElement>(
      '.pdf-scroll-container, .fb2-document-wrapper, .mobi-document-wrapper, .djvu-scroll-container, .epub-container',
    );
    if (inner && inner.scrollHeight > inner.clientHeight) return inner;

    const iframe = engineContainer.querySelector<HTMLIFrameElement>('iframe');
    if (iframe) {
      try {
        const docEl = iframe.contentDocument?.scrollingElement as HTMLElement | null;
        if (docEl && docEl.scrollHeight > docEl.clientHeight) return docEl;
      } catch {}
    }

    if (engineContainer.scrollHeight > engineContainer.clientHeight) return engineContainer;
    return null;
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

interface ViewportDimensionSnapshot {
  width: number;
  height: number;
  isLandscape: boolean;
}

let lastViewportSize: ViewportDimensionSnapshot | null = null;
let resizeObserver: ResizeObserver | null = null;

const checkOrientationOrResize = (): void => {
  const el = viewportWrapperRef.value;
  const width = el
    ? el.clientWidth || el.getBoundingClientRect?.().width || (typeof window !== 'undefined' ? window.innerWidth : 0)
    : (typeof window !== 'undefined' ? window.innerWidth : 0);
  const height = el
    ? el.clientHeight || el.getBoundingClientRect?.().height || (typeof window !== 'undefined' ? window.innerHeight : 0)
    : (typeof window !== 'undefined' ? window.innerHeight : 0);
  if (width <= 0 || height <= 0) return;

  const isLandscape = width > height;

  if (lastViewportSize) {
    const wasLandscape = lastViewportSize.isLandscape;
    const isOrientationChange = wasLandscape !== isLandscape;
    const isMajorWidthChange = Math.abs(width - lastViewportSize.width) > 40;

    if (isOrientationChange || isMajorWidthChange) {
      resetZoom(true);
      props.activeEngine?.resetZoom?.();
    }
  }

  lastViewportSize = { width, height, isLandscape };
};

const handleOrientationChange = (): void => {
  resetZoom(true);
  props.activeEngine?.resetZoom?.();
  checkOrientationOrResize();
};

onMounted(() => {
  if (containerRef.value) {
    containerRef.value.__onEngineResetZoom = () => {
      resetZoom(true);
    };
    containerRef.value.__readerBindTouchSource = bindTouchSource;
    containerRef.value.__readerCanRenderZoom = () => false;
  }

  checkOrientationOrResize();

  if (typeof window !== 'undefined') {
    window.addEventListener('orientationchange', handleOrientationChange);
  }
  if (typeof screen !== 'undefined' && typeof screen.orientation?.addEventListener === 'function') {
    screen.orientation.addEventListener('change', handleOrientationChange);
  }

  if (typeof ResizeObserver !== 'undefined' && viewportWrapperRef.value) {
    resizeObserver = new ResizeObserver(() => {
      checkOrientationOrResize();
    });
    resizeObserver.observe(viewportWrapperRef.value);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('orientationchange', handleOrientationChange);
  }
  if (typeof screen !== 'undefined' && typeof screen.orientation?.removeEventListener === 'function') {
    screen.orientation.removeEventListener('change', handleOrientationChange);
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  lastViewportSize = null;
});

watch(
  () => [readerStore.locator, readerStore.currentPage],
  () => {
    // In scroll pagination mode, scrolling down continually updates locator and currentPage.
    // Only reset zoom when paginated page turns occur.
    if (readerStore.settings.paginationMode !== 'scroll') {
      resetZoom(true);
    }
  },
);

watch(
  () => readerStore.currentBook?.id,
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

const scrollContainerStyle = computed(() => ({
  touchAction: 'none',
  WebkitOverflowScrolling: 'touch' as const,
}));

const zoomSizerStyle = computed(() => ({
  width: '100%',
  height: '100%',
  margin: '0 auto',
  position: 'relative' as const,
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
  scrollContainerRef,
  zoomSizerRef,
  resetZoom,
  setZoom,
  zoomIn,
  zoomOut,
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
    <!-- Outer Scroll Container (zoom-scroll-container) -->
    <div
      ref="scrollContainerRef"
      data-testid="zoom-scroll-container"
      class="zoom-scroll-container w-full h-full relative overflow-hidden"
      :style="scrollContainerStyle"
    >
      <!-- Middle Layout Sizer (zoom-sizer) -->
      <div
        ref="zoomSizerRef"
        data-testid="zoom-sizer"
        class="zoom-sizer w-full h-full relative"
        :style="zoomSizerStyle"
      >
        <!-- Inner Scaled Content (zoom-content) & Gesture Target -->
        <div
          ref="gestureTargetRef"
          data-testid="reader-gesture-target"
          data-testid-alias="zoom-content"
          class="zoom-content relative w-full h-full"
          :style="containerTransformStyle"
        >
          <div
            ref="containerRef"
            data-testid="reader-engine-container"
            class="w-full max-w-full min-w-0 h-full flex flex-col items-center justify-center overflow-auto"
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
              :zoom-scale="scale"
              @next="emit('next')"
              @prev="emit('prev')"
              @center-tap="emit('center-tap')"
            />
          </div>
        </div>
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
