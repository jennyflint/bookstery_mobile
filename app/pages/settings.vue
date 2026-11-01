<script setup lang="ts">
import { ref } from 'vue';
import { useReaderStore } from '../stores/readerStore';
import {
  useAppThemeStore,
  APP_BUTTON_SWATCHES,
  APP_BG_SWATCHES,
  DEFAULT_APP_BUTTON_COLOR,
  DEFAULT_APP_BG_COLOR,
} from '../stores/appThemeStore';
import AppLogo from '../components/ui/AppLogo.vue';
import LanguageSwitcher from '../components/common/LanguageSwitcher.vue';
import GoogleSignInButton from '../components/auth/GoogleSignInButton.vue';
import SyncStatusBadge from '../components/common/SyncStatusBadge.vue';
import ScanDirectoriesSettings from '../components/settings/ScanDirectoriesSettings.vue';
import AiSettingsModal from '../components/ai/AiSettingsModal.vue';
import { useAiStore } from '../stores/aiStore';
import type { ReaderTheme } from '../types';

const { t } = useI18n();
const readerStore = useReaderStore();
const appThemeStore = useAppThemeStore();
const aiStore = useAiStore();

const buttonColorInputRef = ref<HTMLInputElement | null>(null);
const appBgColorInputRef = ref<HTMLInputElement | null>(null);
const bgInputRef = ref<HTMLInputElement | null>(null);
const textInputRef = ref<HTMLInputElement | null>(null);

const bgSwatches = ['#ffffff', '#fbf0d9', '#f4ecd8', '#eaf4ec', '#18181b', '#000000'];
const textSwatches = ['#18181b', '#433422', '#1e3a8a', '#2e4a36', '#f4f4f5', '#e4e4e7'];

const themes: { id: ReaderTheme; nameKey: string }[] = [
  { id: 'light', nameKey: 'theme.light' },
  { id: 'sepia', nameKey: 'theme.sepia' },
  { id: 'night', nameKey: 'theme.night' },
  { id: 'oled', nameKey: 'theme.oled' },
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

const triggerButtonColorPicker = () => {
  buttonColorInputRef.value?.click();
};

const triggerAppBgColorPicker = () => {
  appBgColorInputRef.value?.click();
};

const handleButtonColorChange = (color: string) => {
  appThemeStore.setButtonColor(color);
};

const handleAppBgColorChange = (color: string) => {
  appThemeStore.setBackgroundColor(color);
};

const handleResetAllToDefault = () => {
  appThemeStore.resetAllToDefault();
  readerStore.resetToDefault();
};
</script>

<template>
  <div class="min-h-screen app-shell flex flex-col justify-between text-zinc-900 pb-20">
    <header
      class="sticky top-0 z-30 app-header bg-white/90 backdrop-blur border-b border-zinc-200 px-4 py-3"
      :style="{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }"
    >
      <div class="max-w-2xl mx-auto flex items-center justify-between gap-3">
        <AppLogo :subtitle="t('settings.title')" />
        <SyncStatusBadge />
      </div>
    </header>

    <main class="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 space-y-6">
      <section class="app-card bg-white rounded-3xl p-5 border border-zinc-200 shadow-sm space-y-4">
        <h2 class="text-xs font-bold text-zinc-400 uppercase tracking-wider">
          {{ t('settings.account') }}
        </h2>
        <GoogleSignInButton />
        <p class="text-xs text-zinc-500 leading-relaxed">
          {{ t('auth.cloudSyncNotice') }}
        </p>
      </section>

      <!-- Block 1: App Buttons Color -->
      <section class="app-card bg-white rounded-3xl p-5 border border-zinc-200 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              {{ t('settings.buttonColor') }}
            </h2>
            <p class="text-xs text-zinc-500 mt-0.5">
              {{ t('settings.buttonColorSubtitle') }}
            </p>
          </div>
          <span class="font-mono text-zinc-500 uppercase text-xs font-semibold">
            {{ appThemeStore.buttonColor }}
          </span>
        </div>

        <div class="flex items-center gap-3">
          <!-- Button Native Color Picker -->
          <div
            class="relative w-12 h-12 rounded-2xl border border-zinc-300 shadow-sm cursor-pointer flex items-center justify-center overflow-hidden shrink-0 transition-transform active:scale-95"
            :style="{ backgroundColor: appThemeStore.buttonColor }"
            @click="triggerButtonColorPicker"
          >
            <input
              ref="buttonColorInputRef"
              type="color"
              :value="appThemeStore.buttonColor"
              class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              @input="handleButtonColorChange(($event.target as HTMLInputElement).value)"
            />
            <svg class="w-5 h-5 text-white drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4 4 4 0 014-4c.73 0 1.41.2 2 .54V7a2 2 0 012-2h4a2 2 0 012 2v6.54c.59-.34 1.27-.54 2-.54a4 4 0 014 4 4 4 0 01-4 4H7z" />
            </svg>
          </div>

          <!-- Button Swatches -->
          <div class="flex items-center gap-2 flex-wrap">
            <button
              v-for="swatch in APP_BUTTON_SWATCHES"
              :key="swatch.id"
              type="button"
              :title="swatch.name"
              class="w-8 h-8 rounded-xl border transition-all active:scale-95 shadow-xs relative flex items-center justify-center"
              :style="{
                backgroundColor: swatch.color,
                borderColor: appThemeStore.buttonColor.toLowerCase() === swatch.color.toLowerCase() ? '#000000' : 'transparent',
              }"
              @click="appThemeStore.setButtonColor(swatch.color)"
            >
              <svg
                v-if="appThemeStore.buttonColor.toLowerCase() === swatch.color.toLowerCase()"
                class="w-4 h-4 text-white drop-shadow"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      <!-- Block 2: App Background Color -->
      <section class="app-card bg-white rounded-3xl p-5 border border-zinc-200 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              {{ t('settings.appBackgroundColor') }}
            </h2>
            <p class="text-xs text-zinc-500 mt-0.5">
              {{ t('settings.appBackgroundColorSubtitle') }}
            </p>
          </div>
          <span class="font-mono text-zinc-500 uppercase text-xs font-semibold">
            {{ appThemeStore.backgroundColor }}
          </span>
        </div>

        <div class="flex items-center gap-3">
          <!-- Background Native Color Picker -->
          <div
            class="relative w-12 h-12 rounded-2xl border border-zinc-300 shadow-sm cursor-pointer flex items-center justify-center overflow-hidden shrink-0 transition-transform active:scale-95"
            :style="{ backgroundColor: appThemeStore.backgroundColor }"
            @click="triggerAppBgColorPicker"
          >
            <input
              ref="appBgColorInputRef"
              type="color"
              :value="appThemeStore.backgroundColor"
              class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              @input="handleAppBgColorChange(($event.target as HTMLInputElement).value)"
            />
            <svg class="w-5 h-5 text-zinc-400 drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4 4 4 0 014-4c.73 0 1.41.2 2 .54V7a2 2 0 012-2h4a2 2 0 012 2v6.54c.59-.34 1.27-.54 2-.54a4 4 0 014 4 4 4 0 01-4 4H7z" />
            </svg>
          </div>

          <!-- Background Swatches -->
          <div class="flex items-center gap-2 flex-wrap">
            <button
              v-for="swatch in APP_BG_SWATCHES"
              :key="swatch.id"
              type="button"
              :title="swatch.name"
              class="w-8 h-8 rounded-xl border transition-all active:scale-95 shadow-xs relative flex items-center justify-center"
              :style="{
                backgroundColor: swatch.color,
                borderColor: appThemeStore.backgroundColor.toLowerCase() === swatch.color.toLowerCase() ? '#6366f1' : '#e4e4e7',
              }"
              @click="appThemeStore.setBackgroundColor(swatch.color)"
            >
              <svg
                v-if="appThemeStore.backgroundColor.toLowerCase() === swatch.color.toLowerCase()"
                class="w-4 h-4 drop-shadow"
                :class="swatch.color === '#000000' || swatch.color === '#18181b' || swatch.color === '#0f172a' ? 'text-white' : 'text-zinc-800'"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Live App Window Preview -->
        <div
          class="p-4 rounded-2xl border transition-all duration-200 space-y-3"
          :style="{
            backgroundColor: appThemeStore.backgroundColor,
            borderColor: 'var(--color-app-border)',
          }"
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {{ t('settings.appPreview') }}
            </span>
            <span class="text-[10px] font-mono text-zinc-400">
              {{ appThemeStore.buttonColor }} / {{ appThemeStore.backgroundColor }}
            </span>
          </div>

          <div
            class="p-3.5 rounded-xl border shadow-xs flex items-center justify-between gap-3 flex-wrap"
            :style="{
              backgroundColor: 'var(--color-app-surface)',
              borderColor: 'var(--color-app-border)',
            }"
          >
            <div class="flex items-center gap-2.5 logo">
              <img
                src="/logo.png"
                alt="Bookstery"
                class="w-7 h-7 object-contain select-none"
                
              >
              <span class="text-xs font-bold" :style="{ color: 'var(--color-app-text)' }">
                Bookstery
              </span>
            </div>

            <div class="flex items-center gap-2">
              <span
                class="px-2.5 py-1 rounded-full text-[10px] font-bold border"
                :style="{
                  backgroundColor: 'var(--color-app-accent-50)',
                  color: appThemeStore.buttonColor,
                  borderColor: 'var(--color-app-accent-200)',
                }"
              >
                {{ t('settings.sampleBadge') }}
              </span>
              <button
                type="button"
                class="px-3.5 py-1.5 rounded-xl font-bold text-xs text-white shadow-xs transition-transform active:scale-95"
                :style="{ backgroundColor: appThemeStore.buttonColor }"
              >
                {{ t('settings.sampleButton') }}
              </button>
            </div>
          </div>
        </div>

        <!-- Reset to default button -->
        <div class="pt-1 flex justify-end">
          <button
            type="button"
            class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 active:scale-95 transition-all"
            @click="handleResetAllToDefault"
          >
            <svg class="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{{ t('settings.resetAllDefaults') }}</span>
          </button>
        </div>
      </section>

      <section class="app-card bg-white rounded-3xl p-5 border border-zinc-200 shadow-sm space-y-4">
        <h2 class="text-xs font-bold text-zinc-400 uppercase tracking-wider">
          {{ t('settings.readingPreferences') }}
        </h2>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-xs font-semibold text-zinc-700 block">{{ t('reader.theme') }}</label>
            <span
              v-if="readerStore.settings.theme === 'custom'"
              class="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200"
            >
              {{ t('theme.custom') }}
            </span>
          </div>
          <div class="grid grid-cols-4 gap-2">
            <button
              v-for="item in themes"
              :key="item.id"
              type="button"
              class="py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all"
              :class="readerStore.settings.theme === item.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'"
              @click="selectTheme(item.id)"
            >
              {{ t(item.nameKey) }}
            </button>
          </div>
        </div>

        <!-- Custom Color Pickers -->
        <div class="space-y-4 bg-zinc-50 p-4 rounded-2xl border border-zinc-200/80">
          <div class="flex items-center justify-between">
            <label class="text-xs font-bold text-zinc-700 uppercase tracking-wider">
              {{ t('reader.customColors') }}
            </label>
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
          <div class="space-y-1.5 pt-1">
            <div class="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              {{ t('reader.preview') }}
            </div>
            <div
              class="p-3.5 rounded-xl border border-zinc-200/80 shadow-inner transition-colors duration-200 text-xs leading-relaxed"
              :style="{
                backgroundColor: readerStore.settings.customBackgroundColor,
                color: readerStore.settings.customTextColor,
              }"
            >
              <p class="font-medium">
                {{ t('reader.previewSample') }}
              </p>
            </div>
          </div>
        </div>

        <div class="space-y-2 pt-2">
          <label class="text-xs font-semibold text-zinc-700 block">
            {{ t('reader.paginationMode') }}
          </label>
          <div class="grid grid-cols-2 gap-2 bg-zinc-100 p-1.5 rounded-2xl">
            <button
              type="button"
              class="py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
              :class="readerStore.settings.paginationMode === 'scroll'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'"
              @click="readerStore.setPaginationMode('scroll')"
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
              @click="readerStore.setPaginationMode('buttons')"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>{{ t('reader.paginationButtons') }}</span>
            </button>
          </div>
        </div>

        <div class="space-y-2 pt-2">
          <div class="flex items-center justify-between text-xs font-semibold text-zinc-700">
            <span>{{ t('reader.fontSize') }}</span>
            <span>{{ readerStore.settings.fontSize }}px</span>
          </div>
          <input
            type="range"
            min="12"
            max="32"
            step="1"
            :value="readerStore.settings.fontSize"
            class="w-full accent-indigo-600 cursor-pointer"
            @input="readerStore.setFontSize(Number(($event.target as HTMLInputElement).value))"
          />
        </div>
      </section>

      <ScanDirectoriesSettings />

      <section class="app-card bg-white rounded-3xl p-5 border border-zinc-200 shadow-sm flex items-center justify-between dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#C8E695] text-[#3E5725]">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">{{ t('ai.settingsTitle') }}</h2>
            <p class="text-xs text-zinc-400 font-medium">
              {{ aiStore.isConfigured ? `${aiStore.settings.provider.toUpperCase()} (${aiStore.settings.model_id})` : t('ai.onboardingSubtitle') }}
            </p>
          </div>
        </div>
        <button
          type="button"
          data-testid="open-ai-settings-btn"
          class="rounded-2xl bg-[#3E5725] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#3E5725]/90 active:scale-95 dark:bg-[#C8E695] dark:text-[#3E5725]"
          @click="aiStore.openSettingsModal"
        >
          {{ t('ai.provider') }}
        </button>
      </section>

      <section class="app-card bg-white rounded-3xl p-5 border border-zinc-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 class="text-sm font-bold text-zinc-900">{{ t('settings.language') }}</h2>
          <p class="text-xs text-zinc-400 font-medium">Українська / English</p>
        </div>
        <LanguageSwitcher />
      </section>

      <section class="p-4 text-center text-xs text-zinc-400 font-medium space-y-1">
        <p>{{ t('app.name') }} &bull; Android Mobile E-Reader</p>
        <p>Version 1.0.0 (Build 2026)</p>
      </section>
    </main>

    <nav
      class="fixed bottom-0 left-0 right-0 z-40 app-nav bg-white/95 backdrop-blur border-t border-zinc-200 px-6 py-2"
      :style="{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }"
    >
      <div class="max-w-md mx-auto flex items-center justify-around">
        <NuxtLink
          to="/"
          class="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-600 font-semibold text-xs transition-colors"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <span>{{ t('nav.library') }}</span>
        </NuxtLink>

        <NuxtLink
          to="/dictionary"
          class="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-600 font-semibold text-xs transition-colors"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
          </svg>
          <span>{{ t('nav.dictionary') }}</span>
        </NuxtLink>

        <NuxtLink
          to="/settings"
          class="flex flex-col items-center gap-1 text-indigo-600 font-bold text-xs"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>{{ t('nav.settings') }}</span>
        </NuxtLink>
      </div>
    </nav>

    <AiSettingsModal
      :is-open="aiStore.isSettingsModalOpen"
      @close="aiStore.closeSettingsModal"
    />
  </div>
</template>