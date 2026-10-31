// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-10-31',

  // Capacitor needs a static SPA build (`nuxt generate` -> .output/public)
  ssr: false,

  devtools: { enabled: true },

  modules: ['@nuxt/eslint', '@nuxtjs/i18n', '@nuxtjs/tailwindcss', '@pinia/nuxt'],

  app: {
    head: {
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
    },
  },

  typescript: {
    strict: true,
  },

  eslint: {
    config: {
      // Formatting is handled by Prettier
      stylistic: false,
      typescript: {
        strict: true,
      },
    },
  },

  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'uk',
    locales: [
      { code: 'uk', language: 'uk-UA', name: 'Українська', file: 'uk.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_locale',
      fallbackLocale: 'uk',
    },
  },

  tailwindcss: {
    cssPath: '~/assets/css/tailwind.css',
  },

  vite: {
    server: {
      // File watching inside Docker on Windows/macOS bind mounts
      watch: {
        usePolling: process.env.CHOKIDAR_USEPOLLING === 'true',
      },
    },
  },
});
