import { defineNuxtPlugin } from '#app';
import { useScannerStore } from '../stores/scannerStore';
import { useAutoScan } from '../composables/useAutoScan';

export default defineNuxtPlugin((nuxtApp: { hook: (name: string, cb: () => void) => void }) => {
  nuxtApp.hook('app:mounted', () => {
    setTimeout(async () => {
      const scannerStore = useScannerStore();
      await scannerStore.init();
      const { setupLifecycleListener } = useAutoScan();
      await setupLifecycleListener();
      await scannerStore.runStartupScan();
    }, 150);
  });
});
