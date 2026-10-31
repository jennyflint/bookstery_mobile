<script setup lang="ts">
import AppLogo from './AppLogo.vue';

interface Props {
  readonly title?: string;
  readonly subtitle?: string;
}

const props = defineProps<Props>();
</script>

<template>
  <AppLogo
    :title="props.title"
    :subtitle="props.subtitle"
  />
</template>
