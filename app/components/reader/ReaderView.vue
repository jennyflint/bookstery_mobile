<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useTtsStore } from '../../stores/ttsStore';
import ReaderViewport from './ReaderViewport.vue';

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
      @center-tap="emit('center-tap')"
      @next="emit('next')"
      @prev="emit('prev')"
    />
  </div>
</template>
