<script setup lang="ts">
import { useBookSync } from '../../composables/useBookSync';

const { t } = useI18n();
const { isOnline, isSyncing, pendingQueueCount, syncNow } = useBookSync();
</script>

<template>
  <button
    type="button"
    data-testid="sync-status-badge"
    :disabled="isSyncing || !isOnline"
    class="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all shadow-sm active:scale-95 disabled:cursor-not-allowed"
    :class="[
      isSyncing
        ? 'bg-amber-100 text-amber-800 border border-amber-200'
        : !isOnline
          ? 'bg-zinc-200 text-zinc-600 border border-zinc-300'
          : pendingQueueCount > 0
            ? 'bg-sky-100 text-sky-800 border border-sky-200'
            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    ]"
    @click="syncNow"
  >
    <span
      class="w-2 h-2 rounded-full"
      :class="[
        isSyncing
          ? 'bg-amber-500 animate-ping'
          : !isOnline
            ? 'bg-zinc-400'
            : pendingQueueCount > 0
              ? 'bg-sky-500 animate-pulse'
              : 'bg-emerald-500'
      ]"
    />
    <span>
      {{
        isSyncing
          ? t('sync.syncing')
          : !isOnline
            ? t('sync.offline')
            : pendingQueueCount > 0
              ? t('sync.pending', { count: pendingQueueCount })
              : t('sync.synced')
      }}
    </span>
  </button>
</template>
