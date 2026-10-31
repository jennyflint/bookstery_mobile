<script setup lang="ts">
import { ref, computed } from 'vue';
import type { BookRecord } from '../../types';
import { useLongPress } from '../../composables/useLongPress';

const props = defineProps<{
  book: BookRecord;
}>();

const emit = defineEmits<{
  (e: 'select', book: BookRecord): void;
  (e: 'delete', id: string): void;
  (e: 'open-menu', book: BookRecord): void;
}>();

const { t } = useI18n();

const {
  isTriggered: isLongPressed,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onTouchCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onContextMenu,
} = useLongPress(() => {
  emit('open-menu', props.book);
});

const handleClick = (): void => {
  if (isLongPressed.value) {
    return;
  }
  emit('select', props.book);
};

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
    class="app-card group relative flex cursor-pointer select-none flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
    @click="handleClick"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchCancel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @contextmenu="onContextMenu"
  >
    <div class="flex items-start justify-between gap-2">
      <span
        class="inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
        :class="formatBadgeClass(props.book.format)"
      >
        {{ props.book.format }}
      </span>

      <button
        type="button"
        class="rounded-lg p-1.5 text-zinc-400 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 group-hover:opacity-100"
        :title="t('library.deleteBook')"
        @click.stop="emit('delete', props.book.id)"
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

    <div
      class="relative my-3 flex h-44 w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-100 bg-zinc-100 shadow-inner"
    >
      <div
        v-if="props.book.is_pinned === 1"
        data-testid="pinned-badge"
        class="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/80 bg-[#E8BE54] text-[#3E5725] shadow-md"
        :title="t('library.pinned')"
      >
        <svg
          class="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
        </svg>
      </div>

      <img
        :src="coverSrc"
        :alt="props.book.title"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        @error="handleImageError"
      />
    </div>

    <div class="my-4">
      <h3
        class="line-clamp-2 text-base font-bold leading-tight text-zinc-900 transition-colors group-hover:text-indigo-600"
      >
        {{ props.book.title }}
      </h3>
      <p
        v-if="props.book.author"
        class="mt-1 line-clamp-1 text-xs font-medium text-zinc-500"
      >
        {{ props.book.author }}
      </p>
    </div>

    <div class="mt-auto space-y-2">
      <div class="flex items-center justify-between text-xs font-semibold text-zinc-500">
        <span>{{ t('library.progress') }}</span>
        <span>{{ Math.round(props.book.progress_percentage) }}%</span>
      </div>

      <div class="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          class="h-1.5 rounded-full bg-indigo-600 transition-all duration-300"
          :style="{ width: `${Math.min(Math.max(props.book.progress_percentage, 0), 100)}%` }"
        />
      </div>
    </div>
  </div>
</template>
