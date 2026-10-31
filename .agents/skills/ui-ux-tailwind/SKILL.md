---
name: ui-ux-tailwind
description: >-
  Builds responsive, accessible Vue 3 components styled with Tailwind CSS, strictly adhering to Nuxt 4, @nuxtjs/i18n, and Bookstery design principles.
---

# UI/UX & Tailwind Component Agent Skill

Use this skill when developing, refactoring, or styling Vue components in Bookstery Mobile.

## Core Directives

1. **Script Setup & TypeScript**:
   - Use exclusively `<script setup lang="ts">`.
   - Define props and emits using type-based declarations:
     ```vue
     <script setup lang="ts">
     import type { BookCardProps, BookCardEmits } from '~/types/book';

     const props = defineProps<BookCardProps>();
     const emit = defineEmits<BookCardEmits>();
     </script>
     ```
   - Never declare complex prop interfaces inside the `.vue` file; import them from `app/types/`.

2. **Component & Asset Placement (Nuxt 4 `app/` Directory)**:
   - Place components exclusively in `app/components/`, NEVER create `components/` in the project root:
     - `app/components/ui/` — Buttons, inputs, modals, switches, badges.
     - `app/components/layout/` — Headers, footers, navigation bars, bottom tab bar.
     - `app/components/reader/` — Reader controls, page viewer, TOC drawer, font size controls.
     - `app/components/library/` — Book cards, book shelves, filter drawers, sort menus.
   - Place all styles and static assets exclusively in `app/assets/` (e.g. `app/assets/css/tailwind.css`), NEVER in root `assets/`.

3. **Tailwind CSS Styling**:
   - Style with Tailwind CSS utility classes directly.
   - Do NOT add `<style>` blocks unless complex keyframe animations cannot be achieved via Tailwind.
   - Keep templates readable and semantic. Use safe-area padding for mobile/Capacitor devices (`pb-safe`, `pt-safe` or viewport-fit padding).

4. **i18n Translation Mandatory**:
   - NEVER hardcode user-facing text strings in templates or scripts.
   - Use `{{ $t('namespace.key') }}` or `const { t } = useI18n()`.
   - Every added text string MUST immediately have a corresponding key added to `i18n/locales/uk.json` (and `i18n/locales/en.json`).

5. **No Data / API Logic**:
   - No direct `fetch`, `$fetch`, `useFetch`, or raw mock JSON data in component templates or setup scripts.
   - All state and data must come via props, Pinia stores, or composables (`app/composables/`).
