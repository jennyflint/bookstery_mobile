<script setup lang="ts">
import { ref } from 'vue';
import { useReaderStore } from '../../stores/readerStore';
import type { ReaderPaginationMode, ReaderTheme } from '../../types';
import SyncButton from '../common/SyncButton.vue';

defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'change-pagination', mode: ReaderPaginationMode): void;
}>();

const { t } = useI18n();
const readerStore = useReaderStore();

const bgInputRef = ref<HTMLInputElement | null>(null);
const textInputRef = ref<HTMLInputElement | null>(null);

const bgSwatches = ['#ffffff', '#fbf0d9', '#f4ecd8', '#eaf4ec', '#18181b', '#000000'];
const textSwatches = ['#18181b', '#433422', '#1e3a8a', '#2e4a36', '#f4f4f5', '#e4e4e7'];

const themes: { id: ReaderTheme; nameKey: string; bg: string; text: string; border: string }[] = [
  { id: 'light', nameKey: 'theme.light', bg: '#ffffff', text: '#18181b', border: '#e4e4e7' },
  { id: 'sepia', nameKey: 'theme.sepia', bg: '#f4ecd8', text: '#433422', border: '#e2d3b3' },
  { id: 'night', nameKey: 'theme.night', bg: '#18181b', text: '#f4f4f5', border: '#27272a' },
  { id: 'oled', nameKey: 'theme.oled', bg: '#000000', text: '#e4e4e7', border: '#27272a' },
];

const selectTheme = (theme: ReaderTheme) => {
  readerStore.setTheme(theme);
};

const handleBgChange = (color: string) => {
  readerStore.setCustomBackgroundColor(color);
};

const handleTextChange = (color: string) => {
  readerStore.setCustomTextColor(color);
};

const triggerBgPicker = () => {
  bgInputRef.value?.click();
};

const triggerTextPicker = () => {
  textInputRef.value?.click();
};

const selectPaginationMode = (mode: ReaderPaginationMode) => {
  readerStore.setPaginationMode(mode);
  emit('change-pagination', mode);
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
      class="w-full max-w-md bg-white rounded-t-3xl p-6 shadow-2xl border-t border-zinc-100 space-y-6 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-200"
      :style="{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }"
    >
      <div class="flex items-center justify-between pb-2 border-b border-zinc-100">
        <h3 class="text-base font-bold text-zinc-900">{{ t('reader.settings') }}</h3>
        <div class="flex items-center gap-2">
          <SyncButton />
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
      </div>

      <!-- Presets -->
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

      <!-- Custom Color Pickers -->
      <div class="space-y-4 bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
        <div class="flex items-center justify-between">
          <label class="text-xs font-bold text-zinc-700 uppercase tracking-wider">
            {{ t('reader.customColors') }}
          </label>
          <span
            v-if="readerStore.settings.theme === 'custom'"
            class="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200"
          >
            {{ t('theme.custom') }}
          </span>
        </div>

        <!-- Background Color Picker -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs font-semibold text-zinc-600">
            <span>{{ t('reader.backgroundColor') }}</span>
            <span class="font-mono text-zinc-500 uppercase text-[11px]">{{ readerStore.settings.customBackgroundColor }}</span>
          </div>
          <div class="flex items-center gap-3">
            <div
              class="relative w-10 h-10 rounded-xl border border-zinc-300 shadow-sm cursor-pointer flex items-center justify-center overflow-hidden shrink-0"
              :style="{ backgroundColor: readerStore.settings.customBackgroundColor }"
              @click="triggerBgPicker"
            >
              <input
                ref="bgInputRef"
                type="color"
                :value="readerStore.settings.customBackgroundColor"
                class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                @input="handleBgChange(($event.target as HTMLInputElement).value)"
              />
              <svg class="w-4 h-4 text-zinc-400 drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4 4 4 0 014-4c.73 0 1.41.2 2 .54V7a2 2 0 012-2h4a2 2 0 012 2v6.54c.59-.34 1.27-.54 2-.54a4 4 0 014 4 4 4 0 01-4 4H7z" />
              </svg>
            </div>
            <div class="flex items-center gap-1.5 flex-wrap">
              <button
                v-for="swatch in bgSwatches"
                :key="swatch"
                type="button"
                class="w-7 h-7 rounded-lg border transition-transform active:scale-95 shadow-xs"
                :style="{
                  backgroundColor: swatch,
                  borderColor: readerStore.settings.customBackgroundColor.toLowerCase() === swatch.toLowerCase() ? '#6366f1' : '#e4e4e7',
                }"
                @click="handleBgChange(swatch)"
              />
            </div>
          </div>
        </div>

        <!-- Text Color Picker -->
        <div class="space-y-2 pt-1">
          <div class="flex items-center justify-between text-xs font-semibold text-zinc-600">
            <span>{{ t('reader.textColor') }}</span>
            <span class="font-mono text-zinc-500 uppercase text-[11px]">{{ readerStore.settings.customTextColor }}</span>
          </div>
          <div class="flex items-center gap-3">
            <div
              class="relative w-10 h-10 rounded-xl border border-zinc-300 shadow-sm cursor-pointer flex items-center justify-center overflow-hidden shrink-0"
              :style="{ backgroundColor: readerStore.settings.customTextColor }"
              @click="triggerTextPicker"
            >
              <input
                ref="textInputRef"
                type="color"
                :value="readerStore.settings.customTextColor"
                class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                @input="handleTextChange(($event.target as HTMLInputElement).value)"
              />
              <span class="font-bold text-sm" :style="{ color: readerStore.settings.customBackgroundColor }">A</span>
            </div>
            <div class="flex items-center gap-1.5 flex-wrap">
              <button
                v-for="swatch in textSwatches"
                :key="swatch"
                type="button"
                class="w-7 h-7 rounded-lg border transition-transform active:scale-95 shadow-xs"
                :style="{
                  backgroundColor: swatch,
                  borderColor: readerStore.settings.customTextColor.toLowerCase() === swatch.toLowerCase() ? '#6366f1' : '#e4e4e7',
                }"
                @click="handleTextChange(swatch)"
              />
            </div>
          </div>
        </div>

        <!-- Live Preview -->
        <div
          class="p-3 rounded-xl border transition-all text-xs shadow-xs"
          :style="{
            backgroundColor: readerStore.settings.customBackgroundColor,
            color: readerStore.settings.customTextColor,
            borderColor: '#e4e4e7',
          }"
        >
          <span class="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-1">
            {{ t('reader.preview') }}
          </span>
          <p class="leading-relaxed">
            {{ t('reader.previewSample') }}
          </p>
        </div>
      </div>

      <!-- Pagination Mode -->
      <div class="space-y-3">
        <label class="text-xs font-bold text-zinc-500 uppercase tracking-wider block">
          {{ t('reader.paginationMode') }}
        </label>
        <div class="grid grid-cols-2 gap-2 bg-zinc-100 p-1.5 rounded-2xl">
          <button
            type="button"
            class="py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
            :class="readerStore.settings.paginationMode === 'scroll'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-zinc-600 hover:text-zinc-900'"
            @click="selectPaginationMode('scroll')"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            <span>{{ t('reader.paginationScroll') }}</span>
          </button>
          <button
            type="button"
            class="py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
            :class="readerStore.settings.paginationMode === 'buttons'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-zinc-600 hover:text-zinc-900'"
            @click="selectPaginationMode('buttons')"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span>{{ t('reader.paginationButtons') }}</span>
          </button>
        </div>
      </div>

      <!-- Font Size -->
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
