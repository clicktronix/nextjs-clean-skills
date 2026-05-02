# Use `revalidateTag(tag, 'max')`

**Impact: HIGH**

Use `revalidateTag(tag, 'max')` when invalidation can be stale-while-revalidate. Pair tag invalidation with explicit `cacheLife` profiles so cache behavior is readable at the call site.

Good contexts:

- route handlers
- webhooks
- background refresh
- cross-user data updates where immediate read-your-writes is not required

Preset profiles:

- `default`
- `seconds`
- `minutes`
- `hours`
- `days`
- `weeks`
- `max`

Prefer a preset when it matches the product behavior. Use a custom profile only when preset semantics are too coarse.

**Incorrect (no profile, route-level invalidation used as the default):**

```ts
export async function webhook() {
  revalidatePath('/blog')
}
```

**Correct (named profile plus tag-based stale-while-revalidate):**

```ts
// next.config.ts
export default {
  cacheComponents: true,
  cacheLife: {
    editorial: { stale: 600, revalidate: 3600, expire: 86400 },
  },
}
```

```ts
export async function getPublishedPosts() {
  'use cache'
  cacheLife('editorial')
  cacheTag('posts')
  return listPublishedPosts()
}
```

```ts
export async function POST() {
  revalidateTag('posts', 'max')
  return Response.json({ ok: true })
}
```

Warning:

- `expire` must be longer than `revalidate`.
- Client-side router cache for prefetched links has a minimum stale time of 30 seconds; a shorter `stale` value can still behave as 30 seconds after prefetch.

Avoid old one-argument tag revalidation in new code. Keep `revalidatePath()` as a fallback for route-level invalidation when tags are not available.

Reference: Next.js `cacheLife` and `revalidateTag` API docs.
