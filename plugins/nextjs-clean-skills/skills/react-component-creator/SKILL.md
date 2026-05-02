---
name: react-component-creator
description: Use when creating or refactoring UI in a Next.js 16 Hybrid Clean Architecture app, deciding Server vs Client boundary, component file structure, composeHooks usage, form/action boundary, state placement, styling, or i18n conventions.
---

# React Component Creator

Use this skill for UI structure decisions in a Next.js 16 codebase. It is a project convention guide, not React, Mantine, Valibot, or i18n API documentation. For exact API syntax, fetch current official docs.

## Defaults

- Start with a Server Component.
- Add `'use client'` only for event handlers, hooks, refs, browser APIs, opt-in TanStack Query, Mantine forms, or client i18n hooks.
- Client Components with logic use `composeHooks(View)(useProps)`.
- `index.tsx` contains the View and exported component; it is not a barrel file.
- `lib.ts` contains view-model and hook logic.
- `interfaces.ts` is used when types are shared or exceed five local definitions.
- User-facing text goes through project i18n.
- Styling prefers Mantine props, then CSS Modules.

## State Placement

| State kind                       | Default location                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| Read-heavy server data           | Server Component -> server-only DAL/read use-case -> serializable props                         |
| Client-interactive server data   | RSC props by default; `src/ui/server-state/<feature>/` with TanStack Query only when opt-in[^1] |
| Controlled form state            | Mantine `useForm` in `lib.ts`                                                                   |
| URL-shareable state              | `useSearchParams` + `router.replace` (filters, tabs, paging that links should preserve)         |
| Component-local state            | hook in `lib.ts`                                                                                |
| Page UI state (one route)        | feature-local `useState`/`useReducer` hook                                                      |
| Cross-component shared UI state  | Start with Context; use Zustand only for measured hot updates or required middleware[^2]         |
| Global UI state (theme/locale)   | React Context provider                                                                          |
| Derived state                    | `useMemo` in `lib.ts`, or plain calculation in Server Components                                |

[^1]: See [Data Ownership, Cache, And TanStack](../nextjs-architecture/references/data-ownership-cache-tanstack.md).
[^2]: See [State Placement](references/state-placement.md). Static config (theme/locale/auth status) uses Context; dynamic state starts local/Context and moves to Zustand only when profiling or middleware needs justify it.

Do not put server data in `useState`, Context, or any client store. Do not use TanStack Query in Server Components.

## Reference Map

- [Server/Client Boundary](references/server-client-boundary.md)
- [Component Structure And composeHooks](references/component-structure-composehooks.md)
- [Forms And Actions](references/forms-and-actions.md)
- [State Placement](references/state-placement.md)
- [Styling And i18n](references/styling-and-i18n.md)

## Workflow

1. Decide Server vs Client before writing files.
2. Place route-local UI under the segment `_internal/ui`; shared UI under `src/ui/components`.
3. For Server Components, fetch through server-only DAL/read entrypoints and pass serializable props.
4. For Client Components with logic, split View and `use<Component>Props` with `composeHooks`.
5. Keep TanStack Query, optimistic updates, realtime, and invalidation in `ui/server-state`.
6. Keep Server Action wrappers feature-local only when TanStack Query semantics are unnecessary.
7. Add stable `data-testid` to e2e-critical interactive controls.

## Final Checklist

- Server/Client boundary is minimal and intentional.
- Client logic lives in `lib.ts`, not the View.
- `composeHooks` is used only where it adds value.
- No `interface`, classes, `any`, inline styles, namespace exports, or barrel exports.
- Read-heavy server data arrives through RSC props.
- Client-interactive server data lives in `ui/server-state`.
- Forms validate on the client for UX and on the server for authority.
- User-facing text uses the project i18n layer.
