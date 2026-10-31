# Bookstery Mobile - Copilot Instructions & Architectural Guidelines

Project Path: `/var/www/bookstery_mobile`
Tech Stack: Nuxt 4 (with `app/` directory structure), Vue 3 (`<script setup lang="ts">`, Composition API), TypeScript, Tailwind CSS, `@nuxtjs/i18n`, Pinia, Capacitor.
Domain: E-book reader and management application supporting multiple book formats (PDF, EPUB, FB2).

---

## 1. Global Rules (Mandatory)

### English-Only Comments & Documentation
- All inline code comments, JSDoc blocks, commits, and technical documentation MUST be written strictly in English.
- NEVER leave comments in Ukrainian, Russian, or any other non-English language inside source code files (`.ts`, `.vue`, `.js`, etc.).

### Strict TypeScript & Types Location
- Never use `any`. Always specify explicit return types and strict typing.
- All shared types, interfaces, and enums MUST be declared and exported from `app/types/` (e.g., `app/types/book.ts`, `app/types/reader.ts`, `app/types/format.ts`).
- Do NOT declare complex interfaces or types directly inside `.vue` files. Import them from `~/types/...`.

### Data, API & JSON Handling
- Components (`app/components/`) MUST NEVER contain raw JSON payloads, static mock JSON objects, or direct API fetch calls.
- All JSON manipulation, API requests, data fetching, and state management logic must reside exclusively inside `app/composables/` or `app/services/`.

### Book Format Processing (PDF, EPUB, FB2)
- All parsing, rendering engines, metadata extraction, and format conversion logic MUST be placed in `app/services/format/` (e.g., `pdf.service.ts`, `epub.service.ts`, `fb2.service.ts`).
- Provide a unified interface/adapter in `app/services/format/index.ts` so UI components interact with book formats agnostic of the underlying file type.
- Shared format contracts (`IBookParser`, `IBookMetadata`, `IBookChapter`) must be defined in `app/types/format.ts`.

### Internationalization (i18n)
- NEVER hardcode user-visible UI strings in templates or script tags.
- Always use `@nuxtjs/i18n` (`$t('namespace.key')` or `const { t } = useI18n()`).
- Store all translation keys in `i18n/locales/` with Ukrainian (`uk.json`) as the primary/mandatory locale, keeping `en.json` synchronized.

### Component Architecture & Modularity
- Break down complex pages and designs into small, single-responsibility components inside `app/components/` under domain-specific subdirectories:
  - `app/components/ui/` — Base atomic UI elements (buttons, inputs, modals).
  - `app/components/layout/` — Headers, footers, navigation bars, sidebars.
  - `app/components/reader/` — Book reader viewport, controls, table of contents, progress bars.
  - `app/components/library/` — Book cards, grids, shelves, filters.

---

## 2. Expected Directory Structure

```
/var/www/bookstery_mobile/
├── app/
│   ├── assets/css/tailwind.css
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── library/
│   │   └── reader/
│   ├── composables/       # Reactive state & Nuxt data hooks
│   ├── services/          # Pure TS business logic, parsers & API
│   │   └── format/        # Book format handlers (pdf, epub, fb2)
│   ├── stores/            # Pinia stores
│   ├── types/             # Shared TypeScript types & interfaces
│   ├── pages/
│   └── app.vue
├── i18n/
│   └── locales/
│       ├── uk.json        # Primary Ukrainian translations
│       └── en.json        # English translations
├── nuxt.config.ts
└── tailwind.config.ts
```

---

## 3. Specialized Roles & Workflows

When handling specific user requests, adopt one of the following specialized roles:

### Role: UI/UX & Tailwind Component Specialist
- Use `<script setup lang="ts">` exclusively.
- Use Tailwind CSS utility classes directly; avoid `<style>` blocks unless complex keyframe animations require them.
- Define component props and emits using type-based declarations (`defineProps<Props>()`, `defineEmits<Emits>()`) with interfaces imported from `app/types/`.
- Never use inline hardcoded strings; immediately pair new UI text with translation keys in `i18n/locales/uk.json`.

### Role: Business Logic, JSON & State Specialist
- Place reactive logic and Nuxt data fetching (`useFetch`, `useAsyncData`) in `app/composables/`.
- Keep pure TypeScript business logic, external API clients, and JSON serializers/parsers inside `app/services/`.
- Strictly validate and type every JSON response and payload against interfaces in `app/types/`.

### Role: Book Format Engine Specialist (PDF / EPUB / FB2)
- Implement format parsers strictly behind the strategy/adapter interface defined in `app/services/format/index.ts`.
- File breakdown:
  - `app/services/format/pdf.service.ts` — Rendering & text layer extraction.
  - `app/services/format/epub.service.ts` — Zip unpacking, OPF/NCX parsing, CFI navigation.
  - `app/services/format/fb2.service.ts` — XML/DOM parsing, base64/binary cover extraction, section mapping.
- Contracts must strictly implement types from `app/types/format.ts`.

### Role: TypeScript & Architecture Reviewer
- Check code against zero non-English comments rule.
- Enforce strict typing (no `any`, no untyped promises, no non-null assertions where avoidable).
- Verify separation of concerns: no raw JSON/fetching in `.vue` files, all shared types in `app/types/`.
- Verify presence of translation keys in `i18n/locales/uk.json`.
