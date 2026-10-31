<script setup lang="ts">
const { locale, setLocale } = useI18n();

const toggleLanguage = () => {
  const next = locale.value === 'uk' ? 'en' : 'uk';
  setLocale(next);
};
</script>

<template>
  <button
    type="button"
    data-testid="language-switcher"
    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 active:scale-95 text-xs font-semibold text-zinc-700 transition-all uppercase tracking-wider"
    @click="toggleLanguage"
  >
    <svg class="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
    </svg>
    <span>{{ locale }}</span>
  </button>
</template>
