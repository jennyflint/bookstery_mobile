<script setup lang="ts">
import { useReaderStore } from '../stores/readerStore';
import LanguageSwitcher from '../components/common/LanguageSwitcher.vue';
import GoogleSignInButton from '../components/auth/GoogleSignInButton.vue';
import SyncStatusBadge from '../components/common/SyncStatusBadge.vue';
import type { ReaderTheme } from '../types';

const { t } = useI18n();
const readerStore = useReaderStore();

const themes: { id: ReaderTheme; nameKey: string }[] = [
  { id: 'light', nameKey: 'theme.light' },
  { id: 'sepia', nameKey: 'theme.sepia' },
  { id: 'night', nameKey: 'theme.night' },
  { id: 'oled', nameKey: 'theme.oled' },
];

const selectTheme = (theme: ReaderTheme) => {
  readerStore.setTheme(theme);
};
</script>

<template>
  <div class="min-h-screen bg-zinc-50 flex flex-col justify-between text-zinc-900 pb-20">
    <header
      class="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-zinc-200 px-4 py-3"
      :style="{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }"
    >
      <div class="max-w-2xl mx-auto flex items-center justify-between">
        <h1 class="font-extrabold text-lg tracking-tight text-zinc-900">
          {{ t('settings.title') }}
        </h1>
        <SyncStatusBadge />
      </div>
    </header>

    <main class="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 space-y-6">
      <section class="bg-white rounded-3xl p-5 border border-zinc-200 shadow-sm space-y-4">
        <h2 class="text-xs font-bold text-zinc-400 uppercase tracking-wider">
          {{ t('settings.account') }}
        </h2>
        <GoogleSignInButton />
        <p class="text-xs text-zinc-500 leading-relaxed">
          {{ t('auth.cloudSyncNotice') }}
        </p>
      </section>

      <section class="bg-white rounded-3xl p-5 border border-zinc-200 shadow-sm space-y-4">
        <h2 class="text-xs font-bold text-zinc-400 uppercase tracking-wider">
          {{ t('settings.readingPreferences') }}
        </h2>

        <div class="space-y-2">
          <label class="text-xs font-semibold text-zinc-700 block">{{ t('reader.theme') }}</label>
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

      <section class="bg-white rounded-3xl p-5 border border-zinc-200 shadow-sm flex items-center justify-between">
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
      class="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-zinc-200 px-6 py-2"
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
  </div>
</template>
