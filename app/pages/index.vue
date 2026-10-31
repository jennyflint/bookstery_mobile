<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLibraryStore } from '../stores/libraryStore';
import { useAuth } from '../composables/useAuth';
import { useBookSync } from '../composables/useBookSync';
import type { BookRecord } from '../types';
import AppLogo from '../components/ui/AppLogo.vue';
import BookGrid from '../components/library/BookGrid.vue';
import DeviceScannerModal from '../components/library/DeviceScannerModal.vue';
import SyncStatusBadge from '../components/common/SyncStatusBadge.vue';
import LanguageSwitcher from '../components/common/LanguageSwitcher.vue';
import GoogleSignInButton from '../components/auth/GoogleSignInButton.vue';

const { t } = useI18n();
const router = useRouter();
const libraryStore = useLibraryStore();
const { initAuth } = useAuth();
const { initSync } = useBookSync();
const isScannerOpen = ref(false);

onMounted(async () => {
  await initAuth();
  await initSync();
  await libraryStore.loadBooks();
});

const handleSelectBook = (book: BookRecord) => {
  libraryStore.setActiveBook(book);
  router.push(`/reader/${book.id}`);
};

const openScanner = () => {
  isScannerOpen.value = true;
};

const closeScanner = () => {
  isScannerOpen.value = false;
};

const handleImported = async () => {
  await libraryStore.loadBooks();
};
</script>

<template>
  <div class="min-h-screen app-shell flex flex-col justify-between text-zinc-900 pb-20">
    <header
      class="sticky top-0 z-30 app-header bg-white/90 backdrop-blur border-b border-zinc-200 px-4 py-3"
      :style="{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }"
    >
      <div class="max-w-5xl mx-auto flex items-center justify-between gap-3">
        <AppLogo :subtitle="t('library.title')" />

        <div class="flex items-center gap-2">
          <SyncStatusBadge />
          <LanguageSwitcher />
        </div>
      </div>
    </header>

    <main class="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6">
      <div class="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 app-card bg-white p-4 rounded-3xl border border-zinc-200 shadow-sm">
        <GoogleSignInButton />
        <p class="text-xs text-zinc-400 font-medium max-w-sm hidden sm:block">
          {{ t('auth.cloudSyncNotice') }}
        </p>
      </div>

      <BookGrid
        @select-book="handleSelectBook"
        @open-scanner="openScanner"
      />
    </main>

    <DeviceScannerModal
      :is-open="isScannerOpen"
      @close="closeScanner"
      @imported="handleImported"
    />

    <nav
      class="fixed bottom-0 left-0 right-0 z-40 app-nav bg-white/95 backdrop-blur border-t border-zinc-200 px-6 py-2"
      :style="{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }"
    >
      <div class="max-w-md mx-auto flex items-center justify-around">
        <NuxtLink
          to="/"
          class="flex flex-col items-center gap-1 text-indigo-600 font-bold text-xs"
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
          class="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-600 font-semibold text-xs transition-colors"
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
