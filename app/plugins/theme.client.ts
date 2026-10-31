import { defineNuxtPlugin } from '#app';
import { useAppThemeStore } from '../stores/appThemeStore';

export default defineNuxtPlugin(() => {
  const appThemeStore = useAppThemeStore();
  appThemeStore.initTheme();
});
