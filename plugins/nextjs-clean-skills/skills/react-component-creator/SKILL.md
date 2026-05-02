---
name: react-component-creator
description: Use when creating or refactoring React components in Next.js 16, deciding between Server and Client Components, or wiring forms, tables, view hooks, composeHooks, Mantine, Valibot, state, styling, or i18n.
---

# React Component Creator

Use this skill for React UI work in a Next.js 16 codebase. Prefer target repository component docs and nearby components when they are stricter than this profile.

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
| Cross-component shared UI state  | React Context provider (Zustand only when Context is the measured bottleneck[^2])               |
| Global UI state (theme/locale)   | React Context provider                                                                          |
| Derived state                    | `useMemo` in `lib.ts`, or plain calculation in Server Components                                |

[^1]: TanStack Query is opt-in for realtime, polling, infinite scroll, optimistic updates, or when many islands must share the same async/server-state cache lifecycle. See [RSC Reads Default, TanStack Opt-In](../nextjs-architecture/references/data-rsc-default-tanstack-optin.md) and [Avoid TanStack Mutations When Reads Are RSC-Owned](../nextjs-architecture/references/data-tanstack-mutation-vs-revalidate-tag.md).
[^2]: See [Context First, Zustand Last](references/state-context-first-over-zustand.md). Default to Context with split providers; Zustand earns its place only with measured perf or middleware needs.

Do not put server data in `useState`, Context, or any client store. Do not use TanStack Query in Server Components.

## Reference Map

Boundaries:

- [Default To Server Components](references/boundary-default-server-component.md)
- [Keep Client Trees Minimal](references/boundary-use-client-minimal-tree.md)
- [No Client Hooks In RSC](references/boundary-no-hooks-in-rsc.md)
- [Server To Client Props Are Serializable](references/boundary-serializable-props.md)

State:

- [Use URL For Shareable State](references/state-url-for-shareable.md)
- [Server Data Via RSC Props](references/state-server-data-via-rsc-prop.md)
- [Page UI State In Feature-Local Hooks](references/state-page-ui-feature-local-hooks.md)
- [Context First, Zustand Last](references/state-context-first-over-zustand.md)
- [Use React 19 Optimistic State Deliberately](references/state-optimistic-react-19.md)
- [Do Not Derive State With Effects](references/state-no-derived-effects.md)

composeHooks:

- [composeHooks Only For Client Logic](references/compose-only-client-with-logic.md)
- [composeHooks Generic Order](references/compose-generic-order.md)
- [No Namespace Object Exports](references/compose-no-namespace-export.md)
- [No Barrel Index Files](references/compose-no-barrel-index.md)

Forms:

- [Progressive Forms Use Action State](references/forms-progressive-state-action.md)
- [Mirror Validation On Server](references/forms-server-validation-mirror.md)
- [Mantine + Valibot Through Standard Schema](references/forms-mantine-valibot-standard-schema.md)
- [Form Mutation Error Handling](references/forms-error-handling-mutation.md)
- [Server Actions Return Error Keys](references/forms-server-action-error-key.md)

Styling:

- [Mantine Props First](references/styling-mantine-props-first.md)
- [Avoid Inline Styles](references/styling-no-inline-except-dynamic.md)
- [CSS Modules For Custom Styling](references/styling-css-modules-for-custom.md)

i18n:

- [TranslationText In Client UI](references/i18n-translation-text-client-only.md)
- [Server-Side i18n Via Async Translations](references/i18n-server-side-via-get-translations.md)
- [Locale Cookie Seeded By Proxy](references/i18n-locale-cookie-via-proxy.md)

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
