---
name: react-component-creator
description: Use when creating or refactoring UI in a Next.js 16 Hybrid Clean Architecture app; deciding Server vs Client boundaries, component file structure, composeHooks usage, form/action boundaries, state placement, styling, i18n, notifications, loading states, or test ids.
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
| Cross-component shared UI state  | Start with Context; use Zustand only for measured hot updates or required store middleware[^2]   |
| Global UI state (theme/locale)   | React Context provider                                                                          |
| Derived state                    | `useMemo` in `lib.ts`, or plain calculation in Server Components                                |

[^1]: See [Data Ownership And Cache](../nextjs-architecture/references/data-ownership-and-cache.md).
[^2]: See [State Placement](references/state-placement.md). Static config (theme/locale/auth status) uses Context; dynamic state starts local/Context and moves to Zustand only when profiling or store middleware needs justify it.

Do not put server data in `useState`, Context, or any client store. Do not use TanStack Query in Server Components.

## Reference Map

- [Server/Client Boundary](references/server-client-boundary.md)
- [Component Structure And composeHooks](references/component-structure-composehooks.md)
- [Forms And Actions](references/forms-and-actions.md)
- [State Placement](references/state-placement.md)
- [Styling And i18n](references/styling-and-i18n.md)
- [Notifications And Feedback](references/notifications-and-feedback.md)

## Workflow

1. Decide Server vs Client before writing files.
2. Classify data and state ownership before adding hooks or stores.
3. Place route-local UI under the segment `_internal/ui`; shared UI under `src/ui/components`.
4. For Server Components, fetch through server-only DAL/read entrypoints and pass serializable props.
5. For Client Components with logic, split View and `use<Component>Props` with `composeHooks`.
6. Keep TanStack Query, optimistic updates, realtime, and invalidation in `ui/server-state`.
7. Keep Server Action wrappers feature-local only when TanStack Query semantics are unnecessary.
8. Add stable `data-testid` to e2e-critical interactive controls.

## Decision Gate

Before code changes, write or hold this classification:

```text
component boundary: Server | Client | split
server data owner: RSC props | TanStack Query | none
local state owner: URL | component hook | route hook | Context | justified external store
mutation boundary: Server Action | Route Handler | none
files: index.tsx | lib.ts | interfaces.ts | styles.module.css | server-state
```

If the answer is "Client because it is easier," re-check the trigger for hooks, events, refs, browser APIs, or client server-state.

## Common Failure Modes

- Adding `'use client'` to a parent that could stay server-rendered.
- Putting server-owned data in local state, Context, or Zustand.
- Mixing View markup and hook/business logic in `index.tsx`.
- Creating barrel exports or broad `interfaces.ts` files for one-off local types.
- Using TanStack Query for a read that does not need client lifecycle semantics.

## Verification Gate

Before reporting success:

1. Confirm the smallest possible Client boundary.
2. Confirm server data remains serializable and is not stored as client UI state.
3. Run the smallest relevant type, lint, component, or e2e check available in the target repo.
4. State any visual, i18n, or accessibility behavior not verified.

## Final Checklist

- Server/Client boundary is minimal and intentional.
- Client logic lives in `lib.ts`, not the View.
- `composeHooks` is used only where it adds value.
- No `interface`, classes, `any`, inline styles, namespace exports, or barrel exports.
- Read-heavy server data arrives through RSC props.
- Client-interactive server data lives in `ui/server-state`.
- Forms validate on the client for UX and on the server for authority.
- User-facing text uses the project i18n layer.
