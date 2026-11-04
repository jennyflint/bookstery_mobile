<script setup lang="ts">
import { ref } from 'vue';
import { useAuth } from '../../composables/useAuth';
import { useAndroidBackButton, BACK_PRIORITY } from '../../composables/useAndroidBackButton';
import SignOutConfirmModal from './SignOutConfirmModal.vue';

const { t } = useI18n();
const { user, isAuthenticated, isLoading, signIn, signOut, forceSignOut } = useAuth();
const { registerBackHandler } = useAndroidBackButton();

const isConfirmModalOpen = ref(false);
const pendingCount = ref(0);
const signInError = ref<string | null>(null);

registerBackHandler(() => {
  if (isConfirmModalOpen.value) {
    isConfirmModalOpen.value = false;
    return true;
  }
  return false;
}, BACK_PRIORITY.OVERLAY);

const handleSignIn = async () => {
  try {
    signInError.value = null;
    await signIn();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Sign-in error:', message);
    signInError.value = message;
  }
};

const handleSignOutClick = async () => {
  const result = await signOut(false);
  if (result.needsConfirmation) {
    pendingCount.value = result.pendingCount;
    isConfirmModalOpen.value = true;
  }
};

const handleConfirmSignOut = async () => {
  isConfirmModalOpen.value = false;
  await forceSignOut();
};

const handleCancelSignOut = () => {
  isConfirmModalOpen.value = false;
};
</script>

<template>
  <div class="flex flex-col items-start gap-1">
    <div class="flex items-center">
      <button
        v-if="!isAuthenticated"
        type="button"
        data-testid="google-sign-in-btn"
        :disabled="isLoading"
        class="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white text-zinc-800 border border-zinc-200 shadow-sm hover:bg-[#C8E695]/20 active:scale-95 transition-all text-xs font-bold disabled:opacity-50"
        @click="handleSignIn"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.97 0 12s.45 3.83 1.25 5.42l4.03-3.15z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
          />
        </svg>
        <span>{{ t('auth.signInWithGoogle') }}</span>
      </button>

      <div v-else class="flex items-center gap-3 bg-zinc-50/80 p-1.5 pr-2 rounded-2xl border border-zinc-200 shadow-sm">
        <img
          v-if="user?.imageUrl"
          :src="user.imageUrl"
          alt="Avatar"
          class="w-9 h-9 rounded-xl border border-zinc-200 object-cover"
        />
        <div
          v-else
          class="w-9 h-9 rounded-xl bg-[#C8E695] text-[#3E5725] font-bold flex items-center justify-center text-sm border border-[#3E5725]/20"
        >
          {{ user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'B' }}
        </div>

        <div class="text-left flex flex-col justify-center min-w-0 pr-1">
          <p class="text-xs font-bold text-zinc-900 truncate max-w-[130px]">
            {{ user?.displayName }}
          </p>
          <p class="text-[10px] text-zinc-400 font-medium truncate max-w-[130px]">
            {{ user?.email }}
          </p>
        </div>

        <button
          type="button"
          data-testid="sign-out-btn"
          :disabled="isLoading"
          :title="t('auth.signOut')"
          class="p-2 rounded-xl text-zinc-500 hover:text-red-600 hover:bg-red-50 active:scale-95 transition-all text-xs font-medium border border-transparent hover:border-red-100"
          @click="handleSignOutClick"
        >
          <svg
            class="w-4 h-4"
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
        </button>
      </div>
    </div>

    <p
      v-if="signInError && !isAuthenticated"
      class="text-xs font-medium text-red-500 pl-1"
      role="alert"
    >
      {{ signInError }}
    </p>

    <SignOutConfirmModal
      :is-open="isConfirmModalOpen"
      :pending-count="pendingCount"
      @confirm="handleConfirmSignOut"
      @cancel="handleCancelSignOut"
    />
  </div>
</template>
