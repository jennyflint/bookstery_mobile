<script setup lang="ts">
import { computed } from 'vue';
import { useBookSync } from '../../composables/useBookSync';

const { t } = useI18n();
const { isOnline, isSyncing, lastSyncAt, syncVisualState, syncNow } = useBookSync();

const relativeSyncTime = computed(() => {
  if (!lastSyncAt.value) {
    return t('sync.syncedJustNow');
  }
  const diffMs = Date.now() - lastSyncAt.value;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) {
    return t('sync.syncedJustNow');
  }
  if (minutes < 60) {
    return t('sync.syncedMinutesAgo', { minutes });
  }
  const hours = Math.floor(minutes / 60);
  return t('sync.syncedHoursAgo', { hours });
});

const tooltipText = computed(() => {
  switch (syncVisualState.value) {
    case 'unauthenticated':
      return t('sync.unauthenticatedTooltip');
    case 'offline':
      return t('sync.offlineTooltip');
    case 'error':
      return t('sync.retryTooltip');
    case 'syncing':
      return t('sync.syncing');
    case 'success':
      return t('sync.success');
    case 'idle':
    default:
      return relativeSyncTime.value;
  }
});

const handleClick = async () => {
  if (syncVisualState.value === 'unauthenticated' || syncVisualState.value === 'syncing') {
    return;
  }
  await syncNow();
};
</script>

<template>
  <button
    type="button"
    data-testid="sync-trigger-btn"
    :title="tooltipText"
    :disabled="isSyncing || syncVisualState === 'unauthenticated'"
    class="relative inline-flex items-center justify-center p-2 rounded-xl transition-all duration-200 border text-xs font-semibold select-none active:scale-95 disabled:cursor-not-allowed"
    :class="[
      syncVisualState === 'unauthenticated'
        ? 'bg-zinc-100 text-zinc-400 border-zinc-200 hover:bg-zinc-200'
        : syncVisualState === 'syncing'
          ? 'bg-[#C8E695]/30 text-[#3E5725] border-[#C8E695] cursor-wait'
          : syncVisualState === 'success'
            ? 'bg-[#C8E695] text-[#3E5725] border-[#3E5725]/30 animate-pulse'
            : syncVisualState === 'error' || syncVisualState === 'offline' || !isOnline
              ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
              : 'bg-white text-[#3E5725] border-zinc-200 hover:bg-[#C8E695]/20 shadow-sm'
    ]"
    @click="handleClick"
  >
    <svg
      v-if="syncVisualState === 'unauthenticated'"
      class="w-5 h-5 text-zinc-400 transition-transform"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18" />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M8.5 8.5A5.002 5.002 0 0118.5 10a4 4 0 012.3 4.8M5.5 10.5A5.002 5.002 0 003 15a4 4 0 004 4h10m3-3a4 4 0 00-1-2.5"
      />
    </svg>

    <svg
      v-else-if="syncVisualState === 'syncing'"
      class="w-5 h-5 animate-spin text-[#3E5725]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>

    <svg
      v-else-if="syncVisualState === 'success'"
      class="w-5 h-5 text-[#3E5725] scale-110 transition-transform duration-200"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2.5"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
    </svg>

    <svg
      v-else-if="syncVisualState === 'error' || syncVisualState === 'offline' || !isOnline"
      class="w-5 h-5 text-rose-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 5.636l-12.728 12.728" />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M6.343 6.343A8 8 0 0119.07 19.07M4.93 19.07A8 8 0 016.343 6.343"
      />
    </svg>

    <svg
      v-else
      class="w-5 h-5 text-[#3E5725] group-hover:scale-105 transition-transform"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z"
      />
    </svg>
  </button>
</template>
