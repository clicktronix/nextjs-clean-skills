---
name: react-component-creator
description: Use when creating or refactoring UI in a Next.js 16 App Router application; deciding Server vs Client boundaries, component ownership, direct Hook composition, form and action boundaries, state placement, styling, i18n, notifications, loading states, accessibility, or test ids.
---

# React Component Creator

Use this skill for UI structure decisions. Preserve the target project's component, schema, form,
styling, cache, notification, and i18n stack unless migration is requested. Fetch current React and
Next.js docs for exact APIs.

## Defaults

- Start with a Server Component.
- Add `'use client'` only for events, Hooks, refs, browser APIs, or browser-owned async lifecycle.
- Call Hooks directly from named components or named custom Hooks.
- Keep route-private UI under `app/<route>/_components`.
- Keep reusable capability UI under `modules/<capability>/ui` and publish it through `ui.ts`.
- Promote capability-neutral UI to `shared/ui` only after the shared-admission gate passes.
- Pass serializable values from RSC to Client Components.
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

Do not pass a Hook to `composeHooks`, a render prop, a provider, or another generic helper. React
requires Hooks to be called from components or Hooks, not passed as regular values.

Extract `WorkItemsView` when independent rendering tests or server reuse justify it. Keep it in the
same file while the component remains readable. A separate file is useful when file-level
`'use client'` would otherwise make a pure view client-only.

Do not add `memo`, `useMemo`, or `useCallback` by default. Keep them for a measured identity or
rerender requirement.

## Data And Mutations

- RSC reads call the capability's `rsc.ts` or trusted server surface directly.
- Browser-owned reads call the capability's `client.ts`, backed by `GET` or a stream.
- Client reads do not use Server Actions.
- UI commands import exact functions from capability `actions.ts`.
- Every action revalidates input, identity, role, and tenant on the server.
- Successful writes refresh the existing read owner.

## Forms And Feedback

- Client validation provides early feedback; server validation is authoritative.
- Pending state comes from the action lifecycle.
- Expected validation and conflict outcomes remain serializable action state.
- Field errors stay associated with their controls.
- Global failures use the product's semantic notification surface.
- Raw provider messages never become user copy.
- Unexpected failures are reported once at the action or channel boundary.

## Reference Map

- [Server/Client Boundary](references/server-client-boundary.md)
- [Component Structure](references/component-structure.md)
- [Forms And Actions](references/forms-and-actions.md)
- [State Placement](references/state-placement.md)
- [Styling And i18n](references/styling-and-i18n.md)
- [Notifications And Feedback](references/notifications-and-feedback.md)
- [Client Cache Lifecycle](../nextjs-architecture/references/caching/client-cache.md)

## Decision Gate

Before editing, classify:

```text
owner:             route | capability | shared UI
component:         Server | Client | split
server data:       RSC value | browser client surface | none
local state:       URL | form | component | focused provider | none
mutation:          capability action | Route Handler | none
runtime imports:   server-safe | browser-safe
verification:      type | lint | component | e2e | visual | accessibility
```

If the answer is "Client because it is easier," identify the event, Hook, ref, browser API, or
client lifecycle that actually requires it.

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

## Verification Gate

1. Confirm the smallest possible Client boundary.
2. Confirm every Hook call is direct, top-level, and visible to the Hooks linter.
3. Confirm server data has one owner and browser code imports no server surface.
4. Confirm loading, empty, success, expected failure, and unexpected failure states.
5. Verify field/error association, keyboard behavior, focus, and responsive layout.
6. Run the smallest relevant type, lint, component, e2e, and visual checks.
7. State any unverified behavior explicitly.
