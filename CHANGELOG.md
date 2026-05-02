# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- New rule `state-context-first-over-zustand.md` codifying that React Context is the default store for shared client state; Zustand is opt-in only when Context is the measured bottleneck or middleware (devtools/persistence) is required.
- Consolidated TanStack ownership guidance into `data-rsc-and-tanstack-boundaries.md`, including when `useMutation` is redundant after Server Actions that already invalidate RSC cache tags.
- New rule `forms-server-action-error-key.md` covering progressive-enhancement i18n: server actions return typed `errorKey` values; the client-side hook localizes them via `intl.formatMessage`.
- New rule `i18n-locale-cookie-via-proxy.md` for seeding the locale cookie inside `src/proxy.ts` from `Accept-Language` (alternative to migrating to `next-intl`).
- Consolidated Supabase RLS guidance into `data-supabase-rls-policies.md`, including `(select auth.uid())`, `with check` identity locks, and explicit DELETE policy decisions.

### Changed

- Tightened TanStack opt-in guidance: removed weakly-justified entries, added explicit anti-patterns (e.g. submit-disabled UX -> `useTransition`, "client filters" -> URL state, redundant `invalidateQueries` after `revalidateTag`).
- Consolidated `nextjs-architecture` from 38 references to 22 references by merging rules that answered the same decision point: layer boundaries, server data boundaries, RSC/TanStack ownership, RLS policies, cache invalidation, cache scoped inputs, and action validation/authz.
- Refactored `react-component-creator/SKILL.md` state-placement table: split "Page UI state" (one route, default `useState`/`useReducer`) from "Cross-component shared UI state" (default Context, Zustand only when measured) and added a "URL-shareable state" row. Footnotes link the new TanStack and Context rules.
- Updated `state-page-ui-feature-local-hooks.md` to defer cross-tree state explicitly to the new Context-first rule rather than equating Zustand and Context.
- Tightened `nextjs-architecture/SKILL.md` defaults: TanStack Query is documented as auxiliary/opt-in; default writes are Server Actions calling `revalidateTag`/`updateTag`.
- Expanded `actions-thin-wrapper.md` with an `## Error Boundary Contract` section codifying how to map authentication, authorization, validation, conflict, not-found, and rate-limit failures to the public action error format instead of collapsing them into a generic internal error.
- Expanded `i18n-server-side-via-get-translations.md` with a `## Locale Detection Boundary` subsection: detection lives at the request boundary (typically `proxy.ts`), root layouts stay non-dynamic when proxy already resolves the locale, and single-locale apps must keep `SUPPORTED_LOCALES`/`DEFAULT_LOCALE` aligned with the actual translated copy.
- Expanded `i18n-translation-text-client-only.md` to forbid shipping a fake locale or selector solely to demonstrate i18n; secondary locales require translated messages, detection, tests, and selector options together.
- Expanded `forms-error-handling-mutation.md` with the explicit error-category taxonomy (validation / authentication / authorization / conflict / unexpected) so wrappers do not collapse all action failures into one generic message.
- Reformatted reference files for consistent CommonMark blank-line spacing after section labels and before bullet lists, and unified table column alignment in `react-component-creator/SKILL.md`.
- Replaced the homemade YAML frontmatter parser with the `yaml` library; multi-line, quoted, and array values now round-trip correctly.
- Migrated `validate-json-schemas.mjs` and `validate-skill-frontmatter.mjs` to AJV with declarative JSON Schemas under `schemas/`. Manifest files reference their schemas via `$schema` for IDE autocomplete.
- Upgraded `lint-no-content-duplication.mjs` from exact-line matching to word-shingle (5-gram) Jaccard similarity. Reports near-duplicates above 0.85 (error) and high-overlap paragraphs above 0.70 (warning) across SKILL.md and references.
- Replaced the Zustand-by-default page-UI rule with `state-page-ui-feature-local-hooks.md`; `useState`/`useReducer` is now the documented default and Zustand is opt-in only when state must be shared across sibling routes.

## [1.0.1] - 2026-05-01

### Fixed

- Added explicit minimum package versions to the compatibility matrix.
- Expanded the Mantine + Standard Schema validator rule with a complete synchronous field-error adapter.
- Aligned marketplace keywords with the release keyword profile.

## [1.0.0] - 2026-05-01

### Added

- Added `nextjs-architecture` and `react-component-creator` skills.
- Added 54 atomic reference rules for Next.js architecture and React component creation.
- Added validation scripts, CI workflow, and version sync tooling.
- Added Next.js 16 guidance for DAL, Cache Components, validated Server Actions, RSC-first reads, Supabase RLS, and routing patterns.
- Added React guidance for Server/Client boundaries, forms, state placement, styling, i18n, and `composeHooks`.

### Changed

- Renamed plugin to `nextjs-clean-skills`.
- Renamed GitHub repository to `clicktronix/nextjs-clean-skills`.
- Converted long skill bodies into lean routers with linked `references/` files.

### Removed

- Removed legacy `architector` and `component-creator` skill names.

## [0.3.0] - 2026-04-30

### Changed

- Patched legacy `architector` and `component-creator` guidance for Next.js 16.
- Added RSC-first reads, TanStack Query opt-in guidance, Cache Components, DAL, and safe action notes.

## [0.2.0] - 2026-04-30

### Added

- Initial portable skills for Fullstack AI Template architecture and component creation.
