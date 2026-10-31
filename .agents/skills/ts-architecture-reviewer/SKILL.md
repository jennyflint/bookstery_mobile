---
name: ts-architecture-reviewer
description: >-
  Audits Bookstery Mobile codebase for strict TypeScript adherence, correct directory placement, English-only comments, and i18n completeness.
---

# TypeScript & Architecture Reviewer Agent Skill

Use this skill to audit, review pull requests, or validate code changes against project architecture and linting standards.

## Audit Checklist

When reviewing code, systematically check each of the following:

1. **Nuxt 4 `app/` Encapsulation Check**:
   - Verify that NO application files or directories (`stores/`, `components/`, `services/`, `plugins/`, `composables/`, `assets/`, `pages/`, `layouts/`, `types/`) are created in the project root.
   - All source code must reside strictly under `app/` (e.g. `app/stores/`, `app/components/`, `app/services/`, `app/plugins/`, `app/composables/`, `app/assets/`).

2. **Language Check (English-Only)**:
   - Verify that all code comments, JSDoc annotations, and TODOs are in English.
   - Flag any Cyrillic or non-English characters in `.ts`, `.vue`, or `.js` files.

3. **TypeScript & Types Placement**:
   - Verify zero usage of `any`.
   - Ensure all shared interfaces, types, and enums are exported from `app/types/`.
   - Check that `.vue` components do not define complex domain interfaces locally.
   - Verify strict return types on functions and composable return objects.

4. **Layer Separation & Component Purity**:
   - Check that `app/components/` contains NO raw JSON strings, mock data objects, or direct `$fetch`/`fetch` calls.
   - Check that API calls and data fetching reside exclusively in `app/composables/` or `app/services/`.
   - Ensure components are stored in the correct directory (`ui/`, `layout/`, `reader/`, `library/`).

5. **Book Format Processing**:
   - Ensure all PDF, EPUB, FB2 parsing logic is isolated in `app/services/engine/`.
   - Verify reader components interact through the unified `IBookParser` / `IBookDocument` interface.

6. **Internationalization (i18n)**:
   - Scan `.vue` templates for hardcoded text.
   - Confirm all text uses `$t()` or `useI18n()`.
   - Verify that every new key exists in `i18n/locales/uk.json` (Ukrainian mandatory).

7. **Automated Verification Command**:
   - Run: `npm run check` (or inside Docker: `docker compose exec app npm run check`).
