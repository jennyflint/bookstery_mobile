<script setup lang="ts">
import { watch, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useScannerStore } from '../../stores/scannerStore';

const { t } = useI18n();
const router = useRouter();
const scannerStore = useScannerStore();

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

const clearTimer = () => {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
};

watch(
  () => scannerStore.showNotification,
  (show) => {
    clearTimer();
    if (show) {
      dismissTimer = setTimeout(() => {
        scannerStore.dismissNotification();
      }, 6000);
    }
  },
);

onBeforeUnmount(() => {
  clearTimer();
});

const handleViewBooks = () => {
  scannerStore.dismissNotification();
  router.replace('/');
};

const handleDismiss = () => {
  scannerStore.dismissNotification();
};
</script>

<template>
  <Transition
    enter-active-class="transform transition ease-out duration-300"
    enter-from-class="translate-y-4 opacity-0 sm:translate-y-0 sm:scale-95"
    enter-to-class="translate-y-0 opacity-100 sm:scale-100"
    leave-active-class="transition ease-in duration-200"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <!-- Active scanning state tooltip -->
    <div
      v-if="scannerStore.isScanning"
      data-testid="scan-progress-tooltip"
      role="status"
      aria-live="polite"
      class="pointer-events-auto fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-sm sm:left-auto"
    >
      <div
        class="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3.5 shadow-xl backdrop-blur-md dark:border-[#C8E695]/30 dark:bg-zinc-900/95"
      >
        <div
          class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#C8E695]/30 text-[#3E5725] dark:bg-[#C8E695]/20 dark:text-[#C8E695]"
        >
          <svg
            class="h-5 w-5 animate-spin text-[#3E5725] dark:text-[#C8E695]"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs font-bold text-gray-900 dark:text-[#C8E695]">
            {{
              t('scanner.scanningTooltipTitle', {
                count: scannerStore.currentCheckedCount,
              })
            }}
          </p>
          <p class="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
            {{ scannerStore.currentCheckingFile || t('scanner.scanningTooltipPreparing') }}
          </p>
        </div>
      </div>
    </div>

    <!-- Completed state notification banner -->
    <div
      v-else-if="
        !scannerStore.isScanning &&
        scannerStore.showNotification &&
        scannerStore.lastScanSummary &&
        scannerStore.lastScanSummary.newBooksCount > 0
      "
      class="pointer-events-auto fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md sm:bottom-6 sm:left-auto sm:right-6"
    >
      <div
        class="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl dark:border-[#C8E695]/30 dark:bg-zinc-900"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#C8E695] text-[#3E5725]"
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
          </div>
          <div>
            <p class="text-xs font-bold text-gray-900 dark:text-[#C8E695]">
              {{
                t('scanner.foundNewBooksNotification', {
                  count: scannerStore.lastScanSummary.newBooksCount,
                })
              }}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-xl bg-[#3E5725] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#3E5725]/90 active:scale-95 dark:bg-[#C8E695] dark:text-[#3E5725]"
            @click="handleViewBooks"
          >
            {{ t('scanner.viewNewBooks') }}
          </button>
          <button
            type="button"
            :aria-label="t('scanner.dismiss')"
            class="rounded-lg p-1 text-zinc-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/5"
            @click="handleDismiss"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
