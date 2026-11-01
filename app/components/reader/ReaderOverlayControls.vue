<script setup lang="ts">
import { useReaderStore } from '../../stores/readerStore';
import { useTtsStore } from '../../stores/ttsStore';
import ReaderHeader from './ReaderHeader.vue';
import ReaderProgressBar from './ReaderProgressBar.vue';

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'next'): void;
  (e: 'prev'): void;
  (e: 'open-settings'): void;
  (e: 'open-notes'): void;
  (e: 'chapter-tldr'): void;
  (e: 'navigate', page: number): void;
  (e: 'toggle-tts'): void;
}>();

const { t } = useI18n();
const readerStore = useReaderStore();
const ttsStore = useTtsStore();
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
      <ReaderHeader
        v-if="!readerStore.isImmersiveMode"
        @back="emit('back')"
        @open-settings="emit('open-settings')"
        @open-notes="emit('open-notes')"
        @chapter-tldr="emit('chapter-tldr')"
        @toggle-tts="emit('toggle-tts')"
      />
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
          <span v-else-if="readerStore.currentPage && readerStore.currentPage > 1">
            {{ t('reader.page') }} {{ readerStore.currentPage }}
          </span>
          <span v-else>{{ readerStore.locator }}</span>
        </div>

        <ReaderProgressBar
          :current-page="readerStore.currentPage"
          :total-pages="readerStore.totalPages"
          :progress-percentage="readerStore.progressPercentage"
          :chapter-title="readerStore.currentChapterTitle"
          :locator="readerStore.locator"
          @navigate="emit('navigate', $event)"
        />

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
