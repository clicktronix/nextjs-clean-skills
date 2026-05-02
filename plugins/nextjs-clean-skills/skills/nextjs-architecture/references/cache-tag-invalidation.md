# Tag-Based Cache Invalidation

**Impact: HIGH**

Prefer tag invalidation over route invalidation when cached data has a known entity, user, tenant, or list scope.

Use:

- `revalidateTag(tag, 'max')` for stale-while-revalidate invalidation from Server Actions, Route Handlers, webhooks, and background refresh.
- `updateTag(tag)` inside Server Actions when the mutating user needs read-your-writes.
- `revalidatePath()` only when tags are unavailable or route-level invalidation is intentional.

Pair invalidation with readable `cacheLife` profiles. Presets are `default`, `seconds`, `minutes`, `hours`, `days`, `weeks`, and `max`; use custom profiles only when presets are too coarse.

**Incorrect (route invalidation by default):**

```ts
export async function POST() {
  revalidatePath('/blog')
  return Response.json({ ok: true })
}
```

**Correct (tag-based SWR from a route handler):**

```ts
export async function POST() {
  revalidateTag('posts', 'max')
  return Response.json({ ok: true })
}
```

Warnings:

- `updateTag()` and `refresh()` are Server Action-only. Do not call `updateTag()` from Route Handlers, use-cases, or outbound adapters.
- `expire` in custom `cacheLife` profiles must be longer than `revalidate`.
- Client-side router cache for prefetched links has a minimum stale time of 30 seconds; a shorter `stale` value can still behave as 30 seconds after prefetch.

Reference: Next.js `cacheLife`, `revalidateTag`, and `updateTag` API docs.
