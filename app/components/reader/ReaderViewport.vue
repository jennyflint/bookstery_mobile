<script setup lang="ts">
import { ref, computed } from 'vue';
import { useReaderStore } from '../../stores/readerStore';

const emit = defineEmits<{
  (e: 'center-tap'): void;
}>();

const readerStore = useReaderStore();
const containerRef = ref<HTMLElement | null>(null);

const themeColors = computed(() => {
  switch (readerStore.settings.theme) {
    case 'sepia':
      return { bg: '#f4ecd8', text: '#433422' };
    case 'night':
      return { bg: '#18181b', text: '#f4f4f5' };
    case 'oled':
      return { bg: '#000000', text: '#e4e4e7' };
    case 'light':
    default:
      return { bg: '#ffffff', text: '#18181b' };
  }
});

const viewportStyle = computed(() => ({
  backgroundColor: themeColors.value.bg,
  color: themeColors.value.text,
  fontSize: `${readerStore.settings.fontSize}px`,
  lineHeight: `${readerStore.settings.lineHeight}`,
  fontFamily: readerStore.settings.fontFamily === 'serif' ? 'ui-serif, Georgia, Cambria, serif' : 'ui-sans-serif, system-ui, sans-serif',
}));

const handleContainerClick = (event: MouseEvent) => {
  const width = window.innerWidth;
  const clickX = event.clientX;

  if (clickX > width * 0.3 && clickX < width * 0.7) {
    emit('center-tap');
  }
};

defineExpose({
  containerRef,
});
</script>

<template>
  <div
    data-testid="reader-viewport"
    :data-rendering="readerStore.isRendering ? 'true' : 'false'"
    class="relative w-full h-full overflow-hidden select-text transition-colors duration-200"
    :style="viewportStyle"
    @click="handleContainerClick"
  >
    <div
      ref="containerRef"
      class="w-full h-full flex flex-col items-center justify-center overflow-auto"
      :style="{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }"
    />

    <div
      v-if="readerStore.isRendering"
      class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/10 backdrop-blur-[1px]"
    >
      <div class="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
    </div>
  </div>
</template>
