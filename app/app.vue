<script setup lang="ts">
import { onMounted } from 'vue';
import { useAppThemeStore } from './stores/appThemeStore';
import { useAndroidBackButton } from './composables/useAndroidBackButton';
import ScanStatusNotification from './components/common/ScanStatusNotification.vue';

const appThemeStore = useAppThemeStore();
const { initBackButtonListener } = useAndroidBackButton();

onMounted(() => {
  appThemeStore.initTheme();
  initBackButtonListener();
});
</script>

<template>
  <div>
    <NuxtPage />
    <ScanStatusNotification />
  </div>
</template>
