<script setup lang="ts">
import { ref } from 'vue';
import { useReaderStore } from '../../stores/readerStore';
import type { ReaderPaginationMode, ReaderTheme } from '../../types';
import SyncButton from '../common/SyncButton.vue';
import ScreenControlSettings from '../settings/ScreenControlSettings.vue';

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
      class="animate-in slide-in-from-bottom max-h-[85vh] w-full max-w-md space-y-6 overflow-y-auto rounded-t-3xl border-t border-zinc-100 bg-white p-6 shadow-2xl duration-200"
      :style="{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }"
    >
      <div class="flex items-center justify-between border-b border-zinc-100 pb-2">
        <h3 class="text-base font-bold text-zinc-900">{{ t('reader.settings') }}</h3>
        <div class="flex items-center gap-2">
          <SyncButton />
          <button
            type="button"
            class="rounded-lg p-1 text-zinc-400 transition-colors hover:text-zinc-600"
            @click="emit('close')"
          >
            <svg
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- Presets -->
      <div class="space-y-3">
        <label class="block text-xs font-bold uppercase tracking-wider text-zinc-500">
          {{ t('reader.theme') }}
        </label>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="item in themes"
            :key="item.id"
            type="button"
            class="relative flex flex-col items-center justify-center rounded-2xl border p-3 text-xs font-semibold transition-all"
            :style="{
              backgroundColor: item.bg,
              color: item.text,
              borderColor: readerStore.settings.theme === item.id ? '#6366f1' : item.border,
            }"
            @click="selectTheme(item.id)"
          >
            <span
              v-if="readerStore.settings.theme === item.id"
              class="absolute right-2 top-2 h-2 w-2 rounded-full bg-indigo-500"
            />
            <span class="mt-1">{{ t(item.nameKey) }}</span>
          </button>
        </div>
      </div>

      <!-- Custom Color Pickers -->
      <div class="space-y-4 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
        <div class="flex items-center justify-between">
          <label class="text-xs font-bold uppercase tracking-wider text-zinc-700">
            {{ t('reader.customColors') }}
          </label>
          <span
            v-if="readerStore.settings.theme === 'custom'"
            class="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600"
          >
            {{ t('theme.custom') }}
          </span>
        </div>

        <!-- Background Color Picker -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs font-semibold text-zinc-600">
            <span>{{ t('reader.backgroundColor') }}</span>
            <span class="font-mono text-[11px] uppercase text-zinc-500">{{
              readerStore.settings.customBackgroundColor
            }}</span>
          </div>
          <div class="flex items-center gap-3">
            <div
              class="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-zinc-300 shadow-sm"
              :style="{ backgroundColor: readerStore.settings.customBackgroundColor }"
              @click="triggerBgPicker"
            >
              <input
                ref="bgInputRef"
                type="color"
                :value="readerStore.settings.customBackgroundColor"
                class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                @input="handleBgChange(($event.target as HTMLInputElement).value)"
              />
              <svg
                class="h-4 w-4 text-zinc-400 drop-shadow"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M7 21a4 4 0 01-4-4 4 4 0 014-4c.73 0 1.41.2 2 .54V7a2 2 0 012-2h4a2 2 0 012 2v6.54c.59-.34 1.27-.54 2-.54a4 4 0 014 4 4 4 0 01-4 4H7z"
                />
              </svg>
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                v-for="swatch in bgSwatches"
                :key="swatch"
                type="button"
                class="shadow-xs h-7 w-7 rounded-lg border transition-transform active:scale-95"
                :style="{
                  backgroundColor: swatch,
                  borderColor:
                    readerStore.settings.customBackgroundColor.toLowerCase() ===
                    swatch.toLowerCase()
                      ? '#6366f1'
                      : '#e4e4e7',
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
            <span class="font-mono text-[11px] uppercase text-zinc-500">{{
              readerStore.settings.customTextColor
            }}</span>
          </div>
          <div class="flex items-center gap-3">
            <div
              class="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-zinc-300 shadow-sm"
              :style="{ backgroundColor: readerStore.settings.customTextColor }"
              @click="triggerTextPicker"
            >
              <input
                ref="textInputRef"
                type="color"
                :value="readerStore.settings.customTextColor"
                class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                @input="handleTextChange(($event.target as HTMLInputElement).value)"
              />
              <span
                class="text-sm font-bold"
                :style="{ color: readerStore.settings.customBackgroundColor }"
                >A</span
              >
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                v-for="swatch in textSwatches"
                :key="swatch"
                type="button"
                class="shadow-xs h-7 w-7 rounded-lg border transition-transform active:scale-95"
                :style="{
                  backgroundColor: swatch,
                  borderColor:
                    readerStore.settings.customTextColor.toLowerCase() === swatch.toLowerCase()
                      ? '#6366f1'
                      : '#e4e4e7',
                }"
                @click="handleTextChange(swatch)"
              />
            </div>
          </div>
        </div>

        <!-- Live Preview -->
        <div
          class="shadow-xs rounded-xl border p-3 text-xs transition-all"
          :style="{
            backgroundColor: readerStore.settings.customBackgroundColor,
            color: readerStore.settings.customTextColor,
            borderColor: '#e4e4e7',
          }"
        >
          <span class="mb-1 block text-[10px] font-bold uppercase tracking-wider opacity-60">
            {{ t('reader.preview') }}
          </span>
          <p class="leading-relaxed">
            {{ t('reader.previewSample') }}
          </p>
        </div>
      </div>

      <!-- Pagination Mode -->
      <div class="space-y-3">
        <label class="block text-xs font-bold uppercase tracking-wider text-zinc-500">
          {{ t('reader.paginationMode') }}
        </label>
        <div class="grid grid-cols-2 gap-2 rounded-2xl bg-zinc-100 p-1.5">
          <button
            type="button"
            class="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-all"
            :class="
              readerStore.settings.paginationMode === 'scroll'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            "
            @click="selectPaginationMode('scroll')"
          >
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
              />
            </svg>
            <span>{{ t('reader.paginationScroll') }}</span>
          </button>
          <button
            type="button"
            class="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-all"
            :class="
              readerStore.settings.paginationMode === 'buttons'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            "
            @click="selectPaginationMode('buttons')"
          >
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            <span>{{ t('reader.paginationButtons') }}</span>
          </button>
        </div>
      </div>

      <!-- Font Size -->
      <div class="space-y-3">
        <label class="block text-xs font-bold uppercase tracking-wider text-zinc-500">
          {{ t('reader.fontSize') }} ({{ readerStore.settings.fontSize }}px)
        </label>
        <div class="flex items-center justify-between gap-4 rounded-2xl bg-zinc-100 p-2">
          <button
            type="button"
            class="flex h-10 w-12 items-center justify-center rounded-xl bg-white text-sm font-bold text-zinc-800 shadow-sm transition-all active:scale-95"
            @click="decreaseFont"
          >
            A-
          </button>
          <span class="text-sm font-semibold text-zinc-700"
            >{{ readerStore.settings.fontSize }}px</span
          >
          <button
            type="button"
            class="flex h-10 w-12 items-center justify-center rounded-xl bg-white text-base font-bold text-zinc-800 shadow-sm transition-all active:scale-95"
            @click="increaseFont"
          >
            A+
          </button>
        </div>
      </div>

      <!-- Screen & Hardware Controls -->
      <ScreenControlSettings :compact="true" />
    </div>
  </div>
</template>
