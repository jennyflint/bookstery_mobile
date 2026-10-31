<script setup lang="ts">
import { onMounted } from 'vue';
import { useDictionaryStore } from '../stores/dictionaryStore';
import { TranslationService } from '../services/translation/TranslationService';
import LanguageSwitcher from '../components/common/LanguageSwitcher.vue';

const { t } = useI18n();
const dictionaryStore = useDictionaryStore();
const translationService = TranslationService.getInstance();

onMounted(async () => {
  await dictionaryStore.loadHistory();
});

const handleDelete = async (id?: number) => {
  if (id) {
    await dictionaryStore.deleteItem(id);
  }
};

const handleCopy = async (text: string) => {
  await translationService.copyToClipboard(text);
};
</script>

<template>
  <div class="min-h-screen bg-zinc-50 flex flex-col justify-between text-zinc-900 pb-20">
    <header
      class="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-zinc-200 px-4 py-3"
      :style="{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }"
    >
      <div class="max-w-3xl mx-auto flex items-center justify-between">
        <div>
          <h1 class="font-extrabold text-lg tracking-tight text-zinc-900">
            {{ t('dictionary.title') }}
          </h1>
          <p class="text-xs text-zinc-400 font-medium">
            {{ dictionaryStore.items.length }} {{ t('dictionary.title').toLowerCase() }}
          </p>
        </div>
        <LanguageSwitcher />
      </div>
    </header>

    <main class="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 space-y-4">
      <div v-if="dictionaryStore.items.length > 0" class="space-y-3">
        <div
          v-for="item in dictionaryStore.items"
          :key="item.id"
          class="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm space-y-2"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <span class="inline-block text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded mb-1">
                {{ item.source_lang || 'auto' }} &rarr; {{ item.target_lang }}
              </span>
              <p class="text-sm font-semibold text-zinc-900 leading-snug">{{ item.source_text }}</p>
              <p class="text-sm text-indigo-600 font-medium mt-1 leading-snug">{{ item.translated_text }}</p>
            </div>

            <div class="flex items-center gap-1">
              <button
                type="button"
                class="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                :title="t('translation.copy')"
                @click="handleCopy(item.translated_text)"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>

              <button
                type="button"
                class="p-2 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                :title="t('dictionary.delete')"
                @click="handleDelete(item.id)"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        v-else
        class="flex flex-col items-center justify-center py-20 px-4 text-center rounded-3xl border border-dashed border-zinc-200 bg-zinc-50"
      >
        <div class="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
          <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
          </svg>
        </div>
        <h3 class="text-base font-bold text-zinc-900 mb-1">{{ t('dictionary.empty') }}</h3>
        <p class="text-xs text-zinc-500 max-w-sm">{{ t('dictionary.emptySubtitle') }}</p>
      </div>
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
          class="flex flex-col items-center gap-1 text-indigo-600 font-bold text-xs"
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
