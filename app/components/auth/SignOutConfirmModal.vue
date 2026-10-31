<script setup lang="ts">
defineProps<{
  isOpen: boolean;
  pendingCount: number;
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const { t } = useI18n();
</script>

<template>
  <div
    v-if="isOpen"
    data-testid="sign-out-confirm-modal"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
    @click.self="emit('cancel')"
  >
    <div
      class="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-zinc-100 space-y-4"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex h-12 w-12 items-center justify-center rounded-2xl"
          :class="pendingCount > 0 ? 'bg-amber-100 text-amber-600' : 'bg-red-50 text-red-600'"
        >
          <svg
            v-if="pendingCount > 0"
            class="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <svg
            v-else
            class="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        </div>

        <div>
          <h3 class="text-base font-bold text-zinc-900">
            {{ t('auth.confirmSignOutTitle') }}
          </h3>
          <p class="text-xs text-zinc-500">
            {{ t('auth.confirmSignOutMessage') }}
          </p>
        </div>
      </div>

      <div
        v-if="pendingCount > 0"
        class="rounded-2xl bg-amber-50 p-3.5 border border-amber-200 text-xs text-amber-900 leading-relaxed"
      >
        {{ t('auth.pendingWarning', { count: pendingCount }) }}
      </div>

      <div class="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          data-testid="cancel-sign-out-btn"
          class="px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 active:scale-95 transition-all"
          @click="emit('cancel')"
        >
          {{ t('auth.cancelButton') }}
        </button>

        <button
          type="button"
          data-testid="confirm-sign-out-btn"
          class="px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm"
          :class="[
            pendingCount > 0
              ? 'bg-amber-600 text-white hover:bg-amber-700'
              : 'bg-red-600 text-white hover:bg-red-700'
          ]"
          @click="emit('confirm')"
        >
          {{ t('auth.confirmButton') }}
        </button>
      </div>
    </div>
  </div>
</template>
