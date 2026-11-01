<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useReaderStore } from '../../stores/readerStore';
import { usePinchZoom } from '../../composables/usePinchZoom';
import type { ZoomableContainerElement } from '../../types';

const props = defineProps<{
  onZoomRender?: (scale: number) => Promise<void> | void;
}>();

const emit = defineEmits<{
  (e: 'center-tap'): void;
  (e: 'next'): void;
  (e: 'prev'): void;
}>();

const readerStore = useReaderStore();
const viewportWrapperRef = ref<HTMLElement | null>(null);
const containerRef = ref<ZoomableContainerElement | null>(null);

const {
  scale,
  cssScale,
  translateX,
  translateY,
  isAnimating,
  resetZoom,
  didInteractRecently,
} = usePinchZoom(viewportWrapperRef, containerRef, {
  minScale: 1.0,
  maxScale: 4.0,
  doubleTapScale: 2.5,
  doubleTapDelayMs: 300,
  debounceMs: 200,
  onZoomRender: async (targetScale: number) => {
    if (props.onZoomRender) {
      await props.onZoomRender(targetScale);
    } else if (containerRef.value?.__readerSetZoom) {
      await containerRef.value.__readerSetZoom(targetScale);
    }
  },
  onSwipeNext: () => {
    emit('next');
  },
  onSwipePrev: () => {
    emit('prev');
  },
});

onMounted(() => {
  if (containerRef.value) {
    containerRef.value.__onEngineResetZoom = () => {
      resetZoom(true);
    };
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

const containerTransformStyle = computed(() => ({
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  transform: `translate3d(${translateX.value}px, ${translateY.value}px, 0) scale(${cssScale.value})`,
  transformOrigin: 'center center',
  transition: isAnimating.value ? 'transform 250ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
  willChange: 'transform',
}));

const handleContainerClick = (event: MouseEvent) => {
  if (didInteractRecently() || scale.value > 1.0) {
    return;
  }

  const width = window.innerWidth;
  const clickX = event.clientX;

  if (clickX > width * 0.3 && clickX < width * 0.7) {
    emit('center-tap');
  }
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
    <div
      ref="containerRef"
      data-testid="reader-gesture-target"
      class="w-full h-full flex flex-col items-center justify-center overflow-auto"
      :style="containerTransformStyle"
    />

    <div
      v-if="readerStore.isRendering"
      class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/10 backdrop-blur-[1px]"
    >
      <div class="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
    </div>
  </div>
</template>
