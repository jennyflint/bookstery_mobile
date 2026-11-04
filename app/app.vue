<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAppThemeStore } from './stores/appThemeStore';
import { useAndroidBackButton } from './composables/useAndroidBackButton';
import ScanStatusNotification from './components/common/ScanStatusNotification.vue';

const router = useRouter();
const appThemeStore = useAppThemeStore();
const { initBackButtonListener } = useAndroidBackButton();

onMounted(() => {
  appThemeStore.initTheme();
  initBackButtonListener(router);
});
</script>

<template>
  <div>
    <NuxtPage />
    <ScanStatusNotification />
  </div>
</template>
