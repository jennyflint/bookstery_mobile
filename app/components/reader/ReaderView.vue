<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, type Ref, type ComputedRef } from 'vue';
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

const handleNextPage = async (): Promise<void> => {
  if (readerStore.isReflowMode && readerStore.currentBook?.format === 'pdf') {
    const reflowEl = document.querySelector(
      '[data-testid="pdf-reflow-view"]',
    ) as HTMLElement | null;
    if (reflowEl) {
      const { scrollTop, clientHeight, scrollHeight } = reflowEl;
      if (scrollTop + clientHeight < scrollHeight - 15) {
        reflowEl.scrollBy({ top: Math.max(100, clientHeight * 0.9), behavior: 'smooth' });
        return;
      }
    }
  }
  emit('next');
};

const handlePrevPage = async (): Promise<void> => {
  if (readerStore.isReflowMode && readerStore.currentBook?.format === 'pdf') {
    const reflowEl = document.querySelector(
      '[data-testid="pdf-reflow-view"]',
    ) as HTMLElement | null;
    if (reflowEl) {
      const { scrollTop, clientHeight } = reflowEl;
      if (scrollTop > 15) {
        reflowEl.scrollBy({ top: -Math.max(100, clientHeight * 0.9), behavior: 'smooth' });
        return;
      }
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

onMounted(async () => {
  await settingsStore.enterReader();
});

onUnmounted(async () => {
  const isTtsPlaying = ttsStore.isPlaying;
  await settingsStore.leaveReader(isTtsPlaying);
});

defineExpose({
  viewportRef,
  shouldIntercept,
  dispatchPageTurn,
  handleNextPage,
  handlePrevPage,
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
