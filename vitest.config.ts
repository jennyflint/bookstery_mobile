import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'bundler',
        esModuleInterop: true,
        strict: true,
        jsx: 'preserve',
      },
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: [resolve(__dirname, './tests/setup.ts')],
    alias: {
      '~': resolve(__dirname, './app'),
      '@': resolve(__dirname, './app'),
      '~~': resolve(__dirname, './'),
      '@@': resolve(__dirname, './'),
      '@capacitor/share': resolve(__dirname, './tests/mocks/capacitor-plugins.ts'),
      '@capacitor/haptics': resolve(__dirname, './tests/mocks/capacitor-plugins.ts'),
    },
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, './app'),
      '@': resolve(__dirname, './app'),
      '~~': resolve(__dirname, './'),
      '@@': resolve(__dirname, './'),
      '@capacitor/share': resolve(__dirname, './tests/mocks/capacitor-plugins.ts'),
      '@capacitor/haptics': resolve(__dirname, './tests/mocks/capacitor-plugins.ts'),
    },
  },
});
