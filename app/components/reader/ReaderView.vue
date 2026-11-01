<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useTtsStore } from '../../stores/ttsStore';
import ReaderViewport from './ReaderViewport.vue';
import { shouldIgnoreReaderTap } from '../../services/selection/SelectionGuard';

const props = defineProps<{
  activeEngine?: unknown;
  onZoomRender?: (scale: number) => Promise<void> | void;
}>();

const emit = defineEmits<{
  (e: 'center-tap'): void;
  (e: 'next'): void;
  (e: 'prev'): void;
}>();

const settingsStore = useSettingsStore();
const ttsStore = useTtsStore();

/** Never toggle the UI while text is selected or right after a selection gesture. */
const handleCenterTap = (): void => {
  if (shouldIgnoreReaderTap()) return;
  emit('center-tap');
};

onMounted(async () => {
  await settingsStore.enterReader();
});

onUnmounted(async () => {
  const isTtsPlaying = ttsStore.isPlaying;
  await settingsStore.leaveReader(isTtsPlaying);
});
</script>

<template>
  <div
    data-testid="reader-view"
    class="relative h-full w-full"
  >
    <ReaderViewport
      :active-engine="props.activeEngine"
      :on-zoom-render="props.onZoomRender"
      @center-tap="handleCenterTap"
      @next="emit('next')"
      @prev="emit('prev')"
    />
  </div>
</template>
