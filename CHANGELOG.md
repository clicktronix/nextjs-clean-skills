# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

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
