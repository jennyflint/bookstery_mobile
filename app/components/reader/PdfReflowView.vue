<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { useReaderStore } from '../../stores/readerStore';
import { useTextSelection } from '../../composables/useTextSelection';
import { shouldIgnoreReaderTap } from '../../services/selection/SelectionGuard';
import { extractReflowBlocks } from '../../utils/pdfReflowParser';
import type { ReflowBlock } from '../../types/reflow';

const props = defineProps<{
  pdfDocument?: PDFDocumentProxy | null;
  activeEngine?: {
    getPdfDocument?: () => PDFDocumentProxy | null;
    getPageProxy?: (page: number) => Promise<PDFPageProxy | null>;
  } | null;
  pageNumber?: number;
  zoomScale?: number;
}>();

const emit = defineEmits<{
  (e: 'next'): void;
  (e: 'prev'): void;
  (e: 'center-tap'): void;
}>();

const { t } = useI18n();
const readerStore = useReaderStore();
const { handleReaderTap } = useTextSelection();

const scrollContainerRef = ref<HTMLElement | null>(null);
const fallbackCanvasRef = ref<HTMLCanvasElement | null>(null);

const blocks = ref<ReflowBlock[]>([]);
const isLoading = ref<boolean>(false);
const isScannedFallback = ref<boolean>(false);

const activePageNumber = computed<number>(() => {
  return props.pageNumber ?? readerStore.currentPage ?? 1;
});

const themeClass = computed<string>(() => {
  switch (readerStore.reflowTheme) {
    case 'sepia':
      return 'bg-[#f8f1e3] text-[#433422]';
    case 'dark':
      return 'bg-gray-900 text-gray-100';
    case 'light':
    default:
      return 'bg-white text-gray-900';
  }
});

const typographyStyle = computed(() => {
  const family =
    readerStore.reflowFontFamily === 'sans'
      ? 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      : readerStore.reflowFontFamily === 'mono'
      ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
      : 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';

  const baseFontSize = readerStore.settings?.fontSize ?? readerStore.reflowFontSize ?? 18;

  return {
    fontSize: `${baseFontSize}px`,
    lineHeight: `${readerStore.reflowLineHeight}`,
    fontFamily: family,
  };
});

const heading2Style = computed(() => {
  const baseFontSize = readerStore.settings?.fontSize ?? readerStore.reflowFontSize ?? 18;
  return {
    fontSize: `${Math.round(baseFontSize * 1.35)}px`,
    lineHeight: '1.25',
  };
});

const heading3Style = computed(() => {
  const baseFontSize = readerStore.settings?.fontSize ?? readerStore.reflowFontSize ?? 18;
  return {
    fontSize: `${Math.round(baseFontSize * 1.15)}px`,
    lineHeight: '1.3',
  };
});

async function resolvePageProxy(pageNumber: number): Promise<PDFPageProxy | null> {
  if (props.pdfDocument) {
    return await props.pdfDocument.getPage(pageNumber);
  }
  if (props.activeEngine?.getPageProxy) {
    return await props.activeEngine.getPageProxy(pageNumber);
  }
  if (props.activeEngine?.getPdfDocument) {
    const doc = props.activeEngine.getPdfDocument();
    if (doc) {
      return await doc.getPage(pageNumber);
    }
  }
  return null;
}

async function renderFallback(pageProxy: PDFPageProxy): Promise<void> {
  await nextTick();
  if (!fallbackCanvasRef.value) return;

  try {
    const canvas = fallbackCanvasRef.value;
    const containerWidth = scrollContainerRef.value?.clientWidth || window.innerWidth || 360;
    const unscaledViewport = pageProxy.getViewport({ scale: 1.0 });
    const targetScale = Math.min((containerWidth - 32) / unscaledViewport.width, 2.0);
    const viewport = pageProxy.getViewport({ scale: Math.max(targetScale, 0.5) });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      await pageProxy.render({ canvasContext: ctx, viewport }).promise;
    }
  } catch (renderErr) {
    console.warn('[PdfReflowView] Fallback canvas rendering failed:', renderErr);
  }
}

async function loadPage(pageNumber: number): Promise<void> {
  // Scroll to top upon page transition
  if (scrollContainerRef.value) {
    scrollContainerRef.value.scrollTop = 0;
  }

  // 1. Check in-memory cache
  const cached = readerStore.getCachedReflowBlocks(pageNumber);
  if (cached) {
    blocks.value = cached;
    isScannedFallback.value = cached.length === 0;
    if (isScannedFallback.value) {
      const pageProxy = await resolvePageProxy(pageNumber);
      if (pageProxy) {
        await renderFallback(pageProxy);
      }
    }
    return;
  }

  isLoading.value = true;
  isScannedFallback.value = false;

  try {
    const pageProxy = await resolvePageProxy(pageNumber);
    if (!pageProxy) {
      blocks.value = [];
      isScannedFallback.value = true;
      return;
    }

    const extracted = await extractReflowBlocks(pageProxy, pageNumber);
    readerStore.setCachedReflowBlocks(pageNumber, extracted);
    blocks.value = extracted;

    if (extracted.length === 0) {
      isScannedFallback.value = true;
      await renderFallback(pageProxy);
    }
  } catch (err) {
    console.error('[PdfReflowView] Failed to extract reflow text for page', pageNumber, err);
    blocks.value = [];
    isScannedFallback.value = true;
  } finally {
    isLoading.value = false;
  }
}

// Gesture & pinch-to-zoom handling
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let initialPinchDistance = 0;
let pinchMidpoint = { x: 0, y: 0 };
const localZoomScale = ref<number>(1.0);
const effectiveZoom = computed(() => props.zoomScale ?? localZoomScale.value);

const reflowSizerStyle = computed(() => {
  if (effectiveZoom.value > 1.0) {
    return {
      width: `${Math.round(100 * effectiveZoom.value)}%`,
      minHeight: '100%',
      margin: '0 auto',
      position: 'relative' as const,
    };
  }
  return {
    width: '100%',
    minHeight: '100%',
    position: 'relative' as const,
  };
});

const reflowContentStyle = computed(() => {
  if (effectiveZoom.value > 1.0) {
    return {
      transformOrigin: '0 0',
      transform: `scale(${effectiveZoom.value})`,
      width: `${Math.round(100 / effectiveZoom.value)}%`,
      willChange: 'transform',
    };
  }
  return {
    transformOrigin: '0 0',
    transform: 'scale(1)',
    width: '100%',
  };
});

function handleTouchStart(e: TouchEvent): void {
  if (e.touches.length === 2 && e.touches[0] && e.touches[1]) {
    // 2-finger pinch start: prevent browser-level page zoom
    if (e.cancelable) {
      e.preventDefault();
    }
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    initialPinchDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    pinchMidpoint = {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };
    return;
  }

  if (e.touches.length === 1 && e.touches[0]) {
    // 1-finger touch: DO NOT preventDefault, allowing smooth native scrolling
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }
}

function handleTouchMove(e: TouchEvent): void {
  if (e.touches.length === 2 && e.touches[0] && e.touches[1]) {
    if (e.cancelable) {
      e.preventDefault();
    }
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    if (initialPinchDistance > 0) {
      const container = scrollContainerRef.value;
      const oldScale = effectiveZoom.value;
      const ratio = dist / initialPinchDistance;
      const nextScale = Math.min(Math.max(oldScale * ratio, 1.0), 4.0);

      if (container && oldScale !== nextScale) {
        const rect = container.getBoundingClientRect();
        const midX = pinchMidpoint.x - rect.left;
        const midY = pinchMidpoint.y - rect.top;

        // Anchor focal point during pinch zoom
        const contentX = (container.scrollLeft + midX) / oldScale;
        const contentY = (container.scrollTop + midY) / oldScale;

        localZoomScale.value = Number(nextScale.toFixed(2));

        container.scrollLeft = contentX * nextScale - midX;
        container.scrollTop = contentY * nextScale - midY;
      } else {
        localZoomScale.value = Number(nextScale.toFixed(2));
      }
      initialPinchDistance = dist;
    }
  }
}

function handleTouchEnd(e: TouchEvent): void {
  // Do not navigate while text is selected or right after a selection gesture
  if (shouldIgnoreReaderTap()) {
    return;
  }

  // Only consider horizontal swipe page navigation if scale is close to 1.0
  if (effectiveZoom.value <= 1.05 && e.changedTouches.length === 1 && e.changedTouches[0]) {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    const elapsed = Date.now() - touchStartTime;

    // Must be predominantly horizontal swipe
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && elapsed < 800) {
      if (dx < 0) {
        emit('next');
      } else {
        emit('prev');
      }
    }
  }
}

function handleWheel(e: WheelEvent): void {
  if (e.ctrlKey) {
    if (e.cancelable) {
      e.preventDefault();
    }
    const factor = 1 - e.deltaY * 0.01;
    localZoomScale.value = Number(Math.min(Math.max(localZoomScale.value * factor, 1.0), 4.0).toFixed(2));
  }
}

function handleContainerClick(e: MouseEvent): void {
  // The reflow layer owns its taps; prevent the parent viewport from handling them twice.
  e.stopPropagation();

  // Ignore clicks inside buttons or interactive elements
  const target = e.target as HTMLElement | null;
  if (target?.closest('button') || target?.closest('a')) {
    return;
  }

  const width = window.innerWidth;
  const clickX = e.clientX;
  // Center 60% of screen triggers center tap for overlay toggle
  const isCenter = clickX > width * 0.2 && clickX < width * 0.8;

  // Ignore the click fired when lifting the finger after selecting text; a plain tap
  // while the selection bar is shown only dismisses the selection (after verification).
  handleReaderTap(() => {
    if (isCenter) {
      emit('center-tap');
    }
  });
}

watch(
  () => activePageNumber.value,
  (newPage) => {
    void loadPage(newPage);
  },
);

onMounted(() => {
  void loadPage(activePageNumber.value);
});
</script>

<template>
  <div
    ref="scrollContainerRef"
    data-testid="pdf-reflow-view"
    class="zoom-scroll-container relative w-full h-full overflow-y-auto overflow-x-auto select-text transition-colors duration-200"
    :class="themeClass"
    :style="[
      typographyStyle,
      {
        touchAction: 'pan-x pan-y',
        WebkitOverflowScrolling: 'touch',
      },
    ]"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
    @wheel="handleWheel"
    @click="handleContainerClick"
  >
    <div
      data-testid="zoom-sizer"
      class="zoom-sizer"
      :style="reflowSizerStyle"
    >
      <div
        data-testid="zoom-content"
        class="zoom-content"
        :style="reflowContentStyle"
      >
        <div class="px-5 py-6 max-w-prose mx-auto select-text min-h-full flex flex-col justify-between">
      <!-- Loading indicator -->
      <div
        v-if="isLoading"
        data-testid="reflow-loading-spinner"
        class="py-16 flex flex-col items-center justify-center gap-3 text-current/70"
      >
        <div class="w-8 h-8 rounded-full border-2 border-current border-t-transparent animate-spin" />
        <span class="text-xs font-semibold">{{ t('reader.loading') }}</span>
      </div>

      <!-- Scanned / Image-Only Fallback -->
      <div
        v-else-if="isScannedFallback"
        data-testid="reflow-fallback-container"
        class="flex flex-col items-center justify-center py-4 select-text"
      >
        <div
          data-testid="scanned-page-fallback-banner"
          class="w-full mb-4 rounded-xl p-3 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2"
        >
          <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{{ t('reader.scannedPageFallback') }}</span>
        </div>

        <canvas
          ref="fallbackCanvasRef"
          data-testid="reflow-fallback-canvas"
          class="shadow-md rounded max-w-full block bg-white"
        />
      </div>

      <!-- Reconstructed Reflow Blocks -->
      <article
        v-else
        data-testid="reflow-content"
        class="select-text max-w-none text-[length:inherit] leading-[inherit]"
      >
        <template v-for="block in blocks" :key="block.id">
          <h2
            v-if="block.type === 'h2'"
            data-testid="reflow-h2"
            class="font-bold mb-4 mt-6 tracking-tight select-text"
            :style="heading2Style"
          >
            {{ block.text }}
          </h2>

          <h3
            v-else-if="block.type === 'h3'"
            data-testid="reflow-h3"
            class="font-bold mb-3 mt-4 tracking-normal select-text"
            :style="heading3Style"
          >
            {{ block.text }}
          </h3>

          <p
            v-else
            data-testid="reflow-p"
            class="mb-4 text-justify select-text text-[length:inherit] leading-[inherit]"
          >
            {{ block.text }}
          </p>
        </template>
      </article>

      <!-- Bottom Page Navigation Controls -->
      <div
        data-testid="reflow-bottom-nav"
        class="mt-8 pt-6 border-t border-current/10 flex items-center justify-between text-sm select-none"
      >
        <button
          type="button"
          data-testid="reflow-prev-page-btn"
          class="px-4 py-2 rounded-xl bg-current/10 hover:bg-current/15 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none font-medium text-xs flex items-center gap-1.5"
          :disabled="readerStore.currentPage <= 1"
          @click.stop="emit('prev')"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          <span>{{ t('reader.previous') }}</span>
        </button>

        <span
          data-testid="reflow-page-indicator"
          class="text-xs opacity-70 font-semibold"
        >
          {{ t('reader.page') }} {{ readerStore.currentPage }} {{ t('reader.of') }} {{ readerStore.totalPages }}
        </span>

        <button
          type="button"
          data-testid="reflow-next-page-btn"
          class="px-4 py-2 rounded-xl bg-current/10 hover:bg-current/15 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none font-medium text-xs flex items-center gap-1.5"
          :disabled="readerStore.currentPage >= readerStore.totalPages"
          @click.stop="emit('next')"
        >
          <span>{{ t('reader.next') }}</span>
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
      </div>
    </div>
  </div>
</template>
