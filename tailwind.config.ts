import type { Config } from 'tailwindcss';

export default <Partial<Config>>{
  content: [
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './composables/**/*.{js,ts}',
    './plugins/**/*.{js,ts}',
    './app/**/*.{vue,js,ts}',
    './app.vue',
  ],
  theme: {
    extend: {
      colors: {
        indigo: {
          50: 'var(--color-app-accent-50, #eef2ff)',
          100: 'var(--color-app-accent-100, #e0e7ff)',
          200: 'var(--color-app-accent-200, #c7d2fe)',
          300: 'var(--color-app-accent-300, #a5b4fc)',
          400: 'var(--color-app-accent-400, #818cf8)',
          500: 'var(--color-app-accent-500, #6366f1)',
          600: 'var(--color-app-accent-600, #4f46e5)',
          700: 'var(--color-app-accent-700, #4338ca)',
          800: 'var(--color-app-accent-800, #3730a3)',
          900: 'var(--color-app-accent-900, #312e81)',
        },
        sepia: {
          50: '#fdfbf7',
          100: '#f4ecd8',
          900: '#433422',
        },
      },
    },
  },
  plugins: [],
};
