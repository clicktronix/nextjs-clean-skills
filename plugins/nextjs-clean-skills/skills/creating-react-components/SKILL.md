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
- Promote capability-neutral UI to `shared/ui` only after the shared-admission gate passes.
- Pass React-serializable props from RSC to Client Components.
- Use a dedicated top-level `'use server'` module for UI commands.

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

## Component Structure

For a logic-bearing Client Component, call its Hook directly:

```tsx
'use client'

export function WorkItems(props: WorkItemsProps) {
  const viewProps = useWorkItemsProps(props)
  return <WorkItemsView {...viewProps} />
}
```

Do not pass Hooks as values or wrap them in higher-order Hooks. Call named Hooks directly so the
Hooks linter and React can analyze them.

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

## Forms And Feedback

- Client validation provides early feedback; server validation is authoritative.
- Action props manage their transition. Wrap a manual `useActionState` dispatch in `startTransition`.
- Expected validation and conflict outcomes remain serializable action state.
- Field errors stay associated with their controls.
- Non-field action feedback uses the product's semantic inline or notification surface.
- Raw provider messages never become user copy.
- Unexpected failures are reported once at the action or channel boundary.

## Reference Map

- [Server/Client Boundary](references/server-client-boundary.md)
- [Component Structure](references/component-structure.md)
- [Forms And Actions](references/forms-and-actions.md)
- [State Placement](references/state-placement.md)
- [Loading And Errors](references/loading-and-errors.md)
- [Styling, Text, And Accessibility](references/styling-and-i18n.md)
- [Notifications And Feedback](references/notifications-and-feedback.md)
- [Component Testing](references/component-testing.md)
- [Client Cache Lifecycle](../designing-nextjs-capabilities/references/caching/client-cache.md)
- [Failure Ownership](../designing-nextjs-capabilities/references/errors/failure-at-the-boundary.md)
- [Error Taxonomy](../designing-nextjs-capabilities/references/errors/error-taxonomy.md)

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

## Common Failure Modes

- Adding `'use client'` above a subtree that could stay server-rendered.
- Passing a Hook as a value through a generic composition helper.
- Hiding server data in local state, Context, or a broad store.
- Using Server Actions for browser reads.
- Importing `server.ts`, `rsc.ts`, or `server/**` from browser code.
- Promoting route-private UI before a real second consumer exists.
- Creating broad barrel or interface files for one local type.
- Trusting client validation, identity, or tenant values.
- Hardcoding user-facing copy outside the project i18n system.
- Adding memoization without a measured reason.
- Wrapping a whole page in one pending boundary instead of the slow region.
- Throwing an expected outcome at an error boundary, or reporting it a second time there.
- Leaving an interactive element without an accessible name, or removing its focus indicator.
- Selecting elements in tests by class or test id when a role or label already identifies them.
