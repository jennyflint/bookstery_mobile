---
name: business-logic-state
description: >-
  Handles data flow, API communication, JSON transformation, Pinia stores, and Nuxt composables with strict typing in Bookstery Mobile.
---

# Business Logic, JSON & State Agent Skill

Use this skill when implementing data-fetching, API clients, JSON serialization/deserialization, reactive state, and Pinia stores.

## Core Directives

1. **Strict `app/` Directory Placement (Nuxt 4 Encapsulation)**:
   - ALL stores, composables, services, and plugins MUST be created exclusively inside `app/`.
   - Creating `stores/`, `composables/`, `services/`, or `plugins/` in the project root directory is strictly forbidden.

2. **Separation of Layers**:
   - **Composables (`app/composables/`)**:
     - Handle stateful Vue logic, Nuxt data hooks (`useAsyncData`, `useFetch`), and reactive wrappers around services.
   - **Services (`app/services/`)**:
     - Handle pure TypeScript business logic, external API clients, storage adapters (Capacitor Preferences / Filesystem), and JSON parsers/serializers.
     - Never import Vue-specific reactivity (`ref`, `reactive`) inside services.
   - **Stores (`app/stores/`)**:
     - Handle global client state (e.g. current reader settings, user preferences, active book state) using Pinia setup syntax (`defineStore('name', () => { ... })`).
   - **Plugins (`app/plugins/`)**:
     - Handle Nuxt runtime plugins (e.g. Capacitor lifecycle hooks, global event buses).

3. **Strict Typing on All Payloads**:
   - Every JSON payload, request body, and response MUST map to an explicit interface imported from `app/types/`.
   - Never use `any`. Use `unknown` with runtime type guards (or `zod`/type predicates) if validating unknown external JSON.
   - Example:
     ```ts
     import type { BookDTO } from '~/types/book';

     export const parseBookMetadata = (rawJson: string): BookDTO => {
       const data: unknown = JSON.parse(rawJson);
       // Validate or type-guard data
       return data as BookDTO;
     };
     ```

4. **No Direct Component Leakage**:
   - Ensure components only receive reactive state or call clean composable methods.
   - Raw JSON payloads and HTTP endpoint URLs must never be exposed directly in UI components.

5. **Comments in English**:
   - All JSDoc and inline comments explaining complex business logic MUST be written in English.
