<script setup lang="ts">
const { t } = useI18n();
const counter = useCounterStore();
</script>

<template>
  <main class="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 p-6">
    <h1 class="text-3xl font-bold text-slate-900">
      {{ t('home.title') }}
    </h1>
    <p class="text-slate-600">
      {{ t('home.counter', { count: counter.count }) }}
    </p>
    <button
      type="button"
      class="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500"
      @click="counter.increment"
    >
      {{ t('home.increment') }}
    </button>
  </main>
</template>
