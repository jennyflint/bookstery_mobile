<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  onMounted,
  onUnmounted,
  onBeforeUnmount,
  onDeactivated,
  type Ref,
  type ComputedRef,
} from 'vue';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useReaderStore } from '../../stores/readerStore';
import { useTtsStore } from '../../stores/ttsStore';
import ReaderViewport from './ReaderViewport.vue';
import { shouldIgnoreReaderTap } from '../../services/selection/SelectionGuard';
import { useVolumePageTurn } from '../../composables/useVolumePageTurn';

const props = defineProps<{
  activeEngine?: unknown;
  onZoomRender?: (scale: number) => Promise<void> | void;
  isReaderOpen?: boolean;
  isAnyModalOpen?: boolean;
}>();

const emit = defineEmits<{
  (e: 'center-tap'): void;
  (e: 'next'): void;
  (e: 'prev'): void;
}>();

const viewportRef = ref<InstanceType<typeof ReaderViewport> | null>(null);
const settingsStore = useSettingsStore();
const readerStore = useReaderStore();
const ttsStore = useTtsStore();

/** Never toggle the UI while text is selected or right after a selection gesture. */
const handleCenterTap = (): void => {
  if (shouldIgnoreReaderTap()) return;
  emit('center-tap');
};

/** Returns active scroll container (reflow view or zoomed scroll container) if vertically scrollable */
const getActiveScrollElement = (): HTMLElement | null => {
  if (readerStore.isReflowMode && readerStore.currentBook?.format === 'pdf') {
    return document.querySelector('[data-testid="pdf-reflow-view"]') as HTMLElement | null;
  }
  if (readerStore.settings.paginationMode === 'scroll') {
    const epubScroll = document.querySelector('.epub-container') as HTMLElement | null;
    if (epubScroll && epubScroll.scrollHeight > epubScroll.clientHeight + 10) {
      return epubScroll;
    }
  }
  const zoomScroll = document.querySelector('[data-testid="zoom-scroll-container"]') as HTMLElement | null;
  if (zoomScroll && zoomScroll.scrollHeight > zoomScroll.clientHeight + 10) {
    return zoomScroll;
  }
  return null;
};

watch(
  () => props.activeEngine,
  (engine: any) => {
    if (engine && typeof engine.setPaginationMode === 'function') {
      void engine.setPaginationMode(readerStore.settings.paginationMode);
    }
  },
  { immediate: true },
);

watch(
  () => readerStore.settings.paginationMode,
  async (newMode) => {
    const engine = props.activeEngine as any;
    if (engine && typeof engine.setPaginationMode === 'function') {
      await engine.setPaginationMode(newMode);
    }
  },
);

const handleNextPage = async (): Promise<void> => {
  const scrollEl = getActiveScrollElement();
  if (scrollEl) {
    const { scrollTop, clientHeight, scrollHeight } = scrollEl;
    if (scrollTop + clientHeight < scrollHeight - 15) {
      scrollEl.scrollBy({ top: Math.max(100, clientHeight * 0.9), behavior: 'smooth' });
      return;
    }
  }
  emit('next');
};

const handlePrevPage = async (): Promise<void> => {
  const scrollEl = getActiveScrollElement();
  if (scrollEl) {
    const { scrollTop, clientHeight } = scrollEl;
    if (scrollTop > 15) {
      scrollEl.scrollBy({ top: -Math.max(100, clientHeight * 0.9), behavior: 'smooth' });
      return;
    }
  }
  emit('prev');
};

const isReaderOpenComputed = computed(() => {
  return props.isReaderOpen !== undefined ? props.isReaderOpen : true;
});

const isModalOpenComputed = computed(() => {
  return props.isAnyModalOpen !== undefined ? props.isAnyModalOpen : false;
});

const { shouldIntercept, dispatchPageTurn } = useVolumePageTurn({
  onNextPage: handleNextPage,
  onPrevPage: handlePrevPage,
  isReaderOpen: isReaderOpenComputed,
  isAnyModalOpen: isModalOpenComputed,
});

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
  () => readerStore.currentBook?.id,
  () => {
    clearTextSelection();
  },
  { immediate: true },
);

watch(
  () => readerStore.currentPage,
  (newPage, oldPage) => {
    if (newPage !== oldPage) {
      clearTextSelection();
    }
  },
);

onMounted(async () => {
  await settingsStore.enterReader();
});

onUnmounted(async () => {
  clearTextSelection();
  const isTtsPlaying = ttsStore.isPlaying;
  await settingsStore.leaveReader(isTtsPlaying);
});

defineExpose({
  viewportRef,
  shouldIntercept,
  dispatchPageTurn,
  handleNextPage,
  handlePrevPage,
  clearTextSelection,
});
</script>

<template>
  <div
    data-testid="reader-view"
    class="relative h-full w-full"
  >
    <ReaderViewport
      ref="viewportRef"
      :active-engine="props.activeEngine"
      :on-zoom-render="props.onZoomRender"
      @center-tap="handleCenterTap"
      @next="handleNextPage"
      @prev="handlePrevPage"
    />
  </div>
</template>
