<script setup lang="ts">
import { onMounted } from 'vue';
import { useAppThemeStore } from './stores/appThemeStore';
import ScanStatusNotification from './components/common/ScanStatusNotification.vue';

const appThemeStore = useAppThemeStore();

onMounted(() => {
  appThemeStore.initTheme();
});
</script>

<template>
  <div>
    <NuxtPage />
    <ScanStatusNotification />
  </div>
</template>
