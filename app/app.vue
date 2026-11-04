<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAppThemeStore } from './stores/appThemeStore';
import { useAndroidBackButton } from './composables/useAndroidBackButton';
import { useAuth } from './composables/useAuth';
import { useBookSync } from './composables/useBookSync';
import ScanStatusNotification from './components/common/ScanStatusNotification.vue';

const router = useRouter();
const appThemeStore = useAppThemeStore();
const { initBackButtonListener } = useAndroidBackButton();
const { initAuth } = useAuth();
const { initSync } = useBookSync();

onMounted(async () => {
  appThemeStore.initTheme();
  initBackButtonListener(router);
  await initAuth();
  await initSync();
});
</script>

<template>
  <div>
    <NuxtPage />
    <ScanStatusNotification />
  </div>
</template>
