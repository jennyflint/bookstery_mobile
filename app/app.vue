<script setup lang="ts">
import { onMounted } from 'vue';
import { useAppThemeStore } from './stores/appThemeStore';

const appThemeStore = useAppThemeStore();

onMounted(() => {
  appThemeStore.initTheme();
});
</script>

<template>
  <NuxtPage />
</template>
