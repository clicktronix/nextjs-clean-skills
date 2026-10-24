---
name: creating-react-components
description: >-
  Use when creating or refactoring a component, page UI or form in a Next.js 16 App Router project.
  Structures Server vs Client Components, Hooks, component state, forms and the Server Action calls
  they make, loading and error surfaces, styling, i18n, accessibility and component tests. Not for
  deciding which capability owns a mutation or which channel carries it (use designing-architecture),
  nor for moving a repository onto capability-first (use migrating-architecture).
---

# Creating React Components

Use this skill for UI structure. Keep the project's existing UI stack unless migration is requested.
For exact APIs, read the documentation of the React and Next.js versions the project has installed.

Normative source: [runtime boundaries](../../docs/runtime-boundaries.md) and
[frontend composition](../../docs/frontend-composition.md). The references below explain how to
apply them; where a reference disagrees, the normative source wins. Each document opens with a
decision-to-section table.

## Defaults

The names `modules/<capability>/ui`, `ui.ts`, `rsc.ts`, `client.ts`, `actions.ts` and `shared/ui`
apply only in a repository that has adopted the capability-first contract or asked to migrate to it.
Elsewhere, put the component where its neighbours live, call the repository's existing data and
action modules, and introduce no `modules/`, `shared/ui` or root surface. What holds in any App
Router project: the Server/Client split, state ownership, and the action shape.

- Start with a Server Component.
- Add `'use client'` only for events, client-only Hooks, refs, browser APIs, or browser-owned async
  lifecycle.
- Call Hooks directly from named components or named custom Hooks.
- Keep route-private UI under `app/<route>/_components`.
- Keep reusable capability UI under `modules/<capability>/ui` and publish it through `ui.ts`.
- Promote capability-neutral UI to `shared/ui` only through
  [Shared Admission](../../docs/architecture-contract.md#shared-admission).
- Pass React-serializable props from RSC to Client Components.
- Use a dedicated top-level `'use server'` module for UI commands.

For a non-obvious split, read [Server/Client Boundary](references/server-client-boundary.md) or
[Component Structure](references/component-structure.md).

## State Placement

[Frontend Composition § State Placement](../../docs/frontend-composition.md#state-placement) owns the
table of state kinds and their owners. Do not use a client cache in a Server Component.

For state or browser cache ownership, read [State Placement](references/state-placement.md) or
[Client Cache Lifecycle](../designing-architecture/references/caching/client-cache.md).

## Component Structure

Extract `WorkItemsView` when independent rendering tests or server reuse justify it. It shares its
controller's `'use client'` file only while that stays readable and no Server Component reuses it;
otherwise give it a file without the directive.

Do not add `memo`, `useMemo`, or `useCallback` by default. Keep them for a measured identity or
rerender requirement.

## Data And Mutations

- RSC reads call the capability's `rsc.ts` or trusted server surface directly.
- Browser-owned reads call the capability's `client.ts`, backed by `GET` or a stream.
- Client reads do not use Server Actions.
- UI commands import exact functions from capability `actions.ts`.
- Every action validates its input and re-derives applicable identity, role, and tenant on the
  server.
- Successful writes update or invalidate affected read owners.

For mutation mechanics, read [Forms And Actions](references/forms-and-actions.md). For failure
ownership, read [Failure Ownership](../designing-architecture/references/errors/failure-at-the-boundary.md)
or [Error Taxonomy](../designing-architecture/references/errors/error-taxonomy.md).

## Pending And Failure Surfaces

- A segment's `loading.tsx` streams a fallback for its page and children. A root-level one is coarse:
  without nested boundaries, the covered content reveals as one unit.
- Use inline `<Suspense>` around a region that is genuinely slower than its siblings, not around
  every read.
- `error.tsx` is a Client Component. Retry that must refetch RSC data calls `unstable_retry()`, not
  `reset()`; version caveats and `unstable_catchError` are in the reference below.
- `global-error.tsx` is the root-only last resort.
- Render expected outcomes as states or deliberate framework control flow. Generic error boundaries
  are for unexpected exceptions.
- Match a placeholder to the final layout's main geometry when that shape is known.

For boundary details, read [Loading And Errors](references/loading-and-errors.md).

## Forms And Feedback

- Client validation provides early feedback; server validation is authoritative.
- Action props manage their transition. Wrap a manual `useActionState` dispatch in `startTransition`.
- Expected validation and conflict outcomes remain serializable action state.
- Field errors stay associated with their controls.
- Non-field action feedback uses the product's semantic inline or notification surface.
- Raw provider messages never become user copy.
- Unexpected failures have one capture owner; see
  [Runtime Boundaries § Failures And Reporting](../../docs/runtime-boundaries.md#failures-and-reporting).

For presentation details, read [Styling, Text, And Accessibility](references/styling-and-i18n.md) or
[Notifications And Feedback](references/notifications-and-feedback.md).

## Decision Gate

For a non-trivial change, classify:

```text
owner:             route | capability | shared UI
component:         Server | Client | split
server data:       RSC value | browser client surface | none
local state:       URL | form | component | focused provider | none
mutation:          capability action | Route Handler | none
runtime imports:   server-safe | browser-safe
verification:      type | lint | component | e2e | visual | accessibility
```

Defaults when the change does not force otherwise: route-private owner, Server Component, RSC
value, no local state, no mutation, server-safe imports, component-level verification. Each
departure names its reason.

For verification details, read [Component Testing](references/component-testing.md).
