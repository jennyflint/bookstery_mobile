<script setup lang="ts">
import { useAuth } from '../../composables/useAuth';

const { t } = useI18n();
const { user, isAuthenticated, isLoading, signIn, signOut } = useAuth();
</script>

<template>
  <div class="flex items-center">
    <button
      v-if="!isAuthenticated"
      type="button"
      data-testid="google-signin-btn"
      :disabled="isLoading"
      class="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white text-zinc-800 border border-zinc-200 shadow-sm hover:bg-zinc-50 active:scale-95 transition-all text-sm font-semibold disabled:opacity-50"
      @click="signIn"
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

    <div v-else class="flex items-center gap-3">
      <img
        v-if="user?.imageUrl"
        :src="user.imageUrl"
        alt="Avatar"
        class="w-8 h-8 rounded-full border border-zinc-200 object-cover"
      />
      <div class="text-left">
        <p class="text-xs text-zinc-400 font-medium">{{ t('auth.signedInAs') }}</p>
        <p class="text-sm font-semibold text-zinc-900 truncate max-w-[140px]">{{ user?.displayName }}</p>
      </div>
      <button
        type="button"
        data-testid="google-signout-btn"
        :disabled="isLoading"
        class="p-2 rounded-lg text-zinc-500 hover:text-red-600 hover:bg-red-50 transition-colors text-xs font-medium"
        @click="signOut"
      >
        {{ t('auth.signOut') }}
      </button>
    </div>
  </div>
</template>
