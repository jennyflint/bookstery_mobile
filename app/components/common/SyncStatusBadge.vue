<script setup lang="ts">
import { computed } from 'vue';
import { useBookSync } from '../../composables/useBookSync';
import { useAuth } from '../../composables/useAuth';

const { t } = useI18n();
const { isAuthenticated } = useAuth();
const { isOnline, isSyncing, pendingQueueCount, syncVisualState, syncNow } = useBookSync();

const badgeStatus = computed<'synced' | 'pending' | 'syncing' | 'offline' | 'unauthenticated'>(() => {
  if (!isAuthenticated.value) {
    return 'unauthenticated';
  }
  if (!isOnline.value) {
    return 'offline';
  }
  if (isSyncing.value || syncVisualState.value === 'syncing') {
    return 'syncing';
  }
  if (pendingQueueCount.value > 0) {
    return 'pending';
  }
  return 'synced';
});

const labelText = computed(() => {
  switch (badgeStatus.value) {
    case 'unauthenticated':
      return t('sync.offline');
    case 'offline':
      return t('sync.offline');
    case 'syncing':
      return t('sync.syncing');
    case 'pending':
      return t('sync.pending', { count: pendingQueueCount.value });
    case 'synced':
    default:
      return t('sync.synced');
  }
});

const handleClick = async () => {
  if (badgeStatus.value === 'unauthenticated' || badgeStatus.value === 'offline' || badgeStatus.value === 'syncing') {
    return;
  }
  await syncNow();
};
</script>

<template>
  <button
    type="button"
    data-testid="sync-status-indicator"
    :disabled="badgeStatus === 'unauthenticated' || badgeStatus === 'offline' || badgeStatus === 'syncing'"
    class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all shadow-sm active:scale-95 disabled:cursor-not-allowed select-none"
    :class="[
      badgeStatus === 'unauthenticated'
        ? 'bg-zinc-100 text-zinc-400 border border-zinc-200'
        : badgeStatus === 'offline'
          ? 'bg-zinc-200 text-zinc-600 border border-zinc-300'
          : badgeStatus === 'syncing'
            ? 'bg-blue-50 text-blue-700 border border-blue-200'
            : badgeStatus === 'pending'
              ? 'bg-amber-50 text-amber-800 border border-amber-200'
              : 'bg-[#C8E695]/40 text-[#3E5725] border border-[#C8E695]'
    ]"
    @click="handleClick"
  >
    <span
      class="w-2 h-2 rounded-full"
      :class="[
        badgeStatus === 'unauthenticated'
          ? 'bg-zinc-400'
          : badgeStatus === 'offline'
            ? 'bg-zinc-500'
            : badgeStatus === 'syncing'
              ? 'bg-blue-500 animate-ping'
              : badgeStatus === 'pending'
                ? 'bg-amber-500 animate-pulse'
                : 'bg-[#3E5725]'
      ]"
    />
    <span>{{ labelText }}</span>
  </button>
</template>
