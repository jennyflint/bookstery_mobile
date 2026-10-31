# Bookstery Mobile - Antigravity Agent Guidelines

Project: `/var/www/bookstery_mobile`
Stack: Nuxt 4 (`app/` dir), Vue 3 (`<script setup lang="ts">`), TypeScript, Tailwind CSS, `@nuxtjs/i18n`, Pinia, Capacitor.

## Critical Global Directives (Mandatory)

1. **Strict `app/` Directory Placement (Nuxt 4 Encapsulation)**:
   - ALL application source code MUST be placed strictly inside `app/`. NEVER create application files or folders in the root directory.
   - Specifically:
     - `stores` -> `app/stores/` (NEVER root `stores/`)
     - `components` -> `app/components/` (NEVER root `components/`)
     - `services` -> `app/services/` (NEVER root `services/`)
     - `plugins` -> `app/plugins/` (NEVER root `plugins/`)
     - `composables` -> `app/composables/` (NEVER root `composables/`)
     - `assets` -> `app/assets/` (NEVER root `assets/`)
     - `pages` -> `app/pages/`, `layouts` -> `app/layouts/`, `types` -> `app/types/`, `middleware` -> `app/middleware/`.
   - Creating any of these directories or files in the project root directory is strictly prohibited.

2. **English-Only Comments & Documentation**:
   - All inline comments, JSDoc blocks, commits, and technical notes MUST be in English.
   - Non-English comments in `.ts`, `.vue`, or `.js` are strictly forbidden.

3. **Strict TypeScript & Central Types**:
   - Never use `any`. Always supply explicit types.
   - Shared interfaces, types, and enums belong in `app/types/` (e.g. `app/types/book.ts`, `app/types/reader.ts`, `app/types/format.ts`).
   - Do not define complex types in `.vue` files; import them from `~/types/...`.

4. **Data, API & JSON Separation**:
   - Vue components (`app/components/`) MUST NOT contain raw JSON payloads, static mock JSON, or direct API fetch calls.
   - State & Nuxt data-fetching hooks belong in `app/composables/` or `app/stores/`.
   - Pure TS business logic, API clients, and JSON serializers belong in `app/services/`.

5. **Book Format Processing (PDF, EPUB, FB2)**:
   - All parsing, rendering, and metadata extraction logic belongs in `app/services/engine/`.
   - Must provide a unified adapter in `app/services/engine/index.ts` implementing `IBookParser` from `app/types/format.ts`.

6. **Internationalization (i18n)**:
   - Never hardcode user-visible strings in templates.
   - Always use `@nuxtjs/i18n` (`$t()` or `useI18n()`).
   - Store all translations in `i18n/locales/` with Ukrainian (`uk.json`) as mandatory primary.

7. **Component Modularity**:
   - Components belong in semantic subdirectories:
     - `app/components/ui/` — Atomic UI elements (button, input, modal).
     - `app/components/layout/` — Header, footer, navbar, sidebar.
     - `app/components/reader/` — Viewer, controls, TOC, progress bar.
     - `app/components/library/` — Book card, shelf, filter, grid.

## Available Specialized Skills

When executing targeted tasks, activate one of the project skills located in `.agents/skills/`:
- `ui-ux-tailwind` - UI/UX & Tailwind Component Agent
- `business-logic-state` - Business Logic, JSON & State Agent
- `book-format-engine` - Book Format Engine Agent (PDF/EPUB/FB2)
- `ts-architecture-reviewer` - TypeScript & Architecture Reviewer Agent
