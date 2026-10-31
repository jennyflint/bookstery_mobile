<script setup lang="ts">
import { useReaderStore } from '../../stores/readerStore';

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'next'): void;
  (e: 'prev'): void;
  (e: 'open-settings'): void;
}>();

const { t } = useI18n();
const readerStore = useReaderStore();
</script>

<template>
  <div class="pointer-events-none fixed inset-0 z-40 flex flex-col justify-between">
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="-translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="-translate-y-full opacity-0"
    >
      <header
        v-if="!readerStore.isImmersiveMode"
        class="pointer-events-auto flex items-center justify-between px-4 py-3 bg-white/95 backdrop-blur border-b border-zinc-200 shadow-sm"
        :style="{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }"
      >
        <button
          type="button"
          class="p-2 rounded-xl text-zinc-600 hover:bg-zinc-100 active:scale-95 transition-all"
          @click="emit('back')"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <h2 class="text-sm font-bold text-zinc-800 truncate max-w-[200px] text-center">
          {{ readerStore.currentBook?.title || 'Bookstery' }}
        </h2>

        <button
          type="button"
          class="p-2 rounded-xl text-zinc-600 hover:bg-zinc-100 active:scale-95 transition-all"
          :title="t('reader.settings')"
          @click="emit('open-settings')"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </button>
      </header>
    </transition>

    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-full opacity-0"
    >
      <footer
        v-if="!readerStore.isImmersiveMode"
        class="pointer-events-auto flex flex-col gap-2 px-6 py-4 bg-white/95 backdrop-blur border-t border-zinc-200 shadow-lg"
        :style="{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }"
      >
        <div class="flex items-center justify-between text-xs font-semibold text-zinc-500">
          <span>{{ Math.round(readerStore.progressPercentage) }}%</span>
          <span v-if="readerStore.totalPages > 1">
            {{ t('reader.page') }} {{ readerStore.currentPage }} {{ t('reader.of') }} {{ readerStore.totalPages }}
          </span>
          <span v-else>{{ readerStore.locator }}</span>
        </div>

        <div class="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
          <div
            class="bg-indigo-600 h-1.5 rounded-full transition-all duration-200"
            :style="{ width: `${Math.min(Math.max(readerStore.progressPercentage, 0), 100)}%` }"
          />
        </div>

        <div class="flex items-center justify-between pt-2">
          <button
            type="button"
            data-testid="prev-page-btn"
            class="flex items-center gap-1 px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 active:scale-95 text-zinc-800 text-xs font-bold transition-all"
            @click="emit('prev')"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
            <span>{{ t('reader.previous') }}</span>
          </button>

          <button
            type="button"
            data-testid="next-page-btn"
            class="flex items-center gap-1 px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 active:scale-95 text-zinc-800 text-xs font-bold transition-all"
            @click="emit('next')"
          >
            <span>{{ t('reader.next') }}</span>
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </footer>
    </transition>
  </div>
</template>
