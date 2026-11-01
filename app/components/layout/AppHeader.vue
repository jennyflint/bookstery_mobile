<script setup lang="ts">
import { ref } from 'vue';
import AppLogo from '../ui/AppLogo.vue';
import NavigationDrawer from '../navigation/NavigationDrawer.vue';
import SyncButton from '../common/SyncButton.vue';
import SyncStatusBadge from '../common/SyncStatusBadge.vue';
import LanguageSwitcher from '../common/LanguageSwitcher.vue';
import { useCollectionNavigation } from '../../composables/useCollectionNavigation';

const { t } = useI18n();
const { activeCollectionName } = useCollectionNavigation();

const isDrawerOpen = ref(false);

const openDrawer = (): void => {
  isDrawerOpen.value = true;
};

const closeDrawer = (): void => {
  isDrawerOpen.value = false;
};
</script>

<template>
  <header
    class="app-header sticky top-0 z-30 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur"
    :style="{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }"
  >
    <div class="mx-auto flex max-w-5xl items-center justify-between gap-2">
      <div class="flex items-center gap-2 shrink-0 min-w-0">
        <button
          type="button"
          data-testid="hamburger-menu-btn"
          class="-ml-1 shrink-0 rounded-xl p-2 text-zinc-700 transition-all hover:bg-zinc-100 hover:text-zinc-900 active:scale-95"
          :title="t('nav.menu')"
          @click="openDrawer"
        >
          <svg
            class="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        <div class="shrink-0 min-w-0">
          <AppLogo :subtitle="activeCollectionName || t('library.title')" />
        </div>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <div class="shrink-0">
          <SyncButton />
        </div>
        <SyncStatusBadge class="hidden sm:inline-flex" />
        <LanguageSwitcher />
      </div>
    </div>

    <NavigationDrawer
      :is-open="isDrawerOpen"
      @close="closeDrawer"
    />
  </header>
</template>
