<script setup lang="ts">
import { computed } from 'vue';
import { useBookSync } from '../../composables/useBookSync';

const { t } = useI18n();
const { isOnline, isSyncing, lastSyncAt, syncVisualState, syncNow } = useBookSync();

const isSyncActive = computed(() => {
  return (
    Boolean(isOnline.value) &&
    syncVisualState.value !== 'unauthenticated' &&
    syncVisualState.value !== 'offline' &&
    syncVisualState.value !== 'error'
  );
});

const statusLabel = computed(() => {
  return isSyncActive.value ? t('sync.online') : t('sync.offline');
});

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
  if (
    syncVisualState.value === 'unauthenticated' ||
    syncVisualState.value === 'syncing' ||
    !isOnline.value
  ) {
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
    :disabled="isSyncing || !isSyncActive"
    class="whitespace-nowrap shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border transition-all duration-200 select-none active:scale-95 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
    :class="[
      isSyncActive
        ? syncVisualState === 'syncing'
          ? 'bg-[#C8E695]/30 text-[#3E5725] border-[#C8E695] cursor-wait'
          : syncVisualState === 'success'
            ? 'bg-[#C8E695] text-[#3E5725] border-[#3E5725]/30'
            : 'bg-[#C8E695]/20 text-[#3E5725] border-[#C8E695] hover:bg-[#C8E695]/40 shadow-xs'
        : 'bg-zinc-100 text-zinc-400 border-zinc-200 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:text-zinc-500 dark:border-zinc-700'
    ]"
    @click="handleClick"
  >
    <svg
      v-if="syncVisualState === 'syncing'"
      class="h-3 w-3 animate-spin text-current shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2.5"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
    <span>{{ statusLabel }}</span>
  </button>
</template>
