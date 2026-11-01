<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useReaderStore } from '../../stores/readerStore';

export interface ReaderProgressBarProps {
  currentPage?: number;
  totalPages?: number;
  progressPercentage?: number;
  chapterTitle?: string | null;
  locator?: string;
}

const props = withDefaults(defineProps<ReaderProgressBarProps>(), {
  currentPage: 1,
  totalPages: 1,
  progressPercentage: 0,
  chapterTitle: null,
  locator: '',
});

const emit = defineEmits<{
  (e: 'navigate', page: number): void;
  (e: 'scrub-start', page: number): void;
  (e: 'scrub-change', page: number): void;
  (e: 'scrub-end', page: number): void;
}>();

const { t } = useI18n();
const readerStore = useReaderStore();

const trackRef = ref<HTMLElement | null>(null);
const scrubberContainerRef = ref<HTMLElement | null>(null);

const isDragging = ref(false);
const previewPage = ref(1);
const previewPercent = ref(0);
const initialPageBeforeDrag = ref(1);
const tooltipLeftPx = ref(0);

// Throttled haptic tick
let lastHapticTime = 0;
const HAPTIC_THROTTLE_MS = 40;

const triggerHapticTick = async (): Promise<void> => {
  const now = Date.now();
  if (now - lastHapticTime < HAPTIC_THROTTLE_MS) {
    return;
  }
  lastHapticTime = now;

  // 1. Try Capacitor global plugins object (standard on Capacitor native runtime)
  const capacitorGlobal =
    typeof window !== 'undefined'
      ? (
          window as unknown as {
            Capacitor?: {
              Plugins?: {
                Haptics?: {
                  selectionChanged?: () => Promise<void>;
                  impact?: (opts: { style: string }) => Promise<void>;
                };
              };
            };
          }
        ).Capacitor
      : undefined;

  const globalHaptics = capacitorGlobal?.Plugins?.Haptics;
  if (globalHaptics) {
    try {
      if (typeof globalHaptics.selectionChanged === 'function') {
        await globalHaptics.selectionChanged();
        return;
      }
      if (typeof globalHaptics.impact === 'function') {
        await globalHaptics.impact({ style: 'LIGHT' });
        return;
      }
    } catch {}
  }

  // 2. Try dynamic import using variable expression to prevent Vite static resolution failure
  try {
    const pkgName = ['@capacitor', 'haptics'].join('/');
    const mod = (await import(/* @vite-ignore */ pkgName)) as {
      Haptics?: {
        selectionChanged?: () => Promise<void>;
        impact?: (opts: { style: string }) => Promise<void>;
      };
      ImpactStyle?: { Light: string };
    };
    if (mod?.Haptics?.selectionChanged) {
      await mod.Haptics.selectionChanged();
      return;
    }
    if (mod?.Haptics?.impact) {
      await mod.Haptics.impact({ style: mod.ImpactStyle?.Light ?? 'LIGHT' });
      return;
    }
  } catch {}

  // 3. Web vibration API fallback
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(8);
    }
  } catch {}
};

const effectiveTotalPages = computed(() => {
  return Math.max(1, props.totalPages || readerStore.totalPages || 1);
});

const effectiveCurrentPage = computed(() => {
  return Math.max(1, Math.min(effectiveTotalPages.value, props.currentPage || readerStore.currentPage || 1));
});

const effectiveChapterTitle = computed(() => {
  return props.chapterTitle ?? readerStore.currentChapterTitle;
});

const displayPercent = computed(() => {
  if (isDragging.value) {
    return previewPercent.value;
  }
  const pct =
    props.progressPercentage !== undefined && props.progressPercentage > 0
      ? props.progressPercentage
      : readerStore.progressPercentage;

  if (pct > 0) {
    return Math.min(100, Math.max(0, pct));
  }
  if (effectiveTotalPages.value > 1) {
    return ((effectiveCurrentPage.value - 1) / (effectiveTotalPages.value - 1)) * 100;
  }
  return 0;
});

const displayPage = computed(() => {
  return isDragging.value ? previewPage.value : effectiveCurrentPage.value;
});

const calculatePageAndPosition = (
  clientX: number,
): { page: number; ratio: number; clientXOffset: number } => {
  if (!trackRef.value) {
    return { page: effectiveCurrentPage.value, ratio: 0, clientXOffset: 0 };
  }
  const rect = trackRef.value.getBoundingClientRect();
  const width = Math.max(rect.width, 1);
  const rawOffset = clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, rawOffset / width));
  const total = effectiveTotalPages.value;
  const targetPage =
    total > 1 ? Math.min(total, Math.max(1, Math.round(ratio * (total - 1)) + 1)) : 1;

  return { page: targetPage, ratio, clientXOffset: rawOffset };
};

const updateTooltipPosition = (clientXOffset: number): void => {
  if (!trackRef.value) return;
  const rect = trackRef.value.getBoundingClientRect();
  const minOffset = 56;
  const maxOffset = Math.max(minOffset, rect.width - minOffset);
  tooltipLeftPx.value = Math.max(minOffset, Math.min(maxOffset, clientXOffset));
};

const handlePointerDown = (event: PointerEvent): void => {
  event.stopPropagation();
  const target = event.currentTarget as HTMLElement;
  if (target && typeof target.setPointerCapture === 'function') {
    try {
      target.setPointerCapture(event.pointerId);
    } catch {}
  }

  isDragging.value = true;
  initialPageBeforeDrag.value = effectiveCurrentPage.value;

  const { page, ratio, clientXOffset } = calculatePageAndPosition(event.clientX);
  previewPage.value = page;
  previewPercent.value = ratio * 100;
  updateTooltipPosition(clientXOffset);
  triggerHapticTick();

  emit('scrub-start', page);
  emit('scrub-change', page);
};

const handlePointerMove = (event: PointerEvent): void => {
  if (!isDragging.value) return;
  event.stopPropagation();

  const { page, ratio, clientXOffset } = calculatePageAndPosition(event.clientX);
  if (page !== previewPage.value) {
    triggerHapticTick();
    previewPage.value = page;
    emit('scrub-change', page);
  }
  previewPercent.value = ratio * 100;
  updateTooltipPosition(clientXOffset);
};

const handlePointerUp = async (event: PointerEvent): Promise<void> => {
  if (!isDragging.value) return;
  event.stopPropagation();

  const target = event.currentTarget as HTMLElement;
  if (target && typeof target.releasePointerCapture === 'function') {
    try {
      target.releasePointerCapture(event.pointerId);
    } catch {}
  }

  isDragging.value = false;
  const finalPage = previewPage.value;
  emit('scrub-end', finalPage);

  if (finalPage !== initialPageBeforeDrag.value) {
    emit('navigate', finalPage);
    await readerStore.goToPage(finalPage);
  }
};

const handlePointerCancel = (event: PointerEvent): void => {
  if (!isDragging.value) return;
  event.stopPropagation();

  const target = event.currentTarget as HTMLElement;
  if (target && typeof target.releasePointerCapture === 'function') {
    try {
      target.releasePointerCapture(event.pointerId);
    } catch {}
  }

  isDragging.value = false;
  previewPage.value = initialPageBeforeDrag.value;
  emit('scrub-end', initialPageBeforeDrag.value);
};

// Touch event fallback
const handleTouchStart = (event: TouchEvent): void => {
  if (event.touches.length === 0 || isDragging.value) return;
  event.stopPropagation();

  const touch = event.touches[0];
  isDragging.value = true;
  initialPageBeforeDrag.value = effectiveCurrentPage.value;

  const { page, ratio, clientXOffset } = calculatePageAndPosition(touch.clientX);
  previewPage.value = page;
  previewPercent.value = ratio * 100;
  updateTooltipPosition(clientXOffset);
  triggerHapticTick();

  emit('scrub-start', page);
  emit('scrub-change', page);
};

const handleTouchMove = (event: TouchEvent): void => {
  if (!isDragging.value || event.touches.length === 0) return;
  event.stopPropagation();

  const touch = event.touches[0];
  const { page, ratio, clientXOffset } = calculatePageAndPosition(touch.clientX);
  if (page !== previewPage.value) {
    triggerHapticTick();
    previewPage.value = page;
    emit('scrub-change', page);
  }
  previewPercent.value = ratio * 100;
  updateTooltipPosition(clientXOffset);
};

const handleTouchEnd = async (event: TouchEvent): Promise<void> => {
  if (!isDragging.value) return;
  event.stopPropagation();

  isDragging.value = false;
  const finalPage = previewPage.value;
  emit('scrub-end', finalPage);

  if (finalPage !== initialPageBeforeDrag.value) {
    emit('navigate', finalPage);
    await readerStore.goToPage(finalPage);
  }
};

const handleTouchCancel = (event: TouchEvent): void => {
  if (!isDragging.value) return;
  event.stopPropagation();

  isDragging.value = false;
  previewPage.value = initialPageBeforeDrag.value;
  emit('scrub-end', initialPageBeforeDrag.value);
};

const handleWindowPointerUp = (): void => {
  if (isDragging.value) {
    isDragging.value = false;
  }
};

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerup', handleWindowPointerUp);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('pointerup', handleWindowPointerUp);
  }
});

defineExpose({
  isDragging,
  previewPage,
  displayPercent,
  displayPage,
});
</script>

<template>
  <div
    ref="scrubberContainerRef"
    data-testid="reader-scrubber"
    role="slider"
    :aria-valuenow="displayPage"
    :aria-valuemin="1"
    :aria-valuemax="effectiveTotalPages"
    :aria-valuetext="`${t('reader.page')} ${displayPage} ${t('reader.of')} ${effectiveTotalPages}`"
    tabindex="0"
    class="relative w-full py-3 flex items-center cursor-pointer select-none touch-none"
    style="touch-action: none; min-height: 40px;"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerCancel"
    @touchstart.prevent.stop="handleTouchStart"
    @touchmove.prevent.stop="handleTouchMove"
    @touchend.prevent.stop="handleTouchEnd"
    @touchcancel.prevent.stop="handleTouchCancel"
  >
    <!-- Floating Tooltip -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-2 scale-90"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-2 scale-90"
    >
      <div
        v-if="isDragging"
        data-testid="scrubber-tooltip"
        class="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 flex flex-col items-center z-50 transition-[left] duration-75 ease-out"
        :style="{ left: `${tooltipLeftPx}px` }"
      >
        <div class="px-3 py-1.5 rounded-xl bg-zinc-900/95 text-white shadow-xl backdrop-blur-sm border border-zinc-700/50 flex flex-col items-center max-w-[220px] text-center">
          <span class="text-xs font-bold whitespace-nowrap">
            <template v-if="effectiveTotalPages > 1">
              {{ t('reader.page') }} {{ previewPage }} {{ t('reader.of') }} {{ effectiveTotalPages }}
            </template>
            <template v-else>
              {{ Math.round(previewPercent) }}%
            </template>
          </span>
          <span
            v-if="effectiveChapterTitle"
            class="text-[10px] text-zinc-300 truncate max-w-[190px] font-medium mt-0.5"
          >
            {{ effectiveChapterTitle }}
          </span>
        </div>
        <div class="w-2 h-2 bg-zinc-900 rotate-45 -mt-1 border-r border-b border-zinc-700/50" />
      </div>
    </Transition>

    <!-- Slim visible track -->
    <div
      ref="trackRef"
      data-testid="scrubber-track"
      class="relative w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-visible"
    >
      <!-- Active fill bar -->
      <div
        data-testid="scrubber-fill"
        class="h-full rounded-full bg-indigo-600 transition-[width] ease-out"
        :class="isDragging ? 'duration-0' : 'duration-200'"
        :style="{ width: `${displayPercent}%` }"
      />

      <!-- Draggable thumb / handle -->
      <div
        data-testid="scrubber-thumb"
        class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-indigo-600 shadow-md transition-transform ease-out cursor-grab active:cursor-grabbing"
        :class="[
          isDragging ? 'scale-125 duration-75 ring-4 ring-indigo-500/20' : 'scale-100 duration-200 hover:scale-110',
        ]"
        :style="{ left: `${displayPercent}%` }"
      />
    </div>
  </div>
</template>
