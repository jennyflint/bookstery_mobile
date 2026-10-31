<script setup lang="ts">
import { useReaderStore } from '../../stores/readerStore';
import type { ReaderTheme } from '../../types';

defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { t } = useI18n();
const readerStore = useReaderStore();

const themes: { id: ReaderTheme; nameKey: string; bg: string; text: string; border: string }[] = [
  { id: 'light', nameKey: 'theme.light', bg: '#ffffff', text: '#18181b', border: '#e4e4e7' },
  { id: 'sepia', nameKey: 'theme.sepia', bg: '#f4ecd8', text: '#433422', border: '#e2d3b3' },
  { id: 'night', nameKey: 'theme.night', bg: '#18181b', text: '#f4f4f5', border: '#27272a' },
  { id: 'oled', nameKey: 'theme.oled', bg: '#000000', text: '#e4e4e7', border: '#27272a' },
];

const selectTheme = (theme: ReaderTheme) => {
  readerStore.setTheme(theme);
};

const increaseFont = () => {
  readerStore.setFontSize(readerStore.settings.fontSize + 2);
};

const decreaseFont = () => {
  readerStore.setFontSize(readerStore.settings.fontSize - 2);
};
</script>

<template>
  <div
    v-if="isOpen"
    data-testid="theme-settings-sheet"
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-md bg-white rounded-t-3xl p-6 shadow-2xl border-t border-zinc-100 space-y-6 animate-in slide-in-from-bottom duration-200"
      :style="{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }"
    >
      <div class="flex items-center justify-between pb-2 border-b border-zinc-100">
        <h3 class="text-base font-bold text-zinc-900">{{ t('reader.settings') }}</h3>
        <button
          type="button"
          class="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 transition-colors"
          @click="emit('close')"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="space-y-3">
        <label class="text-xs font-bold text-zinc-500 uppercase tracking-wider block">
          {{ t('reader.theme') }}
        </label>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="item in themes"
            :key="item.id"
            type="button"
            class="flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-semibold transition-all relative"
            :style="{
              backgroundColor: item.bg,
              color: item.text,
              borderColor: readerStore.settings.theme === item.id ? '#6366f1' : item.border,
            }"
            @click="selectTheme(item.id)"
          >
            <span
              v-if="readerStore.settings.theme === item.id"
              class="w-2 h-2 rounded-full bg-indigo-500 absolute top-2 right-2"
            />
            <span class="mt-1">{{ t(item.nameKey) }}</span>
          </button>
        </div>
      </div>

      <div class="space-y-3">
        <label class="text-xs font-bold text-zinc-500 uppercase tracking-wider block">
          {{ t('reader.fontSize') }} ({{ readerStore.settings.fontSize }}px)
        </label>
        <div class="flex items-center justify-between gap-4 bg-zinc-100 p-2 rounded-2xl">
          <button
            type="button"
            class="w-12 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-sm font-bold text-zinc-800 active:scale-95 transition-all"
            @click="decreaseFont"
          >
            A-
          </button>
          <span class="text-sm font-semibold text-zinc-700">{{ readerStore.settings.fontSize }}px</span>
          <button
            type="button"
            class="w-12 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-base font-bold text-zinc-800 active:scale-95 transition-all"
            @click="increaseFont"
          >
            A+
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
