export default defineNuxtConfig({
  compatibilityDate: '2026-10-31',
  ssr: false,
  devtools: { enabled: false },
  modules: ['@nuxt/eslint', '@nuxtjs/i18n', '@nuxtjs/tailwindcss', '@pinia/nuxt'],
  app: {
    head: {
      title: 'Bookstery',
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      link: [{ rel: 'icon', type: 'image/png', href: '/logo.png' }],
    },
  },
  typescript: {
    strict: true,
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
  postcss: {
    plugins: {
      'tailwindcss/nesting': false,
    },
  },
});
