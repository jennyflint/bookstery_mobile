<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onDeactivated } from 'vue';
import { useReaderStore } from '../../stores/readerStore';
import { shouldIgnoreReaderTap } from '../../services/selection/SelectionGuard';

const props = withDefaults(
  defineProps<{
    zoomScale?: number;
    baseWidth?: number;
    baseHeight?: number;
    activeEngine?: unknown;
  }>(),
  {
    zoomScale: 1.0,
    baseWidth: 0,
    baseHeight: 0,
    activeEngine: undefined,
  },
);

const emit = defineEmits<{
  (e: 'next'): void;
  (e: 'prev'): void;
  (e: 'center-tap'): void;
}>();

const scrollContainerRef = ref<HTMLElement | null>(null);
const localScale = ref<number>(props.zoomScale);

const clearTextSelection = (): void => {
  try {
    const readerStore = useReaderStore();
    readerStore.clearTextSelection();
  } catch {}
};

onBeforeUnmount(() => {
  clearTextSelection();
});

onDeactivated(() => {
  clearTextSelection();
});

const effectiveScale = computed<number>(() => {
  return props.zoomScale !== 1.0 ? props.zoomScale : localScale.value;
});

const sizerStyle = computed(() => {
  if (effectiveScale.value > 1.0 && props.baseWidth > 0 && props.baseHeight > 0) {
    return {
      width: `${Math.round(props.baseWidth * effectiveScale.value)}px`,
      height: `${Math.round(props.baseHeight * effectiveScale.value)}px`,
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
  if (effectiveScale.value > 1.0) {
    return {
      transformOrigin: '0 0',
      transform: `scale(${effectiveScale.value})`,
      width: props.baseWidth > 0 ? `${props.baseWidth}px` : '100%',
      height: props.baseHeight > 0 ? `${props.baseHeight}px` : '100%',
      position: 'absolute' as const,
      top: '0px',
      left: '0px',
      willChange: 'transform',
    };
  }
  return {
    transformOrigin: '0 0',
    transform: 'scale(1)',
    width: '100%',
    height: '100%',
    position: 'relative' as const,
  };
});

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let initialPinchDist = 0;
let pinchMidpoint = { x: 0, y: 0 };

const handleTouchStart = (e: TouchEvent): void => {
  if (e.touches.length === 2 && e.touches[0] && e.touches[1]) {
    // 2 fingers active: prevent default to avoid full-page browser scaling
    if (e.cancelable) {
      e.preventDefault();
    }
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    initialPinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    pinchMidpoint = {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };
    return;
  }

  if (e.touches.length === 1 && e.touches[0]) {
    // 1-finger touch: do not preventDefault, smooth native scrolling proceeds
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }
};

const handleTouchMove = (e: TouchEvent): void => {
  if (e.touches.length === 2 && e.touches[0] && e.touches[1]) {
    if (e.cancelable) {
      e.preventDefault();
    }
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    if (initialPinchDist > 0) {
      const container = scrollContainerRef.value;
      const oldScale = effectiveScale.value;
      const ratio = dist / initialPinchDist;
      const nextScale = Math.min(Math.max(oldScale * ratio, 0.5), 4.0);

      if (container && oldScale !== nextScale) {
        const rect = container.getBoundingClientRect();
        const midX = pinchMidpoint.x - rect.left;
        const midY = pinchMidpoint.y - rect.top;

        // Preserve midpoint anchor position during pinch
        const contentX = (container.scrollLeft + midX) / oldScale;
        const contentY = (container.scrollTop + midY) / oldScale;

        localScale.value = Number(nextScale.toFixed(2));

        container.scrollLeft = contentX * nextScale - midX;
        container.scrollTop = contentY * nextScale - midY;
      } else {
        localScale.value = Number(nextScale.toFixed(2));
      }
      initialPinchDist = dist;
    }
  }
  // 1-finger touch move: smooth native scrolling is unobstructed
};

const handleTouchEnd = (e: TouchEvent): void => {
  if (shouldIgnoreReaderTap()) {
    return;
  }

  if (effectiveScale.value <= 1.05 && e.changedTouches.length === 1 && e.changedTouches[0]) {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    const elapsed = Date.now() - touchStartTime;

    // Horizontal swipe page turn when not zoomed in
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && elapsed < 800) {
      if (dx < 0) {
        emit('next');
      } else {
        emit('prev');
      }
    }
  }
};

const handleWheel = (e: WheelEvent): void => {
  if (e.ctrlKey || e.metaKey) {
    if (e.cancelable) {
      e.preventDefault();
    }
    const factor = 1 - e.deltaY * 0.01;
    localScale.value = Number(Math.min(Math.max(localScale.value * factor, 0.5), 4.0).toFixed(2));
  }
};

const handleClick = (e: MouseEvent): void => {
  const target = e.target as HTMLElement | null;
  if (target?.closest('button') || target?.closest('a')) {
    return;
  }
  const width = window.innerWidth;
  const clickX = e.clientX;
  if (clickX > width * 0.2 && clickX < width * 0.8) {
    emit('center-tap');
  }
};

defineExpose({
  scrollContainerRef,
  effectiveScale,
  localScale,
  clearTextSelection,
});
</script>

<template>
  <div
    ref="scrollContainerRef"
    data-testid="epub-viewer"
    class="zoom-scroll-container relative w-full h-full overflow-auto select-text"
    style="touch-action: pan-x pan-y; -webkit-overflow-scrolling: touch;"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
    @wheel="handleWheel"
    @click="handleClick"
  >
    <div
      data-testid="zoom-sizer"
      class="zoom-sizer"
      :style="sizerStyle"
    >
      <div
        data-testid="zoom-content"
        class="zoom-content"
        :style="contentStyle"
      >
        <slot />
      </div>
    </div>
  </div>
</template>
