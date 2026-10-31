<script setup lang="ts">
import { ref, computed } from 'vue';
import type { BookRecord } from '../../types';

const props = defineProps<{
  book: BookRecord;
}>();

const emit = defineEmits<{
  (e: 'select', book: BookRecord): void;
  (e: 'delete', id: string): void;
}>();

const { t } = useI18n();

const DEFAULT_COVER = '/img/covers/default.webp';
const failedSources = ref<Set<string>>(new Set());

const coverSrc = computed(() => {
  const bookId = props.book.id;

  if (typeof window !== 'undefined' && bookId) {
    const cached = localStorage.getItem(`bookstery_cover_${bookId}`);
    if (cached && !failedSources.value.has(cached)) {
      return cached;
    }
  }

  if (props.book.cover_path && !failedSources.value.has(props.book.cover_path)) {
    return props.book.cover_path;
  }

  return DEFAULT_COVER;
});

const handleImageError = () => {
  const current = coverSrc.value;
  if (current && current !== DEFAULT_COVER) {
    failedSources.value.add(current);
  }
};

const formatBadgeClass = (format: string) => {
  switch (format) {
    case 'pdf':
      return 'bg-rose-100 text-rose-700 border-rose-200';
    case 'epub':
      return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    case 'fb2':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    default:
      return 'bg-zinc-100 text-zinc-700 border-zinc-200';
  }
};
</script>

<template>
  <div
    data-testid="book-card"
    class="group relative flex flex-col justify-between app-card bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-[0.98]"
    @click="emit('select', props.book)"
  >
    <div class="flex items-start justify-between gap-2">
      <span
        class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border"
        :class="formatBadgeClass(props.book.format)"
      >
        {{ props.book.format }}
      </span>

      <button
        type="button"
        class="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
        :title="t('library.deleteBook')"
        @click.stop="emit('delete', props.book.id)"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>

    <div class="w-full h-44 my-3 rounded-xl overflow-hidden bg-zinc-100 flex items-center justify-center border border-zinc-100 shadow-inner">
      <img
        :src="coverSrc"
        :alt="props.book.title"
        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        @error="handleImageError"
      />
    </div>

    <div class="my-4">
      <h3 class="font-bold text-zinc-900 text-base line-clamp-2 leading-tight group-hover:text-indigo-600 transition-colors">
        {{ props.book.title }}
      </h3>
      <p v-if="props.book.author" class="text-xs text-zinc-500 line-clamp-1 mt-1 font-medium">
        {{ props.book.author }}
      </p>
    </div>

    <div class="mt-auto space-y-2">
      <div class="flex items-center justify-between text-xs font-semibold text-zinc-500">
        <span>{{ t('library.progress') }}</span>
        <span>{{ Math.round(props.book.progress_percentage) }}%</span>
      </div>

      <div class="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
        <div
          class="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
          :style="{ width: `${Math.min(Math.max(props.book.progress_percentage, 0), 100)}%` }"
        />
      </div>
    </div>
  </div>
</template>
