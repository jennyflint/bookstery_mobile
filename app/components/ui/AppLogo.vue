<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  readonly title?: string;
  readonly subtitle?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: undefined,
  subtitle: undefined,
});

const { t } = useI18n();

const resolvedTitle = computed((): string => props.title ?? t('app.name'));
const resolvedSubtitle = computed((): string => props.subtitle ?? t('library.title'));
</script>

<template>
  <div class="flex items-center gap-3 select-none">
    <img
      src="/logo.png"
      :alt="resolvedTitle"
      class="w-9 h-9 object-contain drop-shadow-xs"
    >
    <div class="text-logo">
      <h1 class="font-extrabold text-base tracking-tightleading-none">
        {{ resolvedTitle }}
      </h1>
      <p
        v-if="resolvedSubtitle"
        class="text-[10px] text-zinc-400 font-medium tracking-wide uppercase mt-0.5"
      >
        {{ resolvedSubtitle }}
      </p>
    </div>
  </div>
</template>


<style scoped>
.text-logo h1 {
  color: #7CA834 !important;
}

.text-logo p {
  color: #A6C967 !important;
}
</style>