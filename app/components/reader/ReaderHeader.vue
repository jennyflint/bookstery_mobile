<script setup lang="ts">
import { ref, computed } from 'vue';
import { useReaderStore } from '../../stores/readerStore';
import { useTtsStore } from '../../stores/ttsStore';
import SyncStatusBadge from '../common/SyncStatusBadge.vue';
import type { ReflowFontFamily, ReflowTheme } from '../../types/reflow';

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'open-settings'): void;
  (e: 'open-notes'): void;
  (e: 'chapter-tldr'): void;
  (e: 'toggle-tts'): void;
}>();

const { t } = useI18n();
const readerStore = useReaderStore();
const ttsStore = useTtsStore();

const isTypographyOpen = ref<boolean>(false);

const isPdf = computed<boolean>(() => {
  return readerStore.currentBook?.format === 'pdf';
});

function toggleTypography(): void {
  isTypographyOpen.value = !isTypographyOpen.value;
}

function closeTypography(): void {
  isTypographyOpen.value = false;
}

function handleToggleReflow(): void {
  readerStore.toggleReflowMode();
}

function handleFontSizeChange(delta: number): void {
  readerStore.setReflowFontSize(readerStore.reflowFontSize + delta);
}

function handleLineHeightChange(delta: number): void {
  const current = readerStore.reflowLineHeight;
  const next = Math.round((current + delta) * 100) / 100;
  readerStore.setReflowLineHeight(next);
}

function handleFontFamilyChange(family: ReflowFontFamily): void {
  readerStore.setReflowFontFamily(family);
}

function handleThemeChange(theme: ReflowTheme): void {
  readerStore.setReflowTheme(theme);
}

defineExpose({
  isTypographyOpen,
  closeTypography,
});
</script>

<template>
  <div class="relative w-full">
    <header
      data-testid="reader-header"
      class="pointer-events-auto flex items-center justify-between px-4 py-3 bg-white/95 backdrop-blur border-b border-zinc-200 shadow-sm"
      :style="{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }"
    >
      <button
        type="button"
        data-testid="reader-back-btn"
        aria-label="Back"
        class="p-2 rounded-xl text-zinc-600 hover:bg-zinc-100 active:scale-95 transition-all"
        @click="emit('back')"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <h2 class="text-sm font-bold text-zinc-800 truncate max-w-[170px] sm:max-w-[240px] text-center">
        {{ readerStore.currentBook?.title || 'Bookstery' }}
      </h2>

      <div class="flex items-center gap-1">
        <SyncStatusBadge />

        <!-- PDF Reflow Mode Toggle -->
        <button
          v-if="isPdf"
          type="button"
          data-testid="reflow-mode-toggle-btn"
          class="p-2 rounded-xl transition-all active:scale-95 flex items-center justify-center"
          :class="
            readerStore.isReflowMode
              ? 'text-indigo-600 bg-indigo-50 font-bold shadow-sm ring-1 ring-indigo-200'
              : 'text-zinc-600 hover:bg-zinc-100'
          "
          :title="readerStore.isReflowMode ? t('reader.originalLayout') : t('reader.reflowMode')"
          @click="handleToggleReflow"
        >
          <!-- Reflow / Text Wrap Icon -->
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 6h16M4 12h10m-10 6h16m-4-6l3-3m0 0l3 3m-3-3v6"
            />
          </svg>
        </button>

        <!-- Reflow Typography Popover Toggle -->
        <button
          v-if="isPdf && readerStore.isReflowMode"
          type="button"
          data-testid="reflow-typography-btn"
          class="p-2 rounded-xl transition-all active:scale-95 text-indigo-600 hover:bg-indigo-100/50"
          :class="{ 'bg-indigo-100 font-bold ring-1 ring-indigo-300': isTypographyOpen }"
          :title="t('reader.typography')"
          @click="toggleTypography"
        >
          <!-- Typography "Aa" Icon -->
          <span class="text-xs font-serif font-black tracking-tighter leading-none select-none">
            Aa
          </span>
        </button>

        <!-- TTS Read Aloud -->
        <button
          type="button"
          data-testid="tts-read-aloud-btn"
          class="p-2 rounded-xl text-zinc-600 hover:bg-zinc-100 active:scale-95 transition-all"
          :class="{ 'text-indigo-600 bg-indigo-50 font-bold': ttsStore.isActive }"
          :title="t('tts.readAloud')"
          @click="emit('toggle-tts')"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
            />
          </svg>
        </button>

        <!-- Chapter TL;DR AI Action -->
        <button
          type="button"
          data-testid="chapter-tldr-action"
          class="p-2 rounded-xl text-[#3E5725] bg-[#C8E695]/30 hover:bg-[#C8E695]/60 active:scale-95 transition-all dark:text-[#C8E695] dark:bg-[#C8E695]/20"
          :title="t('ai.chapterTldr')"
          @click="emit('chapter-tldr')"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>

        <!-- Notes Drawer -->
        <button
          type="button"
          data-testid="open-notes-drawer-btn"
          class="p-2 rounded-xl text-zinc-600 hover:bg-zinc-100 active:scale-95 transition-all"
          :title="t('highlights.notesTitle')"
          @click="emit('open-notes')"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
            />
          </svg>
        </button>

        <!-- Reader Settings -->
        <button
          type="button"
          class="p-2 rounded-xl text-zinc-600 hover:bg-zinc-100 active:scale-95 transition-all"
          :title="t('reader.settings')"
          @click="emit('open-settings')"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
            />
          </svg>
        </button>
      </div>
    </header>

    <!-- Typography Settings Popover for Reflow Mode -->
    <template v-if="isPdf && readerStore.isReflowMode && isTypographyOpen">
      <!-- Backdrop -->
      <div
        data-testid="reflow-typography-backdrop"
        class="fixed inset-0 z-40 bg-black/20"
        @click="closeTypography"
      />

      <!-- Popover Body (Requirements: solid white bg-white text-gray-900 border-gray-200 shadow-xl) -->
      <div
        data-testid="reflow-typography-popover"
        class="absolute right-4 top-16 z-50 w-80 bg-white text-gray-900 border border-gray-200 rounded-2xl shadow-xl p-4 flex flex-col gap-4 select-none animate-in fade-in zoom-in-95 duration-150"
      >
        <div class="flex items-center justify-between pb-2 border-b border-gray-100">
          <span class="text-sm font-bold text-gray-900">{{ t('reader.typography') }}</span>
          <button
            type="button"
            data-testid="reflow-typography-close"
            class="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            @click="closeTypography"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Font Size Controls (14 to 28) -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between text-xs font-semibold text-gray-600">
            <span>{{ t('reader.fontSize') }}</span>
            <span data-testid="reflow-font-size-val" class="font-bold text-gray-900">
              {{ readerStore.reflowFontSize }}px
            </span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="reflow-font-size-dec"
              class="py-2 px-3 rounded-xl border border-gray-200 hover:bg-gray-50 active:scale-95 text-xs font-bold transition-all disabled:opacity-40"
              :disabled="readerStore.reflowFontSize <= 14"
              @click="handleFontSizeChange(-1)"
            >
              A-
            </button>
            <button
              type="button"
              data-testid="reflow-font-size-inc"
              class="py-2 px-3 rounded-xl border border-gray-200 hover:bg-gray-50 active:scale-95 text-xs font-bold transition-all disabled:opacity-40"
              :disabled="readerStore.reflowFontSize >= 28"
              @click="handleFontSizeChange(1)"
            >
              A+
            </button>
          </div>
        </div>

        <!-- Line Height Controls (1.4 to 2.0) -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between text-xs font-semibold text-gray-600">
            <span>{{ t('reader.lineHeight') }}</span>
            <span data-testid="reflow-line-height-val" class="font-bold text-gray-900">
              {{ readerStore.reflowLineHeight.toFixed(2) }}
            </span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="reflow-line-height-dec"
              class="py-2 px-3 rounded-xl border border-gray-200 hover:bg-gray-50 active:scale-95 text-xs font-bold transition-all disabled:opacity-40"
              :disabled="readerStore.reflowLineHeight <= 1.4"
              @click="handleLineHeightChange(-0.1)"
            >
              - 0.1
            </button>
            <button
              type="button"
              data-testid="reflow-line-height-inc"
              class="py-2 px-3 rounded-xl border border-gray-200 hover:bg-gray-50 active:scale-95 text-xs font-bold transition-all disabled:opacity-40"
              :disabled="readerStore.reflowLineHeight >= 2.0"
              @click="handleLineHeightChange(0.1)"
            >
              + 0.1
            </button>
          </div>
        </div>

        <!-- Font Family Controls (Sans, Serif, Mono) -->
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-gray-600">{{ t('reader.fontFamily') }}</span>
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              data-testid="reflow-font-sans"
              class="py-2 px-2 rounded-xl text-xs font-medium font-sans border transition-all text-center"
              :class="
                readerStore.reflowFontFamily === 'sans'
                  ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              "
              @click="handleFontFamilyChange('sans')"
            >
              {{ t('reader.fontSans') }}
            </button>
            <button
              type="button"
              data-testid="reflow-font-serif"
              class="py-2 px-2 rounded-xl text-xs font-medium font-serif border transition-all text-center"
              :class="
                readerStore.reflowFontFamily === 'serif'
                  ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              "
              @click="handleFontFamilyChange('serif')"
            >
              {{ t('reader.fontSerif') }}
            </button>
            <button
              type="button"
              data-testid="reflow-font-mono"
              class="py-2 px-2 rounded-xl text-xs font-medium font-mono border transition-all text-center"
              :class="
                readerStore.reflowFontFamily === 'mono'
                  ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              "
              @click="handleFontFamilyChange('mono')"
            >
              {{ t('reader.fontMono') }}
            </button>
          </div>
        </div>

        <!-- Reading Theme Controls (Light, Sepia, Dark) -->
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-gray-600">{{ t('reader.theme') }}</span>
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              data-testid="reflow-theme-light"
              class="py-2 px-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 bg-white text-gray-900 transition-all"
              :class="
                readerStore.reflowTheme === 'light'
                  ? 'border-indigo-600 ring-2 ring-indigo-500/20 shadow-sm'
                  : 'border-gray-200 hover:bg-gray-50'
              "
              @click="handleThemeChange('light')"
            >
              <span class="w-3 h-3 rounded-full bg-white border border-gray-300" />
              <span>{{ t('reader.themeLight') }}</span>
            </button>

            <button
              type="button"
              data-testid="reflow-theme-sepia"
              class="py-2 px-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 bg-[#f8f1e3] text-[#433422] transition-all"
              :class="
                readerStore.reflowTheme === 'sepia'
                  ? 'border-indigo-600 ring-2 ring-indigo-500/20 shadow-sm'
                  : 'border-amber-200/60 hover:bg-[#f3ead7]'
              "
              @click="handleThemeChange('sepia')"
            >
              <span class="w-3 h-3 rounded-full bg-[#f8f1e3] border border-[#d8caad]" />
              <span>{{ t('reader.themeSepia') }}</span>
            </button>

            <button
              type="button"
              data-testid="reflow-theme-dark"
              class="py-2 px-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 bg-gray-900 text-gray-100 transition-all"
              :class="
                readerStore.reflowTheme === 'dark'
                  ? 'border-indigo-500 ring-2 ring-indigo-500/30 shadow-sm'
                  : 'border-gray-800 hover:bg-gray-800'
              "
              @click="handleThemeChange('dark')"
            >
              <span class="w-3 h-3 rounded-full bg-gray-900 border border-gray-700" />
              <span>{{ t('reader.themeDark') }}</span>
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
