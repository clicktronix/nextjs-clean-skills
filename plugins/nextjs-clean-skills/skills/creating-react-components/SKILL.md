---
name: creating-react-components
description: >-
  Use when creating or refactoring Next.js 16 App Router UI: Server/Client boundaries, Hooks, state,
  forms and actions, loading and errors, styling, i18n, feedback, accessibility, or tests. Chooses the
  Server/Client split, state owner, mutation channel, and pending/failure surfaces.
---

# Creating React Components

Use this skill for UI structure. Keep the project's existing UI stack unless migration is requested.
Fetch current React and Next.js docs for exact APIs.

## Defaults

- Start with a Server Component.
- Add `'use client'` only for events, client-only Hooks, refs, browser APIs, or browser-owned async
  lifecycle.
- Call Hooks directly from named components or named custom Hooks.
- Keep route-private UI under `app/<route>/_components`.
- Keep reusable capability UI under `modules/<capability>/ui` and publish it through `ui.ts`.
- Promote capability-neutral UI to `shared/ui` only when at least two capabilities need identical
  meaning and lifecycle, no capability naturally owns it, coordination is cheaper than duplication,
  and a maintainer plus demotion condition are named.
- Pass React-serializable props from RSC to Client Components.
- Use a dedicated top-level `'use server'` module for UI commands.

For a non-obvious split, read [Server/Client Boundary](references/server-client-boundary.md) or
[Component Structure](references/component-structure.md).

## State Placement

| State | Owner |
| --- | --- |
| initial server-rendered data | RSC values |
| realtime, polling, optimistic, infinite, or shared browser cache | capability `client/` |
| URL-shareable filters, tabs, or paging | URL |
| controlled form state and field errors | form boundary |
| component-local interaction | owning component or named Hook |
| compound component state | focused colocated provider |
| global theme or locale | application provider |
| identity and tenant | server request context |
| derived value | calculate; do not store |

Do not copy server-owned data into `useState`, Context, or an external store unless it is an
explicit editable draft. Do not use a client cache in a Server Component.

For state or browser cache ownership, read [State Placement](references/state-placement.md) or
[Client Cache Lifecycle](../designing-architecture/references/caching/client-cache.md).

## Component Structure

Call named Hooks directly from named components or named custom Hooks. Do not pass Hooks as values
or hide them in higher-order helpers; React and the Hooks linter must see the call.

Extract `WorkItemsView` when independent rendering tests or server reuse justify it, and keep both
in one file while that stays readable.

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
- `error.tsx` is a Client Component. Use its installed `ErrorInfo`: `reset` retries a temporary
  render failure; in Next.js 16.2+, prefer `unstable_retry` when recovery must refetch RSC data.
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
- Unexpected failures are reported once at the action or channel boundary.

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

If the answer is "Client because it is easier," name the event, Hook, ref, browser API, or client
lifecycle that requires it.

For verification details, read [Component Testing](references/component-testing.md).
