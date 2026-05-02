# Cached Functions Need Stable Scoped Inputs

**Impact: HIGH**

Cached functions must be deterministic for their arguments and safe for their visibility scope.

Do:

- pass `userId`, `tenantId`, `locale`, filters, and pagination explicitly.
- place `'use cache'` inside the cached function.
- attach `cacheLife` and scoped `cacheTag` values.
- read request context outside the cached scope.

Do not:

- call `cookies()` or `headers()` inside cached functions.
- close over request-specific objects.
- cache personalized data under broad shared tags like `cacheTag('work-items')`.
- cache authorization decisions that depend on mutable session state.

**Incorrect (cached function reads request context):**

```ts
export async function listMyItems() {
  'use cache'
  const cookieStore = await cookies()
  return listItems(cookieStore.get('user_id')?.value)
}
```

**Correct (explicit identity and scoped tag):**

```ts
async function listItemsCached(userId) {
  'use cache'
  cacheTag(`work-items:user:${userId}`)
  return listItems(userId)
}
```

Reference: Next.js Cache Components stable inputs.
