# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [1.3.0] - 2026-05-27

> Consolidates the unreleased 1.2.0 platform patterns with skill-authoring and validation
> hardening. **Breaking for external links:** a reference file was renamed (see Changed).

### Added

- New references: `observability-and-sentry.md` (lazy SDK loader, PII redaction, user context without email, boundary capture) and `notifications-and-feedback.md` (semantic `notify*` helpers, global mutation error notifier, unified `useConfirm`).
- Architecture patterns: RSC + DAL hybrid read with `initialData`/explicit freshness in `data-ownership-and-cache.md`; input parsing/length caps and defense-in-depth ownership filter in `security-dal-and-auth.md`; scoped bulk-write RPC (`jsonb_to_recordset`, `created_by`/tenant predicate), Postgres → typed `ApiError` mapping, and explicit-column selection in `supabase-persistence-boundaries.md`.
- Component patterns: compound-provider split (`component-structure-composehooks.md`), explicit variants vs mode-discriminator (`state-placement.md`), localized Standard Schema → Mantine validator bridge (`forms-and-actions.md`).
- `Decision Gate`, `Common Failure Modes`, and `Verification Gate` sections in both skills (recommended structure).

### Changed

- **Renamed** `data-ownership-cache-tanstack.md` → `data-ownership-and-cache.md`; TanStack is now one row of the ownership table and the RSC hybrid-read section is trimmed. Update any external references to the old filename.
- Expanded skill `description` triggers (now start with `Use when `, ≤500 chars; added observability/error-reporting and notifications/loading-state keywords).
- Sharpened env guidance to a directive (eager validation by default; lazy only for untouched server-only values) with current Supabase key names + legacy fallbacks.
- Split `app/**` vs `ui/**` in the architecture layer table; clarified `updateTag` vs `revalidateTag(tag, 'max')` cache ownership.
- Telemetry abstracted behind infrastructure; Sentry capture awaits/flushes before serverless responses.

### Validation / tooling

- Frontmatter schema tightened to `name` + `description` only.
- `validate` enforces the `Use when ` prefix and ≤500-char descriptions; warns (does not fail) on missing gate sections.
- `sync-version` now keeps `package-lock.json` in sync with `version.json`.

### Removed

- Internal skill-authoring research (`docs/skill-patterns-research.md`) moved out of the published package.

## [1.1.0] - 2026-05-03

### Added

- Added architecture-first consolidated references: glossary, Clean Architecture boundaries, runtime/compile-time boundaries, security/DAL/auth, data ownership, backend service boundaries, Supabase persistence boundaries, and testing by layer.
- Added UI convention references for Server/Client boundary, component structure with `composeHooks`, forms/actions, state placement, and styling/i18n.

### Changed

- Reduced the reference corpus from 51 files to 14 focused decision files.
- Reframed both skills as architecture/convention contracts instead of Next.js, React, Supabase, Mantine, or TanStack documentation snapshots.
- Updated `nextjs-architecture/SKILL.md` to route by layer, boundary, data owner, service API, persistence, and test strategy.
- Updated `react-component-creator/SKILL.md` to route by UI boundary, file structure, forms/actions, state placement, styling, and i18n conventions.

### Removed

- Removed granular API-doc rules for Cache Components, parallel/intercepting routes, exact action APIs, webhook/idempotency details, Mantine styling, i18n APIs, and React hook basics. Consumers should fetch current official docs for syntax.

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
