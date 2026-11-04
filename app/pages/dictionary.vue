<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useDictionaryStore } from '../stores/dictionaryStore';
import { TranslationService } from '../services/translation/TranslationService';
import LanguageSwitcher from '../components/common/LanguageSwitcher.vue';

const { t } = useI18n();
const dictionaryStore = useDictionaryStore();
const translationService = TranslationService.getInstance();

const copyFeedbackId = ref<number | null>(null);

onMounted(async () => {
  await dictionaryStore.loadAll();
});

const handleDeleteVocabulary = async (id?: number) => {
  if (id) {
    await dictionaryStore.deleteVocabularyWord(id);
  }
};

const handleCopy = async (id: number, text: string) => {
  await translationService.copyToClipboard(text);
  copyFeedbackId.value = id;
  setTimeout(() => {
    if (copyFeedbackId.value === id) {
      copyFeedbackId.value = null;
    }
  }, 2000);
};
</script>

<template>
  <div class="app-shell flex min-h-screen flex-col justify-between pb-20 text-zinc-900">
    <header
      class="app-header sticky top-0 z-30 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur"
      :style="{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }"
    >
      <div class="mx-auto flex max-w-3xl items-center justify-between">
        <div>
          <h1 class="text-lg font-extrabold tracking-tight text-zinc-900">
            {{ t('ai.savedVocabulary') }}
          </h1>
          <p class="text-xs font-medium text-zinc-400">
            {{ dictionaryStore.filteredVocabulary.length }}
            {{ t('ai.savedVocabulary').toLowerCase() }}
          </p>
        </div>
        <LanguageSwitcher />
      </div>

      <!-- Search & Book Filter Bar -->
      <div class="mx-auto mt-3 flex max-w-3xl flex-col items-stretch gap-2 sm:flex-row">
        <!-- Search Input -->
        <div class="relative flex-1">
          <input
            v-model="dictionaryStore.searchQuery"
            type="search"
            data-testid="vocab-search-input"
            :placeholder="t('ai.searchVocabularyPlaceholder')"
            class="focus:outline-hidden w-full rounded-xl border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-xs placeholder-zinc-400 focus:border-[#3E5725] focus:ring-1 focus:ring-[#3E5725]"
          />
          <svg
            class="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <!-- Book Filter Dropdown -->
        <select
          v-if="dictionaryStore.uniqueBooks.length > 0"
          v-model="dictionaryStore.selectedBookFilter"
          data-testid="vocab-book-filter"
          class="focus:outline-hidden rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 focus:border-[#3E5725]"
        >
          <option value="">{{ t('ai.allBooks') }}</option>
          <option
            v-for="b in dictionaryStore.uniqueBooks"
            :key="b.id"
            :value="b.id"
          >
            {{ b.title }}
          </option>
        </select>
      </div>
    </header>

    <main class="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 sm:p-6">
      <div class="space-y-3">
        <div
          v-if="dictionaryStore.filteredVocabulary.length > 0"
          class="space-y-3"
        >
          <div
            v-for="word in dictionaryStore.filteredVocabulary"
            :key="word.id"
            data-testid="vocabulary-card"
            class="app-card space-y-2.5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
          >
            <!-- Card Header: Word, phonetic, Part of Speech, Book Tag -->
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-baseline gap-2">
                  <h3 class="text-base font-extrabold text-zinc-900">{{ word.word }}</h3>
                  <span
                    v-if="word.phonetic"
                    class="font-mono text-xs text-zinc-500"
                    >{{ word.phonetic }}</span
                  >
                  <span
                    v-if="word.part_of_speech"
                    class="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-800"
                  >
                    {{ word.part_of_speech }}
                  </span>
                </div>
                <p
                  v-if="word.book_title"
                  class="mt-0.5 truncate text-[11px] font-semibold text-[#3E5725]"
                >
                  {{ word.book_title }}
                </p>
              </div>

              <!-- Action Buttons -->
              <div class="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  class="rounded-xl p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 active:scale-95"
                  :title="t('translation.copy')"
                  @click="
                    handleCopy(
                      word.id!,
                      word.contextual_definition && word.contextual_definition !== word.translation
                        ? `${word.word} — ${word.translation}\n${word.contextual_definition}`
                        : `${word.word} — ${word.translation}`,
                    )
                  "
                >
                  <svg
                    v-if="copyFeedbackId !== word.id"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  <svg
                    v-else
                    class="h-4 w-4 text-emerald-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </button>

                <button
                  type="button"
                  class="rounded-xl p-2 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 active:scale-95"
                  :title="t('dictionary.delete')"
                  @click="handleDeleteVocabulary(word.id)"
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
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Translation & Contextual Definition -->
            <div class="space-y-1 rounded-xl border border-zinc-100 bg-zinc-50 p-3">
              <p class="text-sm font-bold leading-snug text-teal-900">
                {{ word.translation }}
              </p>
              <p
                v-if="word.contextual_definition && word.contextual_definition !== word.translation"
                class="text-xs leading-relaxed text-zinc-700"
              >
                {{ word.contextual_definition }}
              </p>
            </div>

            <!-- Context Sentence Snippet -->
            <div
              v-if="word.context_sentence"
              class="border-l-2 border-zinc-200 pl-1 text-xs italic text-zinc-500"
            >
              "{{ word.context_sentence }}"
            </div>
          </div>
        </div>

        <div
          v-else
          class="flex flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-20 text-center"
        >
          <div
            class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#C8E695]/40 text-[#3E5725]"
          >
            <svg
              class="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>
          <h3 class="mb-1 text-base font-bold text-zinc-900">{{ t('ai.noVocabularySaved') }}</h3>
          <p class="max-w-sm text-xs text-zinc-500">{{ t('ai.noVocabularySubtitle') }}</p>
        </div>
      </div>
    </main>

    <!-- Bottom Navigation Bar -->
    <nav
      class="app-nav fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white/95 px-6 py-2 backdrop-blur"
      :style="{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }"
    >
      <div class="mx-auto flex max-w-md items-center justify-around">
        <NuxtLink
          to="/"
          replace
          class="flex flex-col items-center gap-1 text-xs font-semibold text-zinc-400 transition-colors hover:text-zinc-600"
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
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
          <span>{{ t('nav.library') }}</span>
        </NuxtLink>

        <NuxtLink
          to="/dictionary"
          class="flex flex-col items-center gap-1 text-xs font-bold text-[#3E5725]"
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
              d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
            />
          </svg>
          <span>{{ t('nav.dictionary') }}</span>
        </NuxtLink>

        <NuxtLink
          to="/settings"
          class="flex flex-col items-center gap-1 text-xs font-semibold text-zinc-400 transition-colors hover:text-zinc-600"
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
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span>{{ t('nav.settings') }}</span>
        </NuxtLink>
      </div>
    </nav>
  </div>
</template>
